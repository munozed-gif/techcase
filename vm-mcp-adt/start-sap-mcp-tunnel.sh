#!/bin/bash
# SAP MCP Server — cloudflared tunnel manager
#
# Manages the public cloudflared tunnel for the sap-mcp Node.js server
# (port 3100, managed by systemd sap-mcp.service) and registers the
# tunnel URL to Supabase vm_tunnel_registry so the platform can find it.
#
# Also polls Supabase for remote restart commands sent from the
# "Restart VM" button in the TechCase platform UI.
#
# Requirements:
#   - cloudflared   (sudo snap install cloudflared)
#   - curl, jq
#   - sap-mcp service running on port 3100
#
# Credentials:
#   Create $SCRIPT_DIR/.env (or /etc/vm-mcp-adt.env) with:
#     SUPABASE_URL=https://...
#     SUPABASE_SERVICE_KEY=...
#
# Usage:
#   chmod +x start-sap-mcp-tunnel.sh
#   nohup bash ./start-sap-mcp-tunnel.sh > /tmp/sap-mcp-tunnel.log 2>&1 &
#
# Recommended — run as systemd service:
#   sudo cp sap-mcp-tunnel.service.example /etc/systemd/system/sap-mcp-tunnel.service
#   sudo systemctl daemon-reload
#   sudo systemctl enable --now sap-mcp-tunnel

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT=3100
CF_LOG="/tmp/cloudflared-sap-mcp.log"

echo "=== SAP MCP Tunnel Manager (port $PORT) ==="
echo ""

# ── Check dependencies ─────────────────────────────────────────
if ! command -v cloudflared &>/dev/null; then
  echo "[error] cloudflared not found. Install: sudo snap install cloudflared"
  exit 1
fi

# ── Load Supabase credentials ──────────────────────────────────
SUPABASE_URL=""
SUPABASE_SERVICE_KEY=""
if [ -f "$SCRIPT_DIR/.env" ]; then
  SUPABASE_URL=$(grep '^SUPABASE_URL=' "$SCRIPT_DIR/.env" | head -1 | cut -d'=' -f2-)
  SUPABASE_SERVICE_KEY=$(grep '^SUPABASE_SERVICE_KEY=' "$SCRIPT_DIR/.env" | head -1 | cut -d'=' -f2-)
  echo "[config] Loaded Supabase credentials from .env"
elif [ -f "/etc/vm-mcp-adt.env" ]; then
  SUPABASE_URL=$(grep '^SUPABASE_URL=' "/etc/vm-mcp-adt.env" | head -1 | cut -d'=' -f2-)
  SUPABASE_SERVICE_KEY=$(grep '^SUPABASE_SERVICE_KEY=' "/etc/vm-mcp-adt.env" | head -1 | cut -d'=' -f2-)
  echo "[config] Loaded Supabase credentials from /etc/vm-mcp-adt.env"
fi

if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_KEY" ]; then
  echo "[warn] No Supabase credentials — tunnel URL won't be registered and remote restart won't work"
fi

CF_PID=""
TUNNEL_URL=""

# ── Start cloudflared tunnel ───────────────────────────────────
start_tunnel() {
  pkill -f "cloudflared tunnel.*$PORT" 2>/dev/null || true
  sleep 1
  rm -f "$CF_LOG"
  echo "[cloudflared] Starting quick tunnel → localhost:$PORT ..."
  cloudflared tunnel --url "http://localhost:$PORT" > "$CF_LOG" 2>&1 &
  CF_PID=$!

  TUNNEL_URL=""
  for i in $(seq 1 30); do
    TUNNEL_URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$CF_LOG" 2>/dev/null | head -1)
    [ -n "$TUNNEL_URL" ] && break
    sleep 2
  done

  if [ -z "$TUNNEL_URL" ]; then
    echo "[error] Could not get tunnel URL after 60s — check $CF_LOG"
    return 1
  fi

  echo "[cloudflared] Tunnel URL: $TUNNEL_URL"
}

# ── Register tunnel URL in vm_tunnel_registry ──────────────────
register_url() {
  local url="$1"
  if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_KEY" ]; then return; fi
  local status
  status=$(curl -s -o /tmp/supabase-vm-reg.json -w "%{http_code}" \
    -X POST "${SUPABASE_URL}/rest/v1/vm_tunnel_registry" \
    -H "apikey: ${SUPABASE_SERVICE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" \
    -H "Content-Type: application/json" \
    -H "Prefer: resolution=merge-duplicates" \
    -d "{\"tunnel_url\":\"${url}\"}")
  if [ "$status" = "200" ] || [ "$status" = "201" ] || [ "$status" = "204" ]; then
    echo "[config] URL registered in Supabase ✓ (HTTP $status)"
  else
    echo "[config] Supabase registration failed (HTTP $status): $(cat /tmp/supabase-vm-reg.json 2>/dev/null)"
  fi
}

# ── Cleanup ────────────────────────────────────────────────────
cleanup() {
  echo ""
  echo "[stop] Stopping tunnel and monitor..."
  kill "$CF_PID" 2>/dev/null || true
  kill "$MONITOR_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# ── Start initial tunnel ───────────────────────────────────────
start_tunnel
register_url "$TUNNEL_URL"

echo ""
echo "=============================================="
echo "  SAP MCP Tunnel running"
echo "  URL: $TUNNEL_URL"
echo "  Registered in Supabase vm_tunnel_registry"
echo "  Remote restart: use 'Restart VM' in the UI"
echo "=============================================="
echo ""

SCRIPT_START_EPOCH=$(date -u +%s)

# ── Background restart-command monitor ────────────────────────
monitor_restart() {
  local last_handled_ts="$SCRIPT_START_EPOCH"
  while true; do
    sleep 30
    [ -z "$SUPABASE_URL" ] && continue
    local raw
    raw=$(curl -sf \
      "${SUPABASE_URL}/rest/v1/system_settings?key=eq.vm_restart_requested&select=value" \
      -H "apikey: ${SUPABASE_SERVICE_KEY}" \
      -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" 2>/dev/null || echo "")
    # Extract ts from JSON value like [{"value":{"ts":1234567890123}}]
    local req_ts
    req_ts=$(echo "$raw" | grep -o '"ts":[0-9]*' | grep -o '[0-9]*' | head -1)
    if [ -n "$req_ts" ]; then
      local req_epoch=$(( req_ts / 1000 ))
      if [ "$req_epoch" -gt "$last_handled_ts" ] 2>/dev/null; then
        echo "[restart] Remote restart command received (ts=$req_ts) — restarting tunnel..."
        kill "$CF_PID" 2>/dev/null || true
        start_tunnel
        register_url "$TUNNEL_URL"
        last_handled_ts=$(date -u +%s)
        echo "[restart] Tunnel restarted: $TUNNEL_URL"
      fi
    fi
  done
}

monitor_restart &
MONITOR_PID=$!

# ── Keep alive: restart tunnel if cloudflared dies ─────────────
while true; do
  sleep 60
  if ! kill -0 "$CF_PID" 2>/dev/null; then
    echo "[watchdog] cloudflared exited — restarting tunnel..."
    start_tunnel
    register_url "$TUNNEL_URL"
  fi
done

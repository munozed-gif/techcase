#!/bin/bash
# ABAP ADT Bridge — VM startup script (Platform VPN mode)
#
# Chain: Platform → Supabase queue → THIS script (VM) → openfortivpn → SAP
#
# Requirements:
#   - Node.js 18+      (node --version)
#   - cloudflared      (sudo snap install cloudflared)
#   - openfortivpn     managed by sap-mcp-server on this VM
#   - mcp-abap-abap-adt-api cloned in the parent folder (auto-cloned if missing)
#
# Supabase credentials:
#   Create $SCRIPT_DIR/.env (or /etc/vm-mcp-adt.env) with:
#     SUPABASE_URL=https://...
#     SUPABASE_SERVICE_KEY=...
#
# Usage (manual):
#   chmod +x start-vm.sh
#   ./start-vm.sh
#
# Usage (systemd — recommended):
#   sudo cp systemd.service.example /etc/systemd/system/vm-mcp-adt.service
#   # Edit WorkingDirectory and EnvironmentFile paths in the service file
#   sudo systemctl daemon-reload
#   sudo systemctl enable --now vm-mcp-adt

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARENT_DIR="$(dirname "$SCRIPT_DIR")"
PORT=${PORT:-3101}
CF_LOG="/tmp/cloudflared-adt-bridge.log"

echo "=== ABAP ADT Bridge — VM Platform VPN mode ==="
echo ""

# ── Check dependencies ─────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo "[error] Node.js not found. Install:"
  echo "        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
  echo "        sudo apt-get install -y nodejs"
  exit 1
fi

if ! command -v cloudflared &>/dev/null; then
  echo "[error] cloudflared not found. Install:"
  echo "        sudo snap install cloudflared"
  echo "        # or: wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb && sudo dpkg -i cloudflared-linux-amd64.deb"
  exit 1
fi

# ── Ensure mcp-abap-abap-adt-api is built ─────────────────────
ADT_API_DIR="$PARENT_DIR/mcp-abap-abap-adt-api"
if [ ! -d "$ADT_API_DIR/dist" ]; then
  if [ ! -d "$ADT_API_DIR" ]; then
    echo "[setup] Cloning mcp-abap-abap-adt-api..."
    git clone https://github.com/mario-andreschak/mcp-abap-abap-adt-api.git "$ADT_API_DIR"
  fi
  echo "[setup] Building mcp-abap-abap-adt-api..."
  (cd "$ADT_API_DIR" && npm install && npm run build)
fi

# ── Ensure mcp-abap-adt (read-only) is built ──────────────────
ADT_RO_DIR="$PARENT_DIR/mcp-abap-adt"
if [ ! -d "$ADT_RO_DIR/dist" ]; then
  if [ ! -d "$ADT_RO_DIR" ]; then
    echo "[setup] Cloning mcp-abap-adt..."
    git clone https://github.com/mario-andreschak/mcp-abap-adt.git "$ADT_RO_DIR"
  fi
  echo "[setup] Building mcp-abap-adt..."
  (cd "$ADT_RO_DIR" && npm install && npm run build)
fi

# ── Install bridge dependencies ────────────────────────────────
cd "$SCRIPT_DIR"
if [ ! -d node_modules ]; then
  echo "[setup] Installing bridge dependencies..."
  npm install
fi

# ── Kill any leftover processes ────────────────────────────────
pkill -f "cloudflared tunnel.*$PORT" 2>/dev/null || true
fuser -k ${PORT}/tcp 2>/dev/null || true
sleep 1

# ── Start cloudflared quick tunnel ────────────────────────────
echo "[cloudflared] Starting quick tunnel → localhost:$PORT ..."
rm -f "$CF_LOG"
cloudflared tunnel --url "http://localhost:$PORT" > "$CF_LOG" 2>&1 &
CF_PID=$!

# Wait for tunnel URL (up to 60s)
TUNNEL_URL=""
for i in $(seq 1 30); do
  TUNNEL_URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$CF_LOG" 2>/dev/null | head -1)
  [ -n "$TUNNEL_URL" ] && break
  sleep 2
done

if [ -z "$TUNNEL_URL" ]; then
  echo "[error] Could not get tunnel URL from cloudflared after 60s."
  echo "        Check $CF_LOG for details."
  kill $CF_PID 2>/dev/null
  exit 1
fi

echo ""
echo "=============================================="
echo "  ADT Bridge running on VM!"
echo ""
echo "  Tunnel URL: $TUNNEL_URL"
echo ""
echo "  This URL is auto-registered in Supabase."
echo "  The platform reads it fresh on each run."
echo "  VPN is managed by sap-mcp-server (port 3100)."
echo "=============================================="
echo ""

# ── Cleanup on exit ────────────────────────────────────────────
cleanup() {
  echo ""
  echo "[stop] Stopping ADT bridge and cloudflared tunnel..."
  kill $CF_PID 2>/dev/null || true
}
trap cleanup EXIT INT TERM

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

# ── Register tunnel URL in Supabase (PATCH first, INSERT if new) ──
if [ -n "$SUPABASE_URL" ] && [ -n "$SUPABASE_SERVICE_KEY" ]; then
  echo "[config] Registering tunnel URL in Supabase..."
  AUTH_HEADERS=(-H "apikey: ${SUPABASE_SERVICE_KEY}" -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" -H "Content-Type: application/json")
  HTTP_STATUS=$(curl -s -o /tmp/supabase-reg.json -w "%{http_code}" \
    -X PATCH "${SUPABASE_URL}/rest/v1/system_settings?key=eq.adt_bridge_tunnel_url" \
    "${AUTH_HEADERS[@]}" \
    -d "{\"value\":\"${TUNNEL_URL}\"}")
  if [ "$HTTP_STATUS" = "200" ] || [ "$HTTP_STATUS" = "204" ]; then
    echo "[config] Tunnel URL updated in Supabase ✓ (HTTP $HTTP_STATUS)"
  else
    HTTP_STATUS=$(curl -s -o /tmp/supabase-reg.json -w "%{http_code}" \
      -X POST "${SUPABASE_URL}/rest/v1/system_settings" \
      "${AUTH_HEADERS[@]}" \
      -d "{\"key\":\"adt_bridge_tunnel_url\",\"value\":\"${TUNNEL_URL}\"}")
    if [ "$HTTP_STATUS" = "200" ] || [ "$HTTP_STATUS" = "201" ]; then
      echo "[config] Tunnel URL registered in Supabase ✓ (HTTP $HTTP_STATUS)"
    else
      echo "[config] Supabase registration failed (HTTP $HTTP_STATUS): $(cat /tmp/supabase-reg.json 2>/dev/null)"
    fi
  fi
else
  echo "[config] No Supabase creds found — tunnel URL won't auto-register"
  echo "         Create .env in this folder with SUPABASE_URL and SUPABASE_SERVICE_KEY"
fi

# ── Start the ADT bridge ───────────────────────────────────────
export SUPABASE_URL
export SUPABASE_SERVICE_KEY
PORT=$PORT node server.js

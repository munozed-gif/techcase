#!/bin/bash
# ABAP ADT Bridge — local laptop startup script (User VPN mode)
#
# Chain: Platform → Cloudflare tunnel → THIS script (laptop) → FortiClient VPN → SAP
#
# Requirements:
#   - Node.js 18+      (node --version)
#   - cloudflared      (brew install cloudflared)
#   - FortiClient VPN  connected before running SAP checks in the platform
#   - mcp-abap-abap-adt-api cloned in the parent folder (auto-cloned if missing)
#
# Usage:
#   chmod +x start-local.sh
#   ./start-local.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARENT_DIR="$(dirname "$SCRIPT_DIR")"
PORT=${PORT:-3101}
CF_LOG="/tmp/cloudflared-adt-bridge.log"

echo "=== ABAP ADT Bridge — local laptop mode ==="
echo ""

# ── Check dependencies ─────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo "[error] Node.js not found. Install from https://nodejs.org"
  exit 1
fi

if ! command -v cloudflared &>/dev/null; then
  echo "[error] cloudflared not found. Install with:"
  echo "        brew install cloudflared"
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
lsof -ti:$PORT 2>/dev/null | xargs kill -9 2>/dev/null || true
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
echo "  ADT Bridge running on your laptop!"
echo ""
echo "  Tunnel URL: $TUNNEL_URL"
echo ""
echo "  Paste this URL into the platform:"
echo "  SAP Config → ADT Bridge URL"
echo "=============================================="
echo ""

# ── Cleanup on exit ────────────────────────────────────────────
cleanup() {
  echo ""
  echo "[stop] Stopping ADT bridge and cloudflared tunnel..."
  kill $CF_PID 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# ── Load Supabase credentials (for auto-registering tunnel URL) ─
# Read each key as a single line from the env file to avoid line-wrap corruption
SUPABASE_URL=""
SUPABASE_SERVICE_KEY=""
if [ -f "$HOME/.adt-bridge.env" ]; then
  SUPABASE_URL=$(grep '^SUPABASE_URL=' "$HOME/.adt-bridge.env" | head -1 | cut -d'=' -f2-)
  SUPABASE_SERVICE_KEY=$(grep '^SUPABASE_SERVICE_KEY=' "$HOME/.adt-bridge.env" | head -1 | cut -d'=' -f2-)
  echo "[config] Loaded Supabase credentials from ~/.adt-bridge.env"
elif [ -f "$SCRIPT_DIR/.env" ]; then
  SUPABASE_URL=$(grep '^SUPABASE_URL=' "$SCRIPT_DIR/.env" | head -1 | cut -d'=' -f2-)
  SUPABASE_SERVICE_KEY=$(grep '^SUPABASE_SERVICE_KEY=' "$SCRIPT_DIR/.env" | head -1 | cut -d'=' -f2-)
  echo "[config] Loaded Supabase credentials from .env"
fi

# ── Register tunnel URL via curl (more reliable than Node https.request) ──
if [ -n "$SUPABASE_URL" ] && [ -n "$SUPABASE_SERVICE_KEY" ]; then
  echo "[config] Registering tunnel URL in Supabase..."
  HTTP_STATUS=$(curl -s -o /tmp/supabase-reg.json -w "%{http_code}" \
    -X POST "${SUPABASE_URL}/rest/v1/system_settings" \
    -H "apikey: ${SUPABASE_SERVICE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" \
    -H "Content-Type: application/json" \
    -H "Prefer: resolution=merge-duplicates" \
    -d "{\"key\":\"adt_bridge_tunnel_url\",\"value\":\"${TUNNEL_URL}\"}")
  if [ "$HTTP_STATUS" = "200" ] || [ "$HTTP_STATUS" = "201" ]; then
    echo "[config] Tunnel URL registered in Supabase ✓ (HTTP $HTTP_STATUS)"
  else
    echo "[config] Supabase registration failed (HTTP $HTTP_STATUS): $(cat /tmp/supabase-reg.json 2>/dev/null)"
  fi
else
  echo "[config] No Supabase creds found — tunnel URL won't auto-register"
  echo "         (Create ~/.adt-bridge.env with SUPABASE_URL and SUPABASE_SERVICE_KEY)"
fi

# ── Start the ADT bridge ───────────────────────────────────────
PORT=$PORT node server.js

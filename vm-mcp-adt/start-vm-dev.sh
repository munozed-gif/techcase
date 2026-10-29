#!/bin/bash
# ABAP ADT Bridge — DEV instance (port 3102, dev Supabase)
#
# Runs alongside start-vm.sh (production on port 3101) without any conflict.
# Registers tunnel URL to dev Supabase only — production is never touched.
#
# Setup:
#   Create $SCRIPT_DIR/.env.dev with:
#     SUPABASE_URL=https://<dev-project>.supabase.co
#     SUPABASE_SERVICE_KEY=<dev service key>
#     SAP_HOST=<host:port>   (optional — for CA cert extraction)
#
# Usage:
#   chmod +x start-vm-dev.sh
#   ./start-vm-dev.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARENT_DIR="$(dirname "$SCRIPT_DIR")"
PORT=3102
CF_LOG="/tmp/cloudflared-adt-bridge-dev.log"
ENV_FILE="$SCRIPT_DIR/.env.dev"

echo "=== ABAP ADT Bridge — DEV instance (port $PORT) ==="
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
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "[error] $ENV_FILE not found."
  echo "        Create it with:"
  echo "          SUPABASE_URL=https://<dev-project>.supabase.co"
  echo "          SUPABASE_SERVICE_KEY=<dev service key>"
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

# ── Kill any leftover DEV processes on port 3102 ──────────────
pkill -f "cloudflared tunnel.*$PORT" 2>/dev/null || true
fuser -k ${PORT}/tcp 2>/dev/null || true

# Kill orphaned MCP subprocess node processes left over from previous bridge crashes.
# When the bridge is OOM-killed, its subprocesses keep running and consume memory.
pkill -f "mcp-abap-abap-adt-api/dist/index.js" 2>/dev/null || true
pkill -f "mcp-abap-adt/dist/index.js" 2>/dev/null || true
sleep 2

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
echo "  ADT Bridge — DEV instance running!"
echo ""
echo "  Tunnel URL: $TUNNEL_URL"
echo "  Port:       $PORT (production is on 3101)"
echo ""
echo "  Registered in DEV Supabase only."
echo "  Production Supabase is NOT affected."
echo "=============================================="
echo ""

# ── Cleanup on exit ────────────────────────────────────────────
cleanup() {
  echo ""
  echo "[stop] Stopping DEV ADT bridge and cloudflared tunnel..."
  kill $CF_PID 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# ── Load dev Supabase credentials ─────────────────────────────
SUPABASE_URL=$(grep '^SUPABASE_URL=' "$ENV_FILE" | head -1 | cut -d'=' -f2-)
SUPABASE_SERVICE_KEY=$(grep '^SUPABASE_SERVICE_KEY=' "$ENV_FILE" | head -1 | cut -d'=' -f2-)
echo "[config] Loaded dev Supabase credentials from .env.dev"

# ── Register tunnel URL in dev Supabase (PATCH then INSERT) ───
_register_tunnel_url() {
  local url="$1"
  local AUTH=(-H "apikey: ${SUPABASE_SERVICE_KEY}" -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" -H "Content-Type: application/json")
  local STATUS
  STATUS=$(curl -s -o /tmp/supabase-reg-dev.json -w "%{http_code}" \
    -X PATCH "${SUPABASE_URL}/rest/v1/system_settings?key=eq.adt_bridge_tunnel_url" \
    "${AUTH[@]}" -d "{\"value\":\"${url}\"}")
  if [ "$STATUS" = "200" ] || [ "$STATUS" = "204" ]; then
    echo "[config] Tunnel URL updated in dev Supabase ✓ (HTTP $STATUS)"
    return
  fi
  STATUS=$(curl -s -o /tmp/supabase-reg-dev.json -w "%{http_code}" \
    -X POST "${SUPABASE_URL}/rest/v1/system_settings" \
    "${AUTH[@]}" -d "{\"key\":\"adt_bridge_tunnel_url\",\"value\":\"${url}\"}")
  if [ "$STATUS" = "200" ] || [ "$STATUS" = "201" ] || [ "$STATUS" = "204" ]; then
    echo "[config] Tunnel URL inserted in dev Supabase ✓ (HTTP $STATUS)"
  else
    echo "[config] Dev Supabase registration failed (HTTP $STATUS): $(cat /tmp/supabase-reg-dev.json 2>/dev/null)"
  fi
}

if [ -n "$SUPABASE_URL" ] && [ -n "$SUPABASE_SERVICE_KEY" ]; then
  echo "[config] Registering tunnel URL in dev Supabase..."
  _register_tunnel_url "$TUNNEL_URL"
fi

# ── SAP CA cert ───────────────────────────────────────────────
SAP_CA_CERT="$SCRIPT_DIR/sap-ca.pem"
SAP_HOST_ENV=$(grep '^SAP_HOST=' "$ENV_FILE" 2>/dev/null | head -1 | cut -d'=' -f2- | sed 's|https://||' | sed 's|/.*||')
if [ -s "$SAP_CA_CERT" ]; then
  export NODE_EXTRA_CA_CERTS="$SAP_CA_CERT"
  echo "[config] SAP CA cert loaded: $SAP_CA_CERT"
elif [ -n "$SAP_HOST_ENV" ]; then
  echo "[setup] Extracting SAP CA cert from $SAP_HOST_ENV ..."
  openssl s_client -connect "$SAP_HOST_ENV" -showcerts </dev/null 2>/dev/null \
    | openssl x509 -outform PEM > "$SAP_CA_CERT" 2>/dev/null || true
  if [ -s "$SAP_CA_CERT" ]; then
    export NODE_EXTRA_CA_CERTS="$SAP_CA_CERT"
    echo "[config] SAP CA cert extracted: $SAP_CA_CERT"
  fi
fi

# ── Restart command monitor ────────────────────────────────────
_MONITOR_START_EPOCH=$(date -u +%s)
(
  _last_handled=$_MONITOR_START_EPOCH
  while true; do
    sleep 30
    _raw=$(curl -sf "${SUPABASE_URL}/rest/v1/system_settings?key=eq.adt_bridge_restart_requested&select=value" \
      -H "apikey: ${SUPABASE_SERVICE_KEY}" -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" 2>/dev/null || echo "")
    _req_ts=$(echo "$_raw" | grep -o '"ts":[0-9]*' | grep -o '[0-9]*' | head -1)
    if [ -n "$_req_ts" ] && [ "$(( _req_ts / 1000 ))" -gt "$_last_handled" ] 2>/dev/null; then
      echo "[restart] Remote restart command received — restarting cloudflared tunnel..."
      kill $CF_PID 2>/dev/null || true
      sleep 2
      rm -f "$CF_LOG"
      cloudflared tunnel --url "http://localhost:$PORT" > "$CF_LOG" 2>&1 &
      CF_PID=$!
      _new_url=""
      for _i in $(seq 1 15); do
        _new_url=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$CF_LOG" 2>/dev/null | head -1)
        [ -n "$_new_url" ] && break
        sleep 2
      done
      if [ -n "$_new_url" ]; then
        _register_tunnel_url "$_new_url" >/dev/null 2>&1
        echo "[restart] Tunnel restarted: $_new_url"
      fi
      _last_handled=$(date -u +%s)
    fi
  done
) &
_MONITOR_PID=$!
trap "cleanup; kill $_MONITOR_PID 2>/dev/null || true" EXIT INT TERM

# ── Start the ADT bridge on port 3102 ─────────────────────────
export SUPABASE_URL
export SUPABASE_SERVICE_KEY
# Disable SOCKS5 proxy detection — the VM has direct SAP access via VPN,
# so routing sapFetch through SOCKS (port 1080) would break transport creation.
export NO_SOCKS=1
PORT=$PORT node --max-old-space-size=256 server.js

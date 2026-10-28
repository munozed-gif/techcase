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

# ── Load Supabase credentials (production + preproduction) ─────
SUPABASE_URL=""
SUPABASE_SERVICE_KEY=""
if [ -f "$SCRIPT_DIR/.env" ]; then
  SUPABASE_URL=$(grep '^SUPABASE_URL=' "$SCRIPT_DIR/.env" | head -1 | cut -d'=' -f2-)
  SUPABASE_SERVICE_KEY=$(grep '^SUPABASE_SERVICE_KEY=' "$SCRIPT_DIR/.env" | head -1 | cut -d'=' -f2-)
  echo "[config] Loaded production Supabase credentials from .env"
elif [ -f "/etc/vm-mcp-adt.env" ]; then
  SUPABASE_URL=$(grep '^SUPABASE_URL=' "/etc/vm-mcp-adt.env" | head -1 | cut -d'=' -f2-)
  SUPABASE_SERVICE_KEY=$(grep '^SUPABASE_SERVICE_KEY=' "/etc/vm-mcp-adt.env" | head -1 | cut -d'=' -f2-)
  echo "[config] Loaded production Supabase credentials from /etc/vm-mcp-adt.env"
fi

SUPABASE_URL_DEV=""
SUPABASE_SERVICE_KEY_DEV=""
if [ -f "$SCRIPT_DIR/.env.dev" ]; then
  SUPABASE_URL_DEV=$(grep '^SUPABASE_URL=' "$SCRIPT_DIR/.env.dev" | head -1 | cut -d'=' -f2-)
  SUPABASE_SERVICE_KEY_DEV=$(grep '^SUPABASE_SERVICE_KEY=' "$SCRIPT_DIR/.env.dev" | head -1 | cut -d'=' -f2-)
  echo "[config] Loaded preproduction Supabase credentials from .env.dev"
fi

# ── Register tunnel URL in one Supabase (PATCH then INSERT) ───
_register_one() {
  local url="$1" sb_url="$2" sb_key="$3" label="$4" tmpf="/tmp/supabase-reg-${label}.json"
  local AUTH=(-H "apikey: ${sb_key}" -H "Authorization: Bearer ${sb_key}" -H "Content-Type: application/json")
  local STATUS
  STATUS=$(curl -s -o "$tmpf" -w "%{http_code}" \
    -X PATCH "${sb_url}/rest/v1/system_settings?key=eq.adt_bridge_tunnel_url" \
    "${AUTH[@]}" -d "{\"value\":\"${url}\"}")
  if [ "$STATUS" = "200" ] || [ "$STATUS" = "204" ]; then
    echo "[config] Tunnel URL updated in ${label} Supabase ✓ (HTTP $STATUS)"
    return
  fi
  STATUS=$(curl -s -o "$tmpf" -w "%{http_code}" \
    -X POST "${sb_url}/rest/v1/system_settings" \
    "${AUTH[@]}" -d "{\"key\":\"adt_bridge_tunnel_url\",\"value\":\"${url}\"}")
  if [ "$STATUS" = "200" ] || [ "$STATUS" = "201" ] || [ "$STATUS" = "204" ]; then
    echo "[config] Tunnel URL inserted in ${label} Supabase ✓ (HTTP $STATUS)"
  else
    echo "[config] ${label} Supabase registration failed (HTTP $STATUS): $(cat "$tmpf" 2>/dev/null)"
  fi
}

_register_tunnel_url() {
  local url="$1"
  [ -n "$SUPABASE_URL" ]     && _register_one "$url" "$SUPABASE_URL"     "$SUPABASE_SERVICE_KEY"     "production"
  [ -n "$SUPABASE_URL_DEV" ] && _register_one "$url" "$SUPABASE_URL_DEV" "$SUPABASE_SERVICE_KEY_DEV" "preproduction"
}

echo "[config] Registering tunnel URL in Supabase..."
_register_tunnel_url "$TUNNEL_URL"
if [ -z "$SUPABASE_URL" ] && [ -z "$SUPABASE_URL_DEV" ]; then
  echo "[config] No Supabase creds found — tunnel URL won't auto-register"
  echo "         Create .env in this folder with SUPABASE_URL and SUPABASE_SERVICE_KEY"
fi

# ── SAP CA cert (required by mcp-abap-abap-adt-api) ──────────
# mcp-abap-abap-adt-api blocks NODE_TLS_REJECT_UNAUTHORIZED=0 and
# requires NODE_EXTRA_CA_CERTS pointing to the SAP server's CA cert.
SAP_CA_CERT="$SCRIPT_DIR/sap-ca.pem"
SAP_HOST_ENV=$(grep '^SAP_HOST=' "$SCRIPT_DIR/.env" 2>/dev/null | head -1 | cut -d'=' -f2- | sed 's|https://||' | sed 's|/.*||')
if [ -s "$SAP_CA_CERT" ]; then
  export NODE_EXTRA_CA_CERTS="$SAP_CA_CERT"
  echo "[config] SAP CA cert loaded: $SAP_CA_CERT"
elif [ -n "$SAP_HOST_ENV" ]; then
  echo "[setup] Extracting SAP CA cert from $SAP_HOST_ENV ..."
  openssl s_client -connect "$SAP_HOST_ENV" -showcerts </dev/null 2>/dev/null \
    | openssl x509 -outform PEM > "$SAP_CA_CERT" 2>/dev/null || true
  if [ -s "$SAP_CA_CERT" ]; then
    export NODE_EXTRA_CA_CERTS="$SAP_CA_CERT"
    echo "[config] SAP CA cert extracted and saved: $SAP_CA_CERT"
  else
    echo "[warn] Could not extract SAP CA cert from $SAP_HOST_ENV"
    echo "       Add SAP_HOST=<host:port> to .env or manually save cert to $SAP_CA_CERT"
  fi
else
  echo "[warn] No SAP CA cert found ($SAP_CA_CERT) and SAP_HOST not set in .env"
  echo "       mcp-abap-abap-adt-api (R+W, 127 tools) may fail with TLS error."
  echo "       Fix: add SAP_HOST=vhxaads4ci.sap.admosa.com:44300 to .env"
  echo "       or:  openssl s_client -connect <host:port> -showcerts </dev/null 2>/dev/null | openssl x509 -outform PEM > $SAP_CA_CERT"
fi

# ── Restart command monitor ────────────────────────────────────
# Polls both Supabase instances every 30s for a remote restart request.
if [ -n "$SUPABASE_URL" ] || [ -n "$SUPABASE_URL_DEV" ]; then
  _MONITOR_START_EPOCH=$(date -u +%s)
  (
    _last_handled=$_MONITOR_START_EPOCH
    _poll_ts() {
      local sb_url="$1" sb_key="$2"
      [ -z "$sb_url" ] && echo "" && return
      local raw
      raw=$(curl -sf "${sb_url}/rest/v1/system_settings?key=eq.adt_bridge_restart_requested&select=value" \
        -H "apikey: ${sb_key}" -H "Authorization: Bearer ${sb_key}" 2>/dev/null || echo "")
      echo "$raw" | grep -o '"ts":[0-9]*' | grep -o '[0-9]*' | head -1
    }
    while true; do
      sleep 30
      _ts_prod=$(_poll_ts "$SUPABASE_URL"     "$SUPABASE_SERVICE_KEY")
      _ts_dev=$( _poll_ts "$SUPABASE_URL_DEV" "$SUPABASE_SERVICE_KEY_DEV")
      _req_ts=$(printf '%s\n%s\n' "$_ts_prod" "$_ts_dev" | grep -v '^$' | sort -rn | head -1)
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
fi

# ── Start the ADT bridge ───────────────────────────────────────
export SUPABASE_URL
export SUPABASE_SERVICE_KEY
PORT=$PORT node server.js

#!/bin/bash
# TechCase SAP MCP Server — local laptop startup script
# Starts cloudflared quick tunnel, captures the URL, then starts the MCP server.
# The MCP server auto-registers the tunnel URL to Supabase so the platform finds it.
#
# Requirements:
#   - Node.js 18+  (node --version)
#   - cloudflared  (https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)
#   - FortiClient VPN connected before running SAP checks in the platform
#
# Usage:
#   chmod +x start-local.sh
#   ./start-local.sh

set -e

PORT=${PORT:-3100}
CF_LOG="/tmp/cloudflared-techcase.log"

# Install npm deps if needed
if [ ! -d node_modules ]; then
  echo "[setup] Installing dependencies..."
  npm install
fi

# Kill any leftover cloudflared or MCP processes on this port
pkill -f "cloudflared tunnel" 2>/dev/null || true
lsof -ti:$PORT 2>/dev/null | xargs kill -9 2>/dev/null || true
sleep 1

# Start cloudflared quick tunnel in background, log to file
echo "[cloudflared] Starting quick tunnel → localhost:$PORT ..."
rm -f "$CF_LOG"
cloudflared tunnel --url "http://localhost:$PORT" > "$CF_LOG" 2>&1 &
CF_PID=$!

# Wait for tunnel URL to appear in the log (up to 60s)
TUNNEL_URL=""
for i in $(seq 1 30); do
  TUNNEL_URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$CF_LOG" 2>/dev/null | head -1)
  if [ -n "$TUNNEL_URL" ]; then
    break
  fi
  sleep 2
done

if [ -z "$TUNNEL_URL" ]; then
  echo "[error] Could not get tunnel URL from cloudflared after 60s."
  echo "        Check $CF_LOG for details."
  kill $CF_PID 2>/dev/null
  exit 1
fi

echo ""
echo "==========================================="
echo "  Tunnel URL: $TUNNEL_URL"
echo "  Set this in Config. SAP → DS4 → SAP MCP Server URL"
echo "  (it will auto-register to Supabase — the platform finds it automatically)"
echo "==========================================="
echo ""

# Cleanup on exit
cleanup() {
  echo ""
  echo "[stop] Stopping cloudflared and MCP server..."
  kill $CF_PID 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Start MCP server with the tunnel URL so it registers to Supabase on boot
TUNNEL_URL="$TUNNEL_URL" CLOUDFLARED_LOG="$CF_LOG" node index.js

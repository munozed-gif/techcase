#!/usr/bin/env bash
# TechCase SAP VM Setup — Ubuntu 22.04 LTS
# Run as root once after EC2 launch:  sudo bash setup.sh
set -euo pipefail

MCAST_USER="techcase"
MCP_DIR="/opt/techcase/sap-mcp-server"
REPO_URL="https://github.com/munozed-gif/techcase.git"

echo "=== 1. System packages ==="
apt-get update -qq
apt-get install -y openfortivpn nodejs npm git curl netcat-openbsd

# Node 18+ required — replace distro default if older
node_ver=$(node -e "process.stdout.write(process.versions.node)" 2>/dev/null || echo "0")
if [ "$(echo "$node_ver" | cut -d. -f1)" -lt 18 ]; then
  echo "Installing Node 18 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
  apt-get install -y nodejs
fi

echo "=== 2. Service user ==="
id "$MCAST_USER" &>/dev/null || useradd -r -m -s /bin/false "$MCAST_USER"

echo "=== 3. MCP server ==="
mkdir -p /opt/techcase
if [ ! -d "$MCP_DIR" ]; then
  git clone --depth 1 --filter=blob:none --sparse "$REPO_URL" "$MCP_DIR"
  cd "$MCP_DIR"
  git sparse-checkout set sap-mcp-server
  cd sap-mcp-server
else
  cd "$MCP_DIR/sap-mcp-server"
  git pull --ff-only
fi
npm ci --omit=dev
chown -R "$MCAST_USER:$MCAST_USER" /opt/techcase

echo "=== 4. openfortivpn config ==="
mkdir -p /etc/openfortivpn
if [ ! -f /etc/openfortivpn/config ]; then
  cp /opt/techcase/sap-mcp-server/../vm-setup/vpn/config.example /etc/openfortivpn/config
  echo ""
  echo ">>> Edit /etc/openfortivpn/config with real VPN credentials before continuing."
  echo ">>> To get the trusted-cert fingerprint run:"
  echo ">>>   sudo openfortivpn <vpn-host>:<port> -u <user>"
  echo ">>> and copy the fingerprint it shows, then add: trusted-cert = <fingerprint>"
fi

echo "=== 5. VPN watchdog script ==="
install -m 755 /opt/techcase/sap-mcp-server/../vm-setup/vpn/watchdog.sh /usr/local/bin/vpn-watchdog

echo "=== 6. systemd services ==="
cp /opt/techcase/sap-mcp-server/../vm-setup/services/*.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable openfortivpn vpn-watchdog.timer sap-mcp

echo ""
echo "=== Setup complete ==="
echo "Next steps:"
echo "  1. Fill in /etc/openfortivpn/config (host, port, username, password, trusted-cert)"
echo "  2. Create /etc/techcase/sap-mcp.env with SAP credentials (see vm-setup/services/sap-mcp.env.example)"
echo "  3. sudo systemctl start openfortivpn"
echo "  4. nc -zv <sap-host> 44300   # verify SAP reachable through VPN"
echo "  5. sudo systemctl start sap-mcp"
echo "  6. curl http://localhost:8080/health"

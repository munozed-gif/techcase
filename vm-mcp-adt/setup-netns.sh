#!/bin/bash
# One-time VM setup for per-project VPNs (run again after updating arena-netns):
#   cd ~/techcase && git pull && sudo bash vm-mcp-adt/setup-netns.sh
# Installs the VPN clients (FortiGate, Cisco AnyConnect, Palo Alto GlobalProtect,
# Ivanti/Pulse, OpenVPN, WireGuard) and microsocks, installs the arena-netns helper and lets
# the bridge user run only that helper as root.
set -euo pipefail
[ "$(id -u)" = "0" ] || { echo "Run with sudo"; exit 1; }
HERE="$(cd "$(dirname "$0")" && pwd)"
BRIDGE_USER="${SUDO_USER:-ubuntu}"

echo "[setup] Installing VPN clients and microsocks…"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq openfortivpn openconnect vpnc-scripts openvpn wireguard-tools microsocks iptables iproute2 util-linux >/dev/null

echo "[setup] Installing /usr/local/sbin/arena-netns…"
install -o root -g root -m 0755 "$HERE/arena-netns" /usr/local/sbin/arena-netns
install -o root -g root -m 0755 "$HERE/arena-vpnc-script" /usr/local/sbin/arena-vpnc-script
mkdir -p /var/lib/arena-netns && chown "$BRIDGE_USER:$BRIDGE_USER" /var/lib/arena-netns && chmod 700 /var/lib/arena-netns

echo "[setup] Allowing $BRIDGE_USER to run only arena-netns as root…"
cat > /etc/sudoers.d/arena-netns <<EOF
# ADT bridge: per-project VPN namespaces. The helper validates its arguments; 'exec' keeps the
# caller's environment (SAP connection settings) and drops back to the caller's user.
Defaults!/usr/local/sbin/arena-netns !env_reset
$BRIDGE_USER ALL=(root) NOPASSWD: /usr/local/sbin/arena-netns
EOF
chmod 440 /etc/sudoers.d/arena-netns
visudo -cf /etc/sudoers.d/arena-netns >/dev/null

echo "[setup] Checking…"
sudo -u "$BRIDGE_USER" sudo -n /usr/local/sbin/arena-netns list >/dev/null && echo "[setup] OK — per-project VPNs are ready."
for b in openfortivpn openconnect openvpn wg-quick microsocks; do printf '  %-12s %s\n' "$b" "$(command -v $b || echo MISSING)"; done

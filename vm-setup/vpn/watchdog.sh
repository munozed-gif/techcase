#!/usr/bin/env bash
# VPN watchdog — runs every minute via systemd timer.
# Checks TCP reachability of SAP host; restarts openfortivpn if unreachable.
# Rate-limited to 3 restarts per 15 minutes.

SAP_HOST="${SAP_HOST:-}"
SAP_PORT="${SAP_PORT:-44300}"
RESTART_LOG="/run/vpn-watchdog-restarts"
MAX_RESTARTS=3
WINDOW_SECONDS=900  # 15 minutes

log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) [vpn-watchdog] $*" | systemd-cat -t vpn-watchdog; }

if [ -z "$SAP_HOST" ]; then
  log "SAP_HOST not set — skipping check"
  exit 0
fi

# TCP reachability check (2 second timeout)
if nc -z -w2 "$SAP_HOST" "$SAP_PORT" 2>/dev/null; then
  log "ok — $SAP_HOST:$SAP_PORT reachable"
  exit 0
fi

log "WARN — $SAP_HOST:$SAP_PORT unreachable"

# Rate limit: count restarts in last WINDOW_SECONDS
now=$(date +%s)
cutoff=$((now - WINDOW_SECONDS))
touch "$RESTART_LOG"
# Filter to recent entries only
recent=$(awk -v c="$cutoff" '$1 >= c' "$RESTART_LOG" | wc -l)

if [ "$recent" -ge "$MAX_RESTARTS" ]; then
  log "ERROR — restart limit ($MAX_RESTARTS in ${WINDOW_SECONDS}s) reached — needs_human: true"
  exit 1
fi

log "Restarting openfortivpn..."
systemctl restart openfortivpn

# Record this restart
echo "$now" >> "$RESTART_LOG"

# Wait up to 60s for VPN to come back
for i in $(seq 1 12); do
  sleep 5
  if nc -z -w2 "$SAP_HOST" "$SAP_PORT" 2>/dev/null; then
    log "VPN restored — $SAP_HOST:$SAP_PORT reachable after ${i}x5s"
    exit 0
  fi
done

log "ERROR — VPN still down after 60s — needs_human: true"
exit 1

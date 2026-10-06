#!/usr/bin/env bash
# Deploy home-display: CT 105 on pve2 pulls main from GitHub.
# Usage: ./deploy.sh [deploy|status|logs]
set -euo pipefail

PVE=root@192.168.0.200
CT=105
APP=/usr/share/caddy

run() { ssh "$PVE" "pct exec $CT -- bash -c '$1'"; }

case "${1:-deploy}" in
  deploy)
    if [ -n "$(git status --porcelain)" ]; then
      echo "Warning: uncommitted local changes are NOT deployed." >&2
    fi
    if [ "$(git rev-parse HEAD)" != "$(git rev-parse @{u} 2>/dev/null)" ]; then
      echo "Warning: local HEAD differs from origin; did you push?" >&2
    fi
    run "cd $APP && old=\$(git rev-parse HEAD) && git pull --ff-only -q && new=\$(git rev-parse HEAD) &&
      if [ \"\$old\" = \"\$new\" ]; then echo \"Already at \$new\"; exit 0; fi &&
      git log --oneline \$old..\$new &&
      changed=\$(git diff --name-only \$old \$new) &&
      if echo \"\$changed\" | grep -qE \"^(package(-lock)?\\.json)\$\"; then npm ci --omit=dev --silent; fi &&
      if echo \"\$changed\" | grep -qE \"^(server\\.js|package(-lock)?\\.json)\$\"; then pm2 restart home-display --update-env >/dev/null && echo \"pm2 restarted\"; fi &&
      echo \"Deployed \$new\""
    ;;
  status)
    run "cd $APP && git log -1 --format=\"%h %ad %s\" --date=short && git status --short && pm2 ls"
    ;;
  logs)
    run "pm2 logs home-display --lines 40 --nostream"
    ;;
  *)
    echo "Usage: $0 [deploy|status|logs]" >&2; exit 1
    ;;
esac

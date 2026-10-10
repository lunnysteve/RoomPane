#!/usr/bin/env bash
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run with sudo.' >&2; exit 1; }
SOURCE=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
APP=/opt/home-display/app
NODE=/opt/home-display/node/bin/node
[[ -f "$APP/server.js" && -x "$NODE" ]] || { echo 'Standalone installation not found.' >&2; exit 1; }
[[ -f "$SOURCE/app-files.json" ]] || { echo 'Missing app-files.json' >&2; exit 1; }
mapfile -t files < <("$NODE" -e 'const m=require(process.argv[1]);for(const f of new Set(Object.values(m).flat()))console.log(f)' "$SOURCE/app-files.json")
for file in "${files[@]}"; do [[ -f "$SOURCE/$file" ]] || { echo "Missing $file" >&2; exit 1; }; done
for file in "${files[@]}"; do [[ "$file" != *.js ]] || "$NODE" --check "$SOURCE/$file"; done
install -d -m 700 /opt/home-display/updates
BACKUP=$(mktemp -d /opt/home-display/updates/studio-XXXXXXXX)
MODULES_BACKED_UP=false
system_files=(/usr/local/lib/home-display/fetch-release.py /usr/local/sbin/home-display-control /etc/sudoers.d/home-display /etc/systemd/system/home-display-update.service)
for i in "${!system_files[@]}"; do
  if [[ -f "${system_files[$i]}" ]]; then cp -p "${system_files[$i]}" "$BACKUP/system-$i"; else touch "$BACKUP/system-$i.absent"; fi
done
for file in "${files[@]}"; do
  if [[ -f "$APP/$file" ]]; then cp -p "$APP/$file" "$BACKUP/$file"; else touch "$BACKUP/$file.absent"; fi
done
rollback() {
  echo "Update failed; restoring files from $BACKUP" >&2
  for file in "${files[@]}"; do
    if [[ -f "$BACKUP/$file.absent" ]]; then rm -f -- "$APP/$file"; else cp -p "$BACKUP/$file" "$APP/$file"; fi
  done
  if [[ "$MODULES_BACKED_UP" == true ]]; then
    rm -rf -- "$APP/node_modules"
    mv -- "$BACKUP/node_modules" "$APP/node_modules"
  fi
  for i in "${!system_files[@]}"; do
    if [[ -f "$BACKUP/system-$i.absent" ]]; then rm -f -- "${system_files[$i]}"; else cp -p "$BACKUP/system-$i" "${system_files[$i]}"; fi
  done
  systemctl daemon-reload || true
  systemctl restart home-display || true
}
trap rollback ERR
for file in "${files[@]}"; do install -o root -g root -m 644 "$SOURCE/$file" "$APP/$file"; done
if [[ -d "$APP/node_modules" ]]; then
  mv -- "$APP/node_modules" "$BACKUP/node_modules"
  MODULES_BACKED_UP=true
fi
PATH="/opt/home-display/node/bin:$PATH" /opt/home-display/node/bin/npm ci --omit=dev --ignore-scripts --prefix "$APP"
install -d -m 755 /usr/local/lib/home-display
install -m 755 "$SOURCE/pi/fetch-release.py" /usr/local/lib/home-display/fetch-release.py
install -m 755 "$SOURCE/pi/home-display-control" /usr/local/sbin/home-display-control
visudo -cf "$SOURCE/pi/home-display.sudoers"
install -m 440 "$SOURCE/pi/home-display.sudoers" /etc/sudoers.d/home-display
install -m 644 "$SOURCE/pi/home-display-update.service" /etc/systemd/system/home-display-update.service
systemctl daemon-reload
systemctl restart home-display
ready=false
for attempt in {1..30}; do
  if curl --fail --silent http://127.0.0.1:3000/api/health >/dev/null; then ready=true; break; fi
  sleep 1
done
[[ "$ready" == true ]]
trap - ERR
echo "Studio installed. Backup: $BACKUP"
echo 'Open http://YOUR-PI:3000/admin and refresh.'

#!/usr/bin/env bash
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run with sudo.' >&2; exit 1; }
SOURCE=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
APP=/opt/home-display/app
NODE=/opt/home-display/node/bin/node
[[ -f "$APP/server.js" && -x "$NODE" ]] || { echo 'Standalone installation not found.' >&2; exit 1; }
files=(server.js plugins.js screens.js updates.js package.json package-lock.json index.html lite.js designer.html designer.js studio-extras.js studio-devices.js plugin-mainsail.html plugin-mainsail.js plugin-example.html design-display.html design-display.js design-assets.js design-assets.css studio-sans.ttf studio-serif.ttf studio-mono.ttf studio-heavy.ttf studio-serif-bold.ttf studio-mono-italic.ttf studio-font-license.txt manifest.webmanifest app-icon.svg app-icon-192.png app-icon-512.png sw.js)
for file in "${files[@]}"; do [[ -f "$SOURCE/$file" ]] || { echo "Missing $file" >&2; exit 1; }; done
for file in server.js plugins.js screens.js updates.js lite.js designer.js studio-extras.js studio-devices.js plugin-mainsail.js design-display.js design-assets.js sw.js; do "$NODE" --check "$SOURCE/$file"; done
install -d -m 700 /opt/home-display/updates
BACKUP=$(mktemp -d /opt/home-display/updates/studio-XXXXXXXX)
for file in "${files[@]}"; do
  if [[ -f "$APP/$file" ]]; then cp -p "$APP/$file" "$BACKUP/$file"; else touch "$BACKUP/$file.absent"; fi
done
rollback() {
  echo "Update failed; restoring files from $BACKUP" >&2
  for file in "${files[@]}"; do
    if [[ -f "$BACKUP/$file.absent" ]]; then rm -f -- "$APP/$file"; else cp -p "$BACKUP/$file" "$APP/$file"; fi
  done
  systemctl restart home-display || true
}
trap rollback ERR
for file in "${files[@]}"; do install -o root -g root -m 644 "$SOURCE/$file" "$APP/$file"; done
install -d -m 755 /usr/local/lib/home-display
install -m 755 "$SOURCE/pi/fetch-release.py" /usr/local/lib/home-display/fetch-release.py
install -m 755 "$SOURCE/pi/home-display-control" /usr/local/sbin/home-display-control
install -m 440 "$SOURCE/pi/home-display.sudoers" /etc/sudoers.d/home-display
visudo -cf /etc/sudoers.d/home-display
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
echo 'Open http://192.168.0.202:3000/admin and refresh.'

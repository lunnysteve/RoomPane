#!/usr/bin/env bash
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run with sudo.' >&2; exit 1; }
SOURCE=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
MODE=${1:-apply}
[[ "$MODE" == apply || "$MODE" == --restore ]] || { echo 'Usage: sudo bash test-wayland.sh [--restore]' >&2; exit 1; }
if [[ "$MODE" == --restore ]]; then
  systemctl stop home-display-wayland.service || true
  systemctl start lightdm.service
  echo 'Restored the X11 kiosk.'
  exit 0
fi
id display-kiosk >/dev/null
systemctl is-active --quiet home-display.service || { echo 'The dashboard server must be running first.' >&2; exit 1; }
for target in /etc/systemd/system/home-display-wayland.service /etc/pam.d/home-display-kiosk; do
  if [[ -e "$target" ]] && ! grep -qxF '# Home Display direct Wayland test' "$target"; then
    echo "An unrelated file already exists at $target. Stopping." >&2
    exit 1
  fi
done
apt-get update
apt-get install -y --no-install-recommends cage
install -m 644 "$SOURCE/home-display-wayland.service" /etc/systemd/system/home-display-wayland.service
install -m 644 "$SOURCE/home-display-kiosk.pam" /etc/pam.d/home-display-kiosk
install -m 755 "$SOURCE/wayland-browser" /usr/local/bin/home-display-wayland-browser
systemd-analyze verify /etc/systemd/system/home-display-wayland.service
systemctl daemon-reload
# This is a runtime trial. LightDM stays enabled for the next boot.
systemctl stop lightdm.service
if ! systemctl restart home-display-wayland.service; then
  systemctl start lightdm.service
  journalctl -u home-display-wayland.service -n 40 --no-pager
  exit 1
fi
sleep 15
if ! systemctl is-active --quiet home-display-wayland.service; then
  systemctl stop home-display-wayland.service
  systemctl start lightdm.service
  journalctl -u home-display-wayland.service -n 40 --no-pager
  exit 1
fi
echo 'The direct Wayland kiosk trial is running.'
echo 'Check the physical screen; I can read trial errors remotely from the journal.'
echo 'Undo with: sudo bash ~/home-display/pi/test-wayland.sh --restore'
echo 'A reboot also returns to the existing X11 setup.'

#!/usr/bin/env bash
set -euo pipefail

# Run from a checkout: sudo bash install.sh [--server-only]
MODE=${1:-full}
[[ "$MODE" == full || "$MODE" == --server-only ]] || { echo 'Usage: sudo bash install.sh [--server-only]' >&2; exit 1; }
[[ $EUID -eq 0 ]] || { echo 'Run with sudo.' >&2; exit 1; }
SOURCE=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
[[ -f "$SOURCE/package-lock.json" ]] || { echo 'Run from a complete project checkout.' >&2; exit 1; }
. /etc/os-release
[[ "${ID:-}" == raspbian || "${ID:-}" == debian ]] || { echo 'Requires Raspberry Pi OS Lite (Bookworm or newer).' >&2; exit 1; }
[[ "${VERSION_ID:-0}" -ge 12 ]] || { echo 'Requires Bookworm or newer.' >&2; exit 1; }
case "$(uname -m)" in
  armv7l) NODE_ARCH=armv7l ;;
  aarch64) NODE_ARCH=arm64 ;;
  *) echo 'Requires an ARMv7 or ARM64 Pi (Pi 2 or newer; original Pi Zero unsupported).' >&2; exit 1 ;;
esac
APP=/opt/home-display/app
DATA=/var/lib/home-display
RUNTIME=/opt/home-display/node
if [[ "$MODE" == full ]]; then
  if [[ -e /opt/custompios ]]; then
    echo 'CustomPiOS was found. Use --server-only for a trial or a fresh Lite card for the full kiosk.' >&2
    exit 1
  fi
  if [[ -e /etc/lightdm/lightdm.conf.d/90-home-display.conf && ! -f /etc/home-display/installed ]]; then
    echo 'An existing kiosk configuration was found. Use --server-only to trial the server first.' >&2
    exit 1
  fi
fi
if [[ ! -f /etc/home-display/environment ]]; then
  if [[ ! -t 0 ]]; then echo 'Run interactively to set the admin password.' >&2; exit 1; fi
  read -rsp 'Choose an admin password (at least 12 characters): ' ADMIN_PASSWORD; echo
  [[ ${#ADMIN_PASSWORD} -ge 12 ]] || { echo 'Password must contain at least 12 characters.' >&2; exit 1; }
  read -rsp 'Confirm admin password: ' ADMIN_CONFIRM; echo
  [[ "$ADMIN_PASSWORD" == "$ADMIN_CONFIRM" ]] || { echo 'Passwords do not match.' >&2; exit 1; }
  PASSWORD_HASH=$(printf '%s' "$ADMIN_PASSWORD" | sha256sum | cut -d' ' -f1)
  unset ADMIN_PASSWORD ADMIN_CONFIRM
fi

apt-get update
apt-get install -y --no-install-recommends ca-certificates curl xz-utils rsync sudo avahi-daemon
if ! id home-display >/dev/null 2>&1; then useradd --system --create-home --home-dir "$DATA" --shell /usr/sbin/nologin home-display; fi
install -d -m 755 /opt/home-display "$APP" /etc/home-display
install -d -o home-display -g home-display -m 750 "$DATA" "$DATA/content"
WORK=$(mktemp -d)
trap 'rm -rf -- "$WORK"' EXIT
NODE_BASE=https://nodejs.org/dist/latest-v22.x
curl --fail --silent --show-error --location "$NODE_BASE/SHASUMS256.txt" -o "$WORK/SHASUMS256.txt"
NODE_FILE=$(awk -v arch="$NODE_ARCH" '$2 ~ ("^node-v22\\.[0-9]+\\.[0-9]+-linux-" arch "\\.tar\\.xz$") {print $2}' "$WORK/SHASUMS256.txt")
[[ -n "$NODE_FILE" && "$NODE_FILE" != *$'\n'* ]] || { echo 'No matching Node 22 release found.' >&2; exit 1; }
curl --fail --silent --show-error --location "$NODE_BASE/$NODE_FILE" -o "$WORK/$NODE_FILE"
(cd "$WORK" && awk -v name="$NODE_FILE" '$2 == name' SHASUMS256.txt | sha256sum -c -)
install -d "$RUNTIME"
tar -xJf "$WORK/$NODE_FILE" -C "$RUNTIME" --strip-components=1
export PATH="$RUNTIME/bin:$PATH"
node --version
# Preserve the data directory; updates replace only application files.
rsync -a --delete --exclude='.git/' --exclude='.serena/' --exclude='node_modules/' --exclude='config.json' --exclude='content/' --exclude='tests/' "$SOURCE/" "$APP/"
cd "$APP"
npm ci --omit=dev --ignore-scripts
chown -R root:root "$APP" "$RUNTIME"
chmod -R go-w "$APP" "$RUNTIME"
if [[ ! -f "$DATA/config.json" ]]; then install -o home-display -g home-display -m 640 "$APP/config.example.json" "$DATA/config.json"; fi
if [[ ! -f /etc/home-display/environment ]]; then
  umask 077
  cat > /etc/home-display/environment <<EOF
PORT=3000
HOME_DISPLAY_DATA_DIR=$DATA
HOME_DISPLAY_ADMIN_PASSWORD_HASH=$PASSWORD_HASH
HOME_DISPLAY_CONTROL=local
EOF
  unset PASSWORD_HASH
fi
install -m 755 "$APP/pi/home-display-control" /usr/local/sbin/home-display-control
install -d -m 755 /usr/local/lib/home-display
install -m 755 "$APP/pi/fetch-release.py" /usr/local/lib/home-display/fetch-release.py
install -m 644 "$APP/pi/home-display-update.service" /etc/systemd/system/home-display-update.service
install -m 440 "$APP/pi/home-display.sudoers" /etc/sudoers.d/home-display
visudo -cf /etc/sudoers.d/home-display
install -m 644 "$APP/pi/home-display.service" /etc/systemd/system/home-display.service
systemctl daemon-reload
systemctl enable --now avahi-daemon
systemctl enable home-display.service
systemctl restart home-display.service
for attempt in {1..30}; do
  if curl --fail --silent http://127.0.0.1:3000/api/health >/dev/null; then break; fi
  sleep 1
done
curl --fail --silent http://127.0.0.1:3000/api/health >/dev/null || { journalctl -u home-display -n 30 --no-pager; exit 1; }

if [[ "$MODE" == full ]]; then
  apt-get install -y --no-install-recommends xserver-xorg x11-xserver-utils xinit openbox lightdm chromium unclutter
  if ! id display-kiosk >/dev/null 2>&1; then useradd --create-home --shell /bin/bash display-kiosk; fi
  usermod -aG video,audio,input,render display-kiosk
  install -m 755 "$APP/pi/kiosk-session" /usr/local/bin/home-display-kiosk
  install -m 644 "$APP/pi/home-display.desktop" /usr/share/xsessions/home-display.desktop
  install -d /etc/lightdm/lightdm.conf.d
  install -m 644 "$APP/pi/lightdm.conf" /etc/lightdm/lightdm.conf.d/90-home-display.conf
  systemctl set-default graphical.target
  systemctl enable lightdm
fi
touch /etc/home-display/installed
printf '\nInstalled. Admin: http://%s.local:3000/admin (username: admin)\n' "$(hostname)"
echo 'You can also use the Pi IP address. Back up /var/lib/home-display and /etc/home-display.'
[[ "$MODE" == --server-only ]] || echo 'Reboot when ready to start the local dashboard: sudo reboot'

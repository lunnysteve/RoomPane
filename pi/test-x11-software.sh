#!/usr/bin/env bash
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run with sudo.' >&2; exit 1; }
CONFIG=/etc/X11/xorg.conf.d/90-home-display-software-test.conf
MARKER='# Home Display reversible X11 software rendering test'
MODE=${1:-apply}
[[ "$MODE" == apply || "$MODE" == --restore ]] || { echo 'Usage: sudo bash test-x11-software.sh [--restore]' >&2; exit 1; }
if [[ -e "$CONFIG" ]] && ! grep -qxF "$MARKER" "$CONFIG"; then
  echo 'The test configuration path already contains an unrelated file. Stopping.' >&2
  exit 1
fi
if [[ "$MODE" == --restore ]]; then
  [[ ! -f "$CONFIG" ]] || rm -- "$CONFIG"
  systemctl restart lightdm
  echo 'Restored the previous X11 configuration.'
  exit 0
fi
install -d -m 755 /etc/X11/xorg.conf.d
cat > "$CONFIG" <<'EOF'
# Home Display reversible X11 software rendering test
Section "Device"
    Identifier "HomeDisplaySoftwareTest"
    Driver "modesetting"
    Option "AccelMethod" "none"
    Option "PageFlip" "false"
    Option "ShadowFB" "true"
EndSection
EOF
chmod 644 "$CONFIG"
if ! systemctl restart lightdm; then
  rm -- "$CONFIG"
  systemctl restart lightdm || true
  echo 'X11 failed to restart; the test configuration was removed.' >&2
  exit 1
fi
echo 'X11 software rendering test applied. Allow about 20 seconds for Chromium to start.'
echo 'Undo with: sudo bash ~/home-display/pi/test-x11-software.sh --restore'

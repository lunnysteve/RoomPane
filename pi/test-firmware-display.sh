#!/usr/bin/env bash
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run with sudo.' >&2; exit 1; }
MODE=${1:-apply}
[[ "$MODE" == apply || "$MODE" == --restore ]] || { echo 'Usage: sudo bash test-firmware-display.sh [--restore]' >&2; exit 1; }
model=$(tr -d '\0' < /proc/device-tree/model)
case "$model" in
  'Raspberry Pi 2 '*) ;;
  *) echo 'This display diagnostic is only intended for the Pi 2.' >&2; exit 1 ;;
esac
[[ -f /boot/firmware/overlays/vc4-fkms-v3d.dtbo ]] || { echo 'The firmware display overlay is unavailable.' >&2; exit 1; }
python3 - "$MODE" <<'PY'
from pathlib import Path
import re
import sys

config = Path('/boot/firmware/config.txt')
backup = Path('/boot/firmware/config.txt.home-display-kms-backup')
text = config.read_text()
source, target = ('vc4-kms-v3d', 'vc4-fkms-v3d') if sys.argv[1] == 'apply' else ('vc4-fkms-v3d', 'vc4-kms-v3d')
pattern = re.compile(r'^([ \t]*dtoverlay=)' + re.escape(source) + r'([,\r\n]|$)', re.MULTILINE)
if not pattern.search(text):
    raise SystemExit('Expected display overlay was not found. No boot settings were changed.')
if not backup.exists():
    backup.write_text(text)
    print(f'Boot configuration backed up to {backup}')
updated = pattern.sub(lambda match: match[1] + target + match[2], text)
temporary = config.with_name('config.txt.home-display-test.tmp')
temporary.write_text(updated)
temporary.replace(config)
print(f'Display overlay set to {target}.')
PY
sync
echo 'Reboot when ready: sudo reboot'
echo 'Undo with: sudo bash ~/home-display/pi/test-firmware-display.sh --restore'

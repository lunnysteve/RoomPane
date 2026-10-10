#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
bash -n install.sh pi/kiosk-session
sh -n pi/home-display-control
# Validate the unit without requiring an installed runtime or data directory.
WORK=$(mktemp -d)
trap 'rm -rf -- "$WORK"' EXIT
sed -e 's|ExecStart=.*|ExecStart=/usr/bin/true|' \
    -e 's|WorkingDirectory=.*|WorkingDirectory=/tmp|' \
    -e 's|ReadWritePaths=.*|ReadWritePaths=/tmp|' \
    -e 's|EnvironmentFile=.*|EnvironmentFile=-/tmp/home-display-test-environment|' \
    pi/home-display.service > "$WORK/home-display.service"
systemd-analyze verify "$WORK/home-display.service"
echo 'Linux scripts and service syntax passed.'
"${NODE_BINARY:-node}" --test tests/server.test.cjs

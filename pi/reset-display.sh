#!/usr/bin/env bash
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run with sudo to reset the active DSI output.' >&2; exit 1; }
export DISPLAY=:0
export XAUTHORITY=/var/run/lightdm/root/:0
if ! xrandr --query | grep -q '^DSI-1 connected'; then
  echo 'No connected DSI-1 output was found.' >&2
  exit 1
fi
# Reinitialise the connected panel without changing boot configuration.
trap 'xrandr --output DSI-1 --auto >/dev/null 2>&1 || true' ERR
xrandr --output DSI-1 --off
sleep 2
xrandr --output DSI-1 --mode 800x480 --primary
xset s off || true
xset -dpms || true
echo 'DSI-1 reinitialised at 800x480.'

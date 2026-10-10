#!/usr/bin/env bash
set -u
[[ $EUID -eq 0 ]] || { echo 'Run with sudo to read the display session logs.' >&2; exit 1; }
echo '=== Display session ==='
systemctl status home-display lightdm --no-pager -n 12
echo '=== X11 screen configuration ==='
export DISPLAY=:0
export XAUTHORITY=/var/run/lightdm/root/:0
xrandr --verbose
xset q
echo '=== Session errors ==='
tail -n 100 /home/display-kiosk/.xsession-errors
echo '=== X server errors ==='
tail -n 80 /var/log/lightdm/x-0.log
echo '=== Power and display ==='
command -v vcgencmd >/dev/null && vcgencmd get_throttled
for status in /sys/class/drm/card*-*/status; do echo "$status"; cat "$status"; done
for status in /sys/class/backlight/*/bl_power /sys/class/backlight/*/brightness; do echo "$status"; cat "$status"; done

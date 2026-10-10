# Working display observation

The owner confirmed that the dashboard clock appeared on the Pi 2 with its
ribbon-connected DSI screen after the firmware display trial and reboot.
Earlier X11 and Wayland trials rendered the dashboard but left the panel black.

The trial script is `test-firmware-display.sh`. It changes the KMS overlay to
`vc4-fkms-v3d`, saves the original boot configuration, and supports `--restore`.
This is a device-specific workaround, not a default for all Raspberry Pis.

Remote verification confirmed the Pi 2 is running `vc4-fkms-v3d`, with both
`home-display` and `lightdm` active and enabled for boot. The health endpoint
returned `{"ok":true}`. SSH over IPv4 matches the saved hostname key; the IPv6
connection reported a different key and must be investigated separately.

Confirm that another reboot still starts the dashboard before making this
workaround part of a supported installation profile.

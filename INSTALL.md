# Install Roompane on a Raspberry Pi

This installer sets up the dashboard server, web admin, and a minimal Chromium kiosk on Raspberry Pi OS Lite. The screen uses the local server; Proxmox is not required.

## Hardware and OS

- Raspberry Pi 2 or newer, with an attached HDMI/DSI display.
- Raspberry Pi OS Lite Bookworm or newer. Use 32-bit Lite on Pi 2; 64-bit is preferable on newer models.
- A 16 GB or larger microSD card and a suitable power supply.
- Network access for installation and live weather. The local dashboard remains available without internet, although external pages and fonts may not load.

Pi 2 is a compatibility target, not a performance guarantee. The kiosk uses software rendering on Pi 2 to avoid Chromium graphics-driver issues; newer models use Chromium's normal rendering settings. The installer adds X11, Openbox, LightDM and Chromium to Lite. It installs Node 22 using the matching official ARM build and checks the download's SHA-256 checksum.

## Installation

1. Flash Raspberry Pi OS Lite using Raspberry Pi Imager. Set your username, hostname, Wi-Fi if needed, and enable SSH.
2. Boot the Pi and connect by SSH.
3. Copy or clone this repository to a folder owned by your normal user. From that folder run:

   ```sh
   sudo bash install.sh
   ```

4. Choose an admin password when prompted, then reboot:

   ```sh
   sudo reboot
   ```

The display opens `http://127.0.0.1:3000/`. From a phone on the same network, open `http://YOUR-HOSTNAME.local:3000/admin` or `http://PI-IP:3000/admin`. Sign in as `admin` with the password you chose. Set weather latitude, longitude, timezone, page rotation, and sleep/wake times. Save the configuration.

Clone and release downloads use the public repository. Update checks need no GitHub token.

## Trial alongside an existing kiosk

For a Pi already running another display system, use:

```sh
sudo bash install.sh --server-only
```

This installs and starts the server without configuring a graphical session. Preview it at `http://PI-IP:3000/`; the existing kiosk keeps its current URL. Browser restart controls require the full LightDM setup. The full installer refuses an existing CustomPiOS setup; use a fresh Lite card for the complete installation.

## Updates and storage

Keep the source checkout in your normal user's home folder. Update it and rerun the installer in the same mode:

```sh
git pull --ff-only
sudo bash install.sh
```

Use `--server-only` again if that is how you installed. Application files are replaced and the server restarts. The password, configuration, and uploads are preserved. Restart the browser from the admin page to load updated assets. Installation requires internet and is not transactional; if interrupted, rerun it and check service logs.

| Path | Purpose |
| --- | --- |
| `/opt/home-display/app` | Application code, owned by root |
| `/opt/home-display/node` | Node runtime |
| `/var/lib/home-display/config.json` | Saved settings and page rotation |
| `/var/lib/home-display/content` | Uploads and page edits |
| `/etc/home-display/environment` | Service settings and admin password hash |

Edits to bundled pages are stored as overrides in the content directory. Delete an override to return to the bundled version. Bundled application files cannot be deleted from the admin UI. Uploads are limited to 20 MB each. Back up `/var/lib/home-display` and `/etc/home-display` before updates or replacing the SD card. Existing files uploaded into an older app folder must be copied into the content directory; they are not imported automatically.

## Administration and troubleshooting

```sh
sudo systemctl status home-display
sudo journalctl -u home-display -n 50 --no-pager
sudo systemctl restart home-display
sudo systemctl restart lightdm       # full installation only
```

The server runs as `home-display`; the browser runs as `display-kiosk`. The server can only invoke the supplied helper for browser restart or reboot through its sudo rule.

To change the password, hash a new password without printing it, update the environment file, and restart the service:

```sh
read -rsp 'New admin password: ' NEW_PASSWORD; echo
printf '%s' "$NEW_PASSWORD" | /opt/home-display/node/bin/node /opt/home-display/app/password.js
unset NEW_PASSWORD
sudoedit /etc/home-display/environment
sudo systemctl restart home-display
```

Set `HOME_DISPLAY_ADMIN_PASSWORD_HASH` to the printed value (it starts with `scrypt$`). Older SHA-256 hashes keep working until you change the password. The web login uses HTTP Basic authentication. Keep this on a trusted home network; HTTPS is needed before exposing it beyond that network. Uploaded HTML/JavaScript is trusted custom dashboard code, so only the owner should have admin access.

### Pi 2 with the original DSI touchscreen

On the tested Pi 2, the screen showed boot text and then went black under KMS.
Switching to the firmware display overlay restored the dashboard. If you have
the same symptom on this hardware, run from the project checkout:

```sh
sudo bash pi/test-firmware-display.sh
sudo reboot
```

The script backs up the boot configuration. To undo the change, run it with
`--restore` and reboot. This workaround is specific to the tested Pi 2 setup;
the installer does not apply it automatically to other models.

## Using the Studio

Open `/admin` for Roompane Studio. It has five sections:

- **Pages** lists the rotation with live thumbnails. Drag to reorder, switch pages on or off, and tap a page to edit its name, duration and schedule (for example 08:00–17:59 on weekdays). **Add a page** brings back any ready-made page or adds a web address; **Design a page** starts a blank layout.
- **Screens** shows the display's network address with a QR code, screen profiles for other displays, and controls to turn the screen off, restart the browser or reboot the Pi.
- **Plugins** manages connections to printers, Home Assistant, photos and calendars.
- **Settings** holds the weather location, the nightly screen-off time, page transitions, installed fonts and uploaded files.
- **Updates** checks for and installs new releases.

Changes to pages and settings collect in a bar at the bottom of the screen: **Save changes** publishes them and **Discard** reverts to the last save. The HTML editor (open a ready-made page and choose **Edit HTML**) saves files separately and publishes immediately. Location search and weather use Open-Meteo and need internet access.

Designer blocks support bundled sans, serif and monospace fonts, font weight,
alignment, text/icon colours and optional background fills. Add still or animated
icons from the built-in library. Animation styles include pulse, float, spin,
bounce and fade, with adjustable speed. Reduced-motion preferences are respected.
Upload PNG/JPG/WebP images, GIF/SVG animations, or muted looping MP4/WebM videos
(maximum 20 MB per file). Uploaded media remains available in the media picker.
Short, low-resolution video clips are best for older Pis; supported codecs depend
on the browser. Font redistribution notices are in `studio-font-license.txt`.

Use **Plugins** for the Mainsail/Moonraker printer page or a custom single HTML
page. Configure its source, test the connection, and optionally hide it whenever
the source is disconnected. See `PLUGINS.md` for the page API and starter template.
Fonts (TTF, OTF, WOFF or WOFF2; maximum 4 MB) are installed under Settings and
persist alongside other uploaded assets.

The controller has a web app manifest, icons and an Install app button. For
phone installation, serve it through trusted HTTPS (for example an existing
HTTPS reverse proxy). The current LAN HTTP address works in a browser but does
not qualify for full PWA installation. On iPhone use Share → Add to Home Screen;
on supporting Android browsers use Install app. The app needs the Pi online and
reachable; it does not cache admin data or work offline.

## Development and alternate hosting

```sh
npm ci
npm test
npm start
```

Use Node 22 or newer. Without `HOME_DISPLAY_DATA_DIR`, runtime data stays in the source folder. Set `HOME_DISPLAY_ADMIN_PASSWORD_HASH` (create one with `node password.js`) to protect administration; without it the server logs a warning and anyone who can reach it can change the dashboard. Browser restart and reboot controls are only available on installer-based Pi setups.

## Backups and recovery

In **Settings → Backup and restore**, save your changes first, enter a backup password of at least 12 characters, then download the `.hdbackup` file. Store the file and password safely. The password cannot be reset or recovered.

Browser backups use authenticated AES-256-GCM encryption with a password-derived key. They contain saved settings, pages, uploaded files/fonts, screen schedules and plugin connections, including private plugin credentials. They exclude the device's admin password and operating-system configuration. The browser flow supports up to **50 MB of settings/media and 2,000 files** to keep memory use bounded on older Pis.

To restore, choose the file and enter its password. Studio checks the password and contents, then asks before replacing the saved configuration and media. Unsaved editor changes are discarded only after a successful restore. The previous data remains in a private `.before-restore-*` folder inside `/var/lib/home-display` for manual recovery. Those folders can be removed by the administrator once the restored display has been checked; they are excluded from subsequent browser backups.

### Full Pi data backup, including larger photo libraries

This method also saves device credentials. Install `gnupg` if needed (`sudo apt install gnupg`), then run from your home directory in Bash. The display pauses while the snapshot is taken and restarts when the command finishes.

```bash
sudo systemctl stop home-display && (
  trap 'sudo systemctl start home-display' EXIT
  set -o pipefail
  sudo tar -C / -czf - var/lib/home-display etc/home-display |
    gpg --symmetric --cipher-algo AES256 --output "home-display-full-$(date +%Y%m%d-%H%M%S).tar.gz.gpg"
)
```

Copy the encrypted file off the SD card. This is a data backup, not an operating-system image. To recover onto another Pi, install Roompane first, decrypt your own backup into a private temporary directory, inspect the archive, stop `home-display`, and restore its `var/lib/home-display` and `etc/home-display` directories to `/`. Set `/var/lib/home-display` ownership to `home-display:home-display`, retain restrictive permissions on `/etc/home-display/environment`, then restart the service. Reapply any hardware-specific DSI settings separately. A full restore replaces the admin password with the one from the backup.

### Screen sleep behavior

The default URL uses the schedule under **Settings**. Named screen profiles can inherit it or set their own on/off times under **Screens**. Equal times mean always on. Each screen has an independent manual off/on button; manual off persists across restarts. Turning it back on returns it to its schedule, so it stays dark if its scheduled sleep period is still active. Changes reach displays on their next configuration poll, within 30 seconds.

A downloadable SD-card image is a later milestone.

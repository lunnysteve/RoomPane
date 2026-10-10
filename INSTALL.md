# Install Home Display on a Raspberry Pi

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

While the repository is private, cloning and release downloads require GitHub access. Once public, the clone command in [README.md](README.md) needs no authentication. Public update checks and downloads need no token; private releases use the optional access setting under **Updates**.

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
printf '%s' "$NEW_PASSWORD" | sha256sum
unset NEW_PASSWORD
sudoedit /etc/home-display/environment
sudo systemctl restart home-display
```

Set `HOME_DISPLAY_ADMIN_PASSWORD_HASH` to the printed hash (the 64 hexadecimal characters). The web login uses HTTP Basic authentication. Keep this on a trusted home network; HTTPS is needed before exposing it beyond that network. Uploaded HTML/JavaScript is trusted custom dashboard code, so only the owner should have admin access.

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

## Visual page designer and controller app

Open `/admin` for Home Display Studio. Add a designer page, then place clock,
weather, text and image blocks by dragging or entering coordinates. Themes and
colours apply to designer pages. Existing HTML pages remain in the rotation and
can be edited through the HTML editor in Studio. Preview draft lets you check
HTML before publishing; Save HTML publishes that file immediately. Save changes
publishes designer layouts and settings separately.
Search for a weather location or enter coordinates and an IANA timezone.
Location search and weather use Open-Meteo and need internet access.

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
Studio also has Close and Cancel controls and font installation (TTF, OTF, WOFF
or WOFF2; maximum 4 MB). Font uploads persist alongside other uploaded assets.

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

Use Node 22. Without `HOME_DISPLAY_DATA_DIR`, runtime data stays in the source folder. Without a password hash, the existing development access behavior is retained. Set `HOME_DISPLAY_ADMIN_PASSWORD_HASH` to protect administration on other hosts. `HOME_DISPLAY_PI_HOST` enables optional SSH controls for a separate Pi; its SSH host key and credentials must already be configured. The installer selects local controls automatically.

The existing `deploy.sh` still targets the owner's Proxmox deployment; it is not used for standalone installs. A downloadable SD-card image and an installable phone web app are later milestones.

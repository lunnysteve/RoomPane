# Home Display

A self-hosted home dashboard with a visual page designer, custom HTML pages,
single-page home plugins and multiple screen profiles. Run the server on a
Raspberry Pi, then open its screen URLs on other Pis, browsers or Android TVs.

## Features

- Clock, weather, text, image, video and icon blocks with colours and animation.
- Bundled and uploaded fonts, image/animation uploads, and an HTML editor.
- Mainsail/Moonraker printer plugin with connection-based page visibility.
- Custom single HTML plugin pages and a small source-data API.
- Independent screen playlists and visible endpoint URLs.
- Versioned GitHub releases, update checks and application rollback.
- Android TV viewer and screensaver APK.

## Install on a Pi

Use a fresh Raspberry Pi OS Lite card (Bookworm or newer), configure Wi-Fi and
SSH in Raspberry Pi Imager, then copy or clone the project and run:

```sh
sudo bash install.sh
sudo reboot
```

Open `http://YOUR-PI:3000/admin` and log in as `admin` with the password chosen
during installation. The default display is `http://YOUR-PI:3000/`. Screen
profiles have URLs such as `http://YOUR-PI:3000/screen/living-room`.

Full setup and the Pi 2 DSI workaround: [INSTALL.md](INSTALL.md).
Use `--server-only` when hosting the server without the Pi kiosk.

## Screens, plugins and updates

Open **Screens & updates** to create screen profiles, copy their URLs and check
releases. Runtime state stays separate from application files and is preserved
across updates. This repository currently remains private; configure a read-only
GitHub token on the server to check and download private releases.

- [Plugin API and starter page](PLUGINS.md)
- [Release/versioning and private GitHub access](RELEASING.md)
- [Android TV setup and APK builds](android-tv/README.md)
- [Changelog](CHANGELOG.md)

The TV APK supports viewing on app launch and a system screensaver service.
Screensaver support depends on the TV firmware; device testing is still needed.

## Development

```sh
npm ci
npm test
npm start
```

Node 22 is required for the supported server installation. Browser integration
checks use Python with Playwright and Pillow; run `python tests/designer-browser.py`.
Updater replacement/rollback checks use `python tests/updater-rollback.py`.

Keep the admin interface on a trusted LAN or put it behind HTTPS. Uploaded HTML
and plugins are trusted owner code. Installable web-app support needs trusted
HTTPS for phone installation. Runtime settings, uploaded content, source keys,
GitHub tokens and Android signing keys are excluded from releases.

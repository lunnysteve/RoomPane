<p align="center"><img src="app-icon.svg" width="88" alt="Home Display logo"></p>

# Home Display

**Your home dashboard, designed by you.**

Turn a Raspberry Pi and a screen into a display for clocks, weather, photos, animated layouts and connected devices. Design pages in your browser, choose what each screen shows, and reuse the same dashboard on an Android TV.

Home Display runs on your own hardware. A Pi can host the dashboard and drive its attached display, or you can host the server separately and open screen URLs on other devices.

[Installation](INSTALL.md) · [Downloads](https://github.com/lunnysteve/home-display/releases) · [Plugin guide](PLUGINS.md) · [Android TV](android-tv/README.md) · [Changelog](CHANGELOG.md)

![Example dashboard with a large clock, weather and a welcome message](docs/images/display-preview.png)

## Make it yours

| Feature | What you can do |
| --- | --- |
| Page designer | Arrange clock, weather, text, image and icon blocks on an 800 × 480 canvas. |
| Fonts and themes | Choose colours, enlarge text, use bundled fonts or install your own TTF, OTF, WOFF or WOFF2 fonts. |
| Images and motion | Upload photos, GIFs, SVGs and silent looping videos; animate individual blocks. |
| HTML editor | Edit a page’s HTML, CSS and JavaScript, with a draft preview before saving. |
| Multiple screens | Give each display its own page selection and a URL you can copy. |
| Connected devices | Show Klipper/Moonraker printer status and selected Home Assistant entity states. Hide disconnected integrations. |
| Photos and calendar | Rotate local photos or Google Photos exports, and show upcoming Google Calendar/iCalendar events. |
| Universal plugins | Install reusable community definitions and HTML renderers, configure connections, and use any integration as a full page or designer block. |
| Updates | Check versioned GitHub releases and install application updates on supported Pi installations, with rollback if startup fails. |
| Android TV | View a screen when the app opens, or select Home Display as a system screensaver where supported. |

## Design in your browser

The Studio separates **Pages & designer**, **Screens**, **Plugins**, **Weather & schedule**, and **Updates**. Page colours and fonts stay beside the canvas; weather location and daily sleep times have their own settings area.

![Studio with page list, visual designer and theme controls](docs/images/studio-designer.png)

Add a page, place its blocks, choose fonts and colours, then select **Save page & settings** to send changes to the display. Screenshots use example pages and preview weather; your layout and live data will vary.

## Get started on a Raspberry Pi

You need a **Raspberry Pi 2 or newer**, an HDMI or DSI display, a microSD card and a suitable power supply. Flash **Raspberry Pi OS Lite, Bookworm or newer**, using Raspberry Pi Imager. Use 32-bit Lite on a Pi 2. Set a username, configure networking and enable SSH.

On the Pi:

```bash
sudo apt update
sudo apt install -y git
git clone https://github.com/lunnysteve/home-display.git
cd home-display
sudo bash install.sh
sudo reboot
```

The repository is currently private while the project is prepared for sharing; cloning and downloading releases requires access until it is made public. These commands also work unchanged once it is public.

Choose an admin password during installation. After reboot, visit **`http://YOUR-PI:3000/admin`** from another device on the same network and sign in as **`admin`**. The attached display opens the dashboard automatically.

For a Pi that only hosts the server, use `sudo bash install.sh --server-only`. The [installation guide](INSTALL.md) covers hardware, the Pi 2 DSI workaround, backups and troubleshooting. The installer targets Pi ARM hardware; the Node application can also run separately for development or other hosting. Network access is needed for installation and live weather.

## One server, more screens

Create profiles under **Screens** and choose which pages and plugins each one includes. Open its URL on a Pi kiosk, browser or Android TV connected to the server.

![Screen profiles with display URLs and playlist controls](docs/images/studio-screens.png)

| Endpoint | Purpose |
| --- | --- |
| `http://YOUR-PI:3000/` | Default display rotation. |
| `http://YOUR-PI:3000/admin` | Studio and administration. |
| `http://YOUR-PI:3000/screen/living-room` | A named screen profile, after you create it. |

Profiles share the page library and weather settings. Each profile selects its own playlist; devices need network access to the server.

## Connect your home

The plugin system separates reusable integration definitions from your own connection settings. Start with **Klipper / Moonraker**, **Home Assistant**, **Photos**, or **Calendar**. Every example works as a full page or a movable block in **Pages & designer**. Choose a connection in the block’s properties to use more than one device of the same type.

![Plugin setup with source address, connection test and connected-only visibility](docs/images/studio-plugins.png)

| Example | Setup |
| --- | --- |
| Klipper / Moonraker | Enter `http://PRINTER-IP:7125` and an API key if needed. |
| Home Assistant | Enter the server URL, a long-lived access token and the entity IDs you want to display. |
| Photos | Upload images or Google Photos exports, choose existing uploads, or add image URLs. Direct Google account sign-in is not part of this version. |
| Calendar | Paste your Google Calendar iCal address, use another feed, upload an `.ics` file, or choose a Home Assistant calendar. |

Use **Test connection** for a real request from the server. **Only show when connected** hides an unavailable full page or block; other content on the designed page keeps showing. Disable **Include as a full page in rotation** for integrations you only want inside your designs.

Other users can distribute plugins as a **JSON definition and HTML renderer**. Install them under **Plugins → Install a community plugin**, then enter your own connection settings. Read the [setup and developer guide](PLUGINS.md) and try the [installable power-meter example](plugin-examples/). Source credentials and private calendar feed addresses remain on the server.

## Android TV

Download **`home-display-tv-vVERSION.apk`** from [Releases](https://github.com/lunnysteve/home-display/releases), sideload it onto your TV, and open **Home Display**. Enter the server URL, load its profiles and choose a screen.

- Leave automatic viewing enabled to show the screen when the app opens.
- For a screensaver, choose Home Display in the TV’s system screensaver settings.
- Use Back or Menu to return to the app menu.

Android 6 or newer and a working Android System WebView are required. Screensaver availability depends on TV firmware. The APK is built and signed; playback and screensaver behaviour still need verification on a physical TV. See [Android TV setup](android-tv/README.md).

## Updates and your data

**Updates** shows the installed version, checks the latest stable release, and offers installation when a newer compatible release is available. **Public releases need no GitHub token.** Private releases use the optional repository access setting with a token restricted to **Contents: read-only**.

Standalone Pi updates preserve settings, uploads, installed fonts, screens and plugin configuration in `/var/lib/home-display`. The updater verifies the release checksum and restores the previous application if its health check fails. Back up runtime data and `/etc/home-display` before replacing a card or making major changes. See [release details](RELEASING.md).

Admin access is intended for a trusted local network; use HTTPS when accessing it through a proxy. Installable web-app features on phones require trusted HTTPS. Uploaded HTML and plugins run code supplied by the owner.

## Development and contributions

Use Node.js 22:

```bash
npm ci
npm test
npm start
```

Open `http://localhost:3000/admin`. The Pi installer configures authentication; a development server only enables it when an admin password hash is configured.

Browser checks use Python, Playwright and Pillow:

```bash
python -m pip install playwright pillow
python -m playwright install chromium
python tests/designer-browser.py
python tests/plugin-browser.py
python tests/updater-rollback.py
```

Bug reports, hardware test results, documentation improvements and plugin ideas are welcome. Include your device model, OS version, application version and steps to reproduce an issue. Keep credentials, personal settings and uploaded media out of contributions.

To regenerate the example screenshots and check Studio navigation, run `python tools/capture-screenshots.py`. This uses temporary example data and leaves your saved dashboard settings intact.

# Changelog

## 1.3.1

- Fix `pi/update-studio.sh` putting the previous updater helpers back after a successful run, which stopped the 1.3.0 helper migration taking effect. A failed run now restores them, and the new sudoers file is checked before it is installed.

## 1.3.0

- Encrypted Studio backup/restore for settings, media, fonts, screens and plugin connections; validates before restoring and retains previous data for recovery.
- Independent, persistent on/off controls and optional sleep schedules for each named screen.
- Clear connection/retry messages when a display cannot load its first page.
- Live page schedule changes, working manual sleep and an always-on option using matching sleep/wake times.
- Validation for malformed page addresses, schedules and duplicate page/screen IDs.
- Browser tests now run on main/pull requests and gate release publication.
- Release updates now replace privileged updater helpers with rollback, alongside the application.


- Redesigned Studio: a page list with live thumbnails, drag-to-reorder and on/off switches; a full-width page editor; one save bar with Discard; Settings for location, schedule, fonts and files.
- Per-page schedules (hours and days) and adding any ready-made page or web address, ported from the old admin console, which is removed.
- Screens shows the Pi's network address with a QR code, plus screen off/on, browser restart and reboot controls.
- The private-repository token only appears under Updates when it is needed.
- Countdown page no longer crashes once the countdown has finished.
- Dependencies updated to fix security advisories in multer, proxy-addr and qs.
- Admin passwords are hashed with salted scrypt (`node password.js`); existing SHA-256 hashes still work.
- The server warns at startup when no admin password is configured.
- Uploading a file with an existing name keeps both files unless the upload explicitly replaces it.
- Older pages use the bundled fonts instead of Google Fonts, so they render offline.
- NASA picture page caches the daily picture, accepts `?key=` for your own API key and handles errors.
- ISS page no longer falls back to an insecure HTTP API.
- Node.js 22 or newer is supported (previously 22 only).
- Release archives no longer include tests, tools or documentation images.
- Removed the superseded `weather-clock.html` page and the abandoned Wayland/X11 display trials.
- Rewritten public README with new screenshots.

## 1.2.1

- Fix blank named screens by loading rotation pages from the server root.
- Verify that named screen frames load real page content.

## 1.2.0

- Reusable plugin definitions and separate user connection settings.
- Community installation with a JSON manifest, HTML renderer and small browser SDK.
- Home Assistant entity tiles, local/exported photo slideshows and calendar agendas.
- Google Calendar iCal feeds, uploaded calendars, recurring events and Home Assistant calendars.
- All integrations available as full pages and configurable designer blocks.
- Plugin developer guide and installable community example.
- Private source credentials and calendar feed addresses remain on the server.
- Studio bootstrap updates now install changed dependencies with rollback.

## 1.1.1

- Focused Studio navigation for pages, screens, plugins, weather and updates.
- Separate global weather and schedule settings from page appearance.
- Optional private repository token settings; public releases need no token.
- Public-facing README with installation instructions and interface screenshots.
- Browser checks for navigation and mobile layout, plus token-free update checks.

## 1.1.0

- Standalone Pi OS Lite installer and persistent runtime storage.
- Visual page designer, HTML editing, fonts, icons, images and animations.
- Mainsail/Moonraker plugin and custom single HTML plugin pages.
- Connection-based plugin visibility and per-screen page selection.
- Screen endpoints, versioned GitHub release checks and verified updates with rollback.
- Signed Android TV viewer and DreamService screensaver APK.

The Pi 2 with its original DSI touchscreen uses the documented FKMS workaround.
Android TV playback and screensaver behaviour still require testing on a device.

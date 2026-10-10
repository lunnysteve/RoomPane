# Home Display plugin guide

Plugins extend Home Display with the devices and services people have at home. A reusable **definition** describes an integration; each user creates a **connection** with their own address, credentials and settings. A connection can be a full rotating page, a movable designer block, or both.

## Four examples to start with

| Example | What it shows | What you supply |
| --- | --- | --- |
| Klipper / Moonraker | Print state, file, progress, nozzle and bed temperatures | Moonraker address and optional API key |
| Home Assistant | Selected sensors, lights and other entity states | Server address, long-lived access token and entity IDs |
| Photos | A photo slideshow | Uploaded images, image URLs or photos exported from Google Photos |
| Calendar | Upcoming events, including recurring events | Google Calendar iCal address, another iCal feed, `.ics` file or Home Assistant calendar |

These are examples of the same plugin system. The community installer is not tied to a printer API. See [plugin-examples](plugin-examples/) for the implementation links and an installable power-meter example.

## Set up a connection

1. Open **Studio → Plugins → Add a plugin**.
2. Select a definition and name this connection. You can create multiple connections from one definition.
3. Enter its source and settings. Use **Test connection** for a real request from the display server.
4. Choose **Include as a full page in rotation** if you want a standalone page.
5. Choose **Only show when source connected** if the integration should disappear when unavailable.
6. Save the plugin. Use **Screens** to choose which displays include its full page.

Saving a connection is immediate. Page designer changes still need **Save changes** in the bar at the bottom of the Studio.

### Use a plugin inside a designed page

1. Open **Pages** and select or design a page.
2. Choose **+ Klipper / Moonraker**, **+ Home Assistant**, **+ Photos**, **+ Calendar**, or the name of an installed community definition.
3. If no enabled connection exists, Studio opens its setup. Save it to return to your page with the block added.
4. Move and resize the block. Select **Plugin connection** in its properties to switch between configured instances.
5. Save the page.

Blocks share the same connections as full pages. Built-in renderers adapt to their available space. A connected-only block becomes empty when its source disconnects; the rest of the designed page keeps showing. Full plugin pages are removed from rotation while disconnected.

## Example 1: Klipper / Moonraker

Choose **Klipper / Moonraker** and enter `http://PRINTER-IP:7125`. A bare printer IP is accepted and the form adds port 7125. This connects to Moonraker, the API used by Mainsail, rather than the Mainsail web page.

Enter an API key if Moonraker requires one. The server sends it as `X-Api-Key`. Connection testing checks `/server/info`; printer data comes from the printer objects query. A reachable Moonraker server with disconnected Klipper counts as disconnected. Reachable shutdown/error states remain visible as status information.

The definition ID remains `mainsail` so existing configurations continue working.

## Example 2: Home Assistant

Choose **Home Assistant**, enter `http://HOME-ASSISTANT-IP:8123`, and supply a **long-lived access token** created from your Home Assistant user profile.

Enter up to 12 entity IDs, one per line, for example:

```text
sensor.living_room_temperature
sensor.house_power
light.kitchen
binary_sensor.front_door
```

The server verifies `/api/` and reads only the selected `/api/states/ENTITY` endpoints. The renderer shows friendly names, state values and units. This is an information display; it does not call services or control devices. Credentials are sent as `Authorization: Bearer TOKEN` and remain on the server.

## Example 3: Photos, with or without Google Photos

Choose **Photos**. Upload multiple PNG, JPEG, WebP or GIF files, choose existing uploads, or enter image URLs one per line. Choose the time per photo and `contain` or `cover` image fit.

Each upload is limited to 20 MB. A slideshow can contain up to 200 photos. Prefer images sized for your display, particularly on older Pis. Remote image URLs must be accessible to the display browser; local uploads remain usable without internet access.

For Google Photos, download selected photos or export them, extract the image files, and upload those files here. This version does not connect to Google accounts or automatically synchronise a Google Photos library. There are no Google credentials to configure.

## Example 4: Google Calendar and other calendars

### Google Calendar (recommended first setup)

1. Open Google Calendar in a desktop browser.
2. Open **Settings**, choose the calendar under **Settings for my calendars**, then **Integrate calendar**.
3. Copy **Secret address in iCal format**. For an intentionally public calendar, its public iCal address also works.
4. Choose **Calendar** in Home Display and paste it into **Private iCalendar feed URL**.
5. Leave the Home Assistant source and entity fields empty, choose the number of days ahead, then test and save.

Google Calendar may not provide a secret iCal address for every account or managed organisation. You can use an allowed public feed, export an `.ics` file, or connect a Home Assistant calendar instead.

Treat a secret iCal address like a password. Home Display stores it privately and does not return it to display browsers or the connection listing. The field is blank when editing; leaving it blank keeps the saved address, and **Clear saved feed URL** removes it.

### Other calendar sources

- **iCalendar feed:** enter an HTTP(S) `.ics` feed. `webcal:` addresses are converted to HTTPS.
- **Calendar export:** upload an `.ics` file. This is a snapshot; upload a newer file to refresh it.
- **Home Assistant:** enter its source address, access token and a `calendar.*` entity ID. Leave the feed/file unset when using that source.

The agenda shows ongoing/upcoming events in the configured window (up to 90 days). Recurring iCalendar events, exclusions and modified occurrences are expanded by the calendar parser. The display shows event titles, start times and locations; timed events use the display device’s timezone. All-day events retain their calendar date.

## Build a community plugin

The simplest distributable plugin consists of **two files**:

- A JSON definition describing the name, version, source endpoint, authentication and editable settings.
- An HTML renderer that works at both full-screen and block sizes.

No server JavaScript needs installing or executing for this path. The core JSON adapter retrieves the configured endpoint and your renderer displays its data. For a protocol or format beyond HTTP JSON, contribute a server adapter to the project or provide a small JSON gateway to your service.

### Definition format, version 1

```json
{
  "schemaVersion": 1,
  "id": "community.your-name.power-meter",
  "name": "Power meter",
  "version": "1.0.0",
  "description": "Live power use from a home energy monitor.",
  "adapter": "json",
  "auth": "none",
  "sourceRequired": true,
  "healthPath": "/api/status",
  "pageFile": "power-meter.html",
  "fields": [
    {"key": "title", "label": "Display title", "type": "text", "default": "Home energy"},
    {"key": "unit", "label": "Unit", "type": "text", "default": "W"}
  ]
}
```

| Property | Rules |
| --- | --- |
| `schemaVersion` | Currently `1`. |
| `id` | A unique `community.*` ID using lowercase letters, digits, dots and hyphens. Keep it stable across versions. |
| `name`, `description` | The integration’s name and a short description. |
| `version` | `MAJOR.MINOR.PATCH`, separate from the main application version. |
| `adapter` | `json` for installed community definitions. Built-in adapters are part of the core application. |
| `auth` | `none`, `api-key` (`X-Api-Key`) or `bearer` (`Authorization: Bearer`). Users enter credentials separately. |
| `sourceRequired` | Whether users must configure a source HTTP(S) address. |
| `healthPath` | Source-relative GET path. HTTP success means connected. JSON is returned as `data`; a non-JSON success returns `null`. |
| `pageFile` | Uploaded HTML renderer filename. The installer substitutes the filename it assigned to the uploaded renderer. |
| `fields` | Up to 20 settings with a unique `key`, `label`, `type`, and scalar `default`. Supported types: `text`, `textarea`, `number`, `checkbox`, `media`. |

Paths can refer to settings with `{fieldKey}`. For example, `/api/states/{entity}` uses the `entity` field, URL-encoded by the server. This lets users choose a source entity without modifying the definition. Field values are ordinary display settings: do not put passwords in them. Use the connection’s private credential field.

Definitions cannot replace built-in IDs. Reinstalling the same community ID updates its definition; existing connections retain their IDs. Keep field keys and data contracts compatible, or explain the migration in your plugin’s release notes. Deleting a renderer file breaks connections that depend on it, so keep it installed.

### Install and share

1. Open **Plugins → Install a community plugin**.
2. Upload the HTML renderer, choose its JSON definition, and select **Install definition**.
3. Add a connection and select the newly installed definition.
4. Enter the source, credential and settings, then test and save.
5. Use the new definition’s button in the page designer, or include its full page in rotation.

Share the two files and a short README explaining the source API, authentication, expected response, setup, supported Home Display schema version and screenshots. Include no user addresses, credentials or private feed links. The installable [power-meter example](plugin-examples/) is a starting point.

## Renderer SDK

Load the SDK from the display server:

```html
<script src="/plugin-sdk.js"></script>
<script>
HomeDisplayPlugin.watch(function (result) {
  document.getElementById('title').textContent = result.options.title || result.name;
  document.getElementById('reading').textContent =
    result.connected ? String(result.data.watts) : result.message;
});
</script>
```

The page receives `?plugin=CONNECTION_ID`. Designer blocks also receive `embedded=1`; built-in renderer URLs use `id` instead. The SDK accepts either ID parameter.

| SDK member | Purpose |
| --- | --- |
| `HomeDisplayPlugin.id` | Current connection ID. |
| `HomeDisplayPlugin.embedded` | Whether the renderer is inside a designer block. |
| `await HomeDisplayPlugin.config()` | Public connection metadata and ordinary `options`. No source credentials or private feed address. |
| `await HomeDisplayPlugin.data()` | Latest connection status and source data. |
| `HomeDisplayPlugin.watch(callback, interval)` | Render immediately, then poll. Includes ordinary settings in `result.options`; returns a stop function. Default interval is 10 seconds, minimum 6 seconds. |

The SDK hides a connected-only embedded renderer while its source is unavailable. Handle offline states in your renderer for connections that do not use this option.

### Status/data response

```json
{
  "id": "plugin_CONNECTION_ID",
  "name": "Home energy",
  "type": "community.your-name.power-meter",
  "connected": true,
  "message": "Source connected",
  "checkedAt": "2026-10-10T12:00:00.000Z",
  "data": {"watts": 123}
}
```

Render untrusted source text with `textContent`. Use flexible CSS, `clamp()`, and grid layouts instead of assuming an 800 × 480 viewport. A designer block might be much smaller. Avoid page scrollbars where possible, keep media lightweight, and clean up timers if you implement your own lifecycle.

## HTTP API

| Endpoint | Access | Purpose |
| --- | --- | --- |
| `GET /api/plugin-catalog` | Admin | Built-in and installed definitions. |
| `POST /api/plugin-definitions` | Admin | Install/update a JSON definition. |
| `GET /api/plugins` | Admin | Configured connections, with private credentials removed. |
| `POST /api/plugins` | Admin | Create/update a connection. |
| `POST /api/plugins/test` | Admin | Test submitted settings with a real source request. |
| `DELETE /api/plugins/:id` | Admin | Remove a connection. |
| `GET /api/plugin-view/:id` | Display | Public renderer metadata and ordinary settings. |
| `GET /api/plugin-data/:id` | Display | Cached status and data. |
| `GET /api/plugin-status` | Display | Connection statuses and rotating plugin pages. |

Source requests have a five-second timeout, a 1 MB response limit and no redirects. Cached requests are shared for six seconds. The server only contacts sources configured by an administrator; viewers cannot supply arbitrary fetch URLs. Raw JSON data is visible to display clients, so choose an endpoint containing only information you intend to display.

Runtime definitions are stored in `plugin-definitions.json`, connections in private `plugins.json`, and renderers/media in the content directory. All stay in the runtime data directory and survive application updates. Uploaded HTML is owner-installed code; only install renderers you trust.

## Test before sharing

- Test connection success, rejected credentials, unavailable sources and reconnects.
- Test both a full page and a small designer block.
- Test more than one connection from the same definition.
- Check that private credentials are absent from public configuration and rendered HTML.
- Test on the target hardware; Pi 2 is more limited than a desktop browser.

Core checks are `npm test`, `python tests/designer-browser.py`, and `python tests/plugin-browser.py`. The tests use local HTTP sources; they do not claim to verify anyone’s live printer, Google Calendar or Home Assistant installation.

Reference APIs: [Moonraker](https://moonraker.readthedocs.io/en/latest/external_api/introduction/), [Home Assistant REST](https://developers.home-assistant.io/docs/api/rest/), [Google Calendar iCal addresses](https://support.google.com/calendar/answer/37648), [node-ical recurring events](https://github.com/jens-maus/node-ical).

# Plugin examples

The four built-in examples are available under **Plugins** and as buttons in the page designer:

| Example | Definition ID | Source | Renderer |
| --- | --- | --- | --- |
| Klipper / Moonraker | `mainsail` (retained for compatibility) | Moonraker HTTP API | Printer full page and responsive printer block |
| Home Assistant | `homeassistant` | Authenticated entity REST endpoints | Responsive entity tiles |
| Photos | `photos` | Uploads, URLs, or image files exported from Google Photos | Slideshow |
| Calendar | `calendar` | Google Calendar iCal feed, uploaded `.ics`, other iCal feed, or Home Assistant calendar | Upcoming agenda |

See [the setup and developer guide](../PLUGINS.md) for all four. Their reusable definitions are in [plugin-catalog.js](../plugin-catalog.js); their server adapters are in [plugin-engine.js](../plugin-engine.js), and the common responsive renderer is [plugin-view.js](../plugin-view.js).

## A community plugin you can install

`power-meter.json` and `power-meter.html` demonstrate the same installation flow available to other authors:

1. In **Plugins → Install a community plugin**, upload the HTML renderer and JSON definition.
2. Select **Install definition**.
3. Add a plugin instance and select **Power meter example**.
4. Enter your source address. It must respond to `GET /api/status` with JSON such as `{"watts": 123}`. This is a real source request; the example does not simulate a connected device.
5. Enter a display title and unit, then test and save.
6. Use it as a full page, a designer block, or both.

Change the endpoint and renderer to fit your device. Change the definition ID before distributing your own plugin. Share the definition and renderer, without anyone’s source credentials.

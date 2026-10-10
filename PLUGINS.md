# Single-page home plugins

Open **Plugins** in Studio. Mainsail connects to **Moonraker**, the API used by
Mainsail and Klipper. Enter the printer IP (the form adds port 7125), or enter a
full Moonraker URL. Supply an API key if Moonraker requires one. **Test connection**
makes a real request from the display server; it does not simulate a connection.

Save the plugin to add its page to the rotation. **Only show when source
connected** hides it when the Pi cannot reach Moonraker or when Moonraker reports
that Klipper is disconnected. Reachable Klipper error/shutdown states remain
visible as status information. Availability is polled every 10 seconds, with
short request timeouts and a shared six-second response cache.

## Create your own plugin

1. Download `plugin-example.html`, or write your own standalone HTML page.
2. Keep its CSS and JavaScript inline, or upload associated assets separately.
3. In Plugins, select **Custom single-page plugin** and upload the HTML file.
4. Optionally enter a source URL and a health/data path, such as `/api/status`.
5. Test, select a display duration, and save.

The plugin page receives `?plugin=ID`. It can read
`GET /api/plugin-data/ID` on the display server. The response contains `name`,
`connected`, `message`, `checkedAt`, and `data`. For custom plugins, `data` is
the configured endpoint's JSON response, or null for a non-JSON health response.
Only the configured source/path is fetched. A successful HTTP response means
connected for custom plugins. Standalone pages without a source can run with
connected-only disabled.

Optional source keys are sent as `X-Api-Key`; the Moonraker integration uses this
header. Source keys are stored in a separate private `plugins.json` file in the
runtime data directory and are never returned to plugin pages or public config.
The data selected for display is available on the LAN, like other dashboard data.
Use trusted plugin HTML: custom pages run with the dashboard origin's privileges.

The initial plugin API reads source data. It does not expose printer controls,
execute server-side plugin code, or install dependencies. Integrations requiring
other authentication methods can extend this API in a later version.

Moonraker reference:
- https://moonraker.readthedocs.io/en/latest/external_api/server/
- https://moonraker.readthedocs.io/en/latest/external_api/printer/
- https://moonraker.readthedocs.io/en/latest/external_api/authorization/

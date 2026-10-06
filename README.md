# home-display

Smart wall display dashboard: rotating full-screen pages (time, weather, humidity,
moon phase / sky tonight, forecast, ISS, NASA picture, countdown) plus an admin page
that picks which pages rotate and when the screen sleeps.

## Where things live

- **Source of truth:** this folder, `C:\Users\slunn\Projects\home-display`
- **GitHub:** `lunnysteve/home-display` (private), branch `main`
- **Live:** pve2 (192.168.0.200) LXC 105, http://192.168.0.21/
  - `/usr/share/caddy` is a git checkout of `main` (read-only deploy key
    `/root/.ssh/github_display`, ssh alias `github-display`)
  - Caddy on :80 reverse-proxies to the Node app on :3000 (`server.js`, pm2 app `home-display`)

Flow: edit here -> commit -> `git push` -> `./deploy.sh` (CT 105 pulls from GitHub).

## Files

- `index.html` - the rotator the display browser loads; `admin.html` - its control page
- `server.js` - Express app: serves the pages, `/api` for config and uploads
- `three_lib.js` + `three_common.css` - shared by the `three_*.html` pages; deploy them together.
  Preview weather states with `?kind=thunder&hum=80&flash=1`.
- `weather-clock.html`, `large_*`, `forecast.html`, `iss.html`, `nasa.html`, `countdown.html` - older pages
- `business-finder/`, `voron/` - standalone pages

## Runtime state (not in git)

- `config.json` - page rotation and sleep/wake times, written by the admin page.
  `config.example.json` is a snapshot; copy it to `config.json` to start fresh.
- Files uploaded through the admin page land in the app folder and stay untracked.

## Deploy

```sh
./deploy.sh          # pull latest main on CT 105; npm ci + pm2 restart only if server/deps changed
./deploy.sh status   # live commit, git status, pm2 state
./deploy.sh logs     # recent pm2 logs
```

The pull is `--ff-only`, so it refuses if someone edited tracked files on the live box.

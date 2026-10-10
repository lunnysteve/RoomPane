// Shared code for the lightweight display pages (display, time, weather, humidity, sky).
// Plain script, no dependencies: the Pi 2 kiosk cannot run WebGL and a failed CDN import blanked every page.
// Preview overrides: ?kind=thunder&hum=80&age=14 (moon age in days).
(function () {
  const settings = window.DISPLAY_SETTINGS || {};
  const LAT = settings.latitude ?? 51.4185, LON = settings.longitude ?? -0.9530, TZ = settings.timezone || 'Europe/London';
  const CACHE_KEY = `lite-weather:${LAT}:${LON}:${TZ}:${settings.units || 'celsius'}`, FRESH_MS = 10 * 60 * 1000, RETRY_MS = 2 * 60 * 1000;
  if (settings.units === 'fahrenheit') document.querySelectorAll('.unit').forEach(el => { if (el.textContent === '°C') el.textContent = '°F'; });
  const query = new URLSearchParams(location.search);
  const $ = (id) => document.getElementById(id);
  const set = (id, v) => { const el = $(id); if (el && el.textContent !== String(v)) el.textContent = v; };

  // ------------------------------------------------------------ time
  const fmt = (o) => new Intl.DateTimeFormat('en-GB', Object.assign({ timeZone: TZ }, o));
  const clockFmt = fmt({ hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const hmFmt = fmt({ hour: '2-digit', minute: '2-digit', hour12: false });
  const dateFmt = fmt({ weekday: 'long', day: 'numeric', month: 'long' });
  const shortDateFmt = fmt({ weekday: 'short', day: 'numeric', month: 'short' });
  function now() {
    const p = {}; clockFmt.formatToParts(new Date()).forEach((x) => { p[x.type] = x.value; });
    return { h: +p.hour % 24, m: +p.minute, s: +p.second, hh: String(+p.hour % 24).padStart(2, '0'), mm: p.minute, ss: p.second };
  }
  // calls fn every second, aligned to the second boundary
  function everySecond(fn) {
    const run = () => { fn(now()); setTimeout(run, 1000 - (Date.now() % 1000) + 5); };
    run();
  }

  // ------------------------------------------------------------ weather
  function describe(code, isDay) {
    const d = (a, b) => (isDay ? a : b);
    const m = {
      0: ['Clear', d('clear', 'clear-night')], 1: ['Mainly Clear', d('partly-cloudy', 'partly-cloudy-night')],
      2: ['Partly Cloudy', d('partly-cloudy', 'partly-cloudy-night')], 3: ['Overcast', 'cloudy'],
      45: ['Foggy', 'fog'], 48: ['Icy Fog', 'fog'],
      51: ['Drizzle', 'rain'], 53: ['Drizzle', 'rain'], 55: ['Drizzle', 'rain'], 56: ['Freezing Drizzle', 'rain'], 57: ['Freezing Drizzle', 'rain'],
      61: ['Light Rain', 'rain'], 63: ['Rain', 'rain'], 65: ['Heavy Rain', 'rain'], 66: ['Freezing Rain', 'rain'], 67: ['Freezing Rain', 'rain'],
      71: ['Light Snow', 'snow'], 73: ['Snow', 'snow'], 75: ['Heavy Snow', 'snow'], 77: ['Snow Grains', 'snow'],
      80: ['Showers', 'rain'], 81: ['Showers', 'rain'], 82: ['Heavy Showers', 'rain'],
      85: ['Snow Showers', 'snow'], 86: ['Heavy Snow Showers', 'snow'],
      95: ['Thunderstorm', 'thunder'], 96: ['Thunderstorm', 'thunder'], 99: ['Thunderstorm', 'thunder'],
    };
    const r = m[code] || ['Cloudy', 'cloudy'];
    return { label: r[0], kind: r[1] };
  }
  const humWord = (h) => (h < 30 ? 'Dry' : h < 60 ? 'Comfortable' : h < 75 ? 'Humid' : 'Very humid');

  async function fetchWeather() {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
      '&current=temperature_2m,apparent_temperature,relative_humidity_2m,dew_point_2m,wind_speed_10m,pressure_msl,weather_code,is_day' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset&forecast_days=2' +
      `&timezone=${encodeURIComponent(TZ)}&timeformat=unixtime&temperature_unit=${settings.units === 'fahrenheit' ? 'fahrenheit' : 'celsius'}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const j = await res.json(), c = j.current, d = j.daily, info = describe(c.weather_code, c.is_day === 1);
    return {
      at: Date.now(), kind: info.kind, label: info.label, isDay: c.is_day === 1,
      temp: Math.round(c.temperature_2m), feels: Math.round(c.apparent_temperature),
      hum: Math.round(c.relative_humidity_2m), dew: Math.round(c.dew_point_2m),
      wind: Math.round(c.wind_speed_10m), pressure: Math.round(c.pressure_msl),
      hi: Math.round(d.temperature_2m_max[0]), lo: Math.round(d.temperature_2m_min[0]),
      rain: d.precipitation_probability_max[0],
      sunrise: d.sunrise[0] * 1000, sunset: d.sunset[0] * 1000, nextSunrise: d.sunrise[1] * 1000,
      tomorrow: { label: describe(d.weather_code[1], true).label, hi: Math.round(d.temperature_2m_max[1]), lo: Math.round(d.temperature_2m_min[1]) },
    };
  }
  function applyOverrides(w) {
    const o = Object.assign({}, w);
    if (query.get('kind')) { o.kind = query.get('kind'); o.label = o.kind.replace(/-/g, ' '); }
    if (query.get('hum')) o.hum = +query.get('hum');
    return o;
  }
  // calls fn(weather) with cached data straight away (so numbers never sit blank), then fresh data every 10 min
  function onWeather(fn) {
    let cached = null;
    try { cached = JSON.parse(localStorage.getItem(CACHE_KEY)); } catch (e) { /* ignore bad cache */ }
    if (cached) fn(applyOverrides(cached));
    const load = async () => {
      if (cached && Date.now() - cached.at < FRESH_MS) { setTimeout(load, FRESH_MS - (Date.now() - cached.at)); return; }
      try {
        cached = await fetchWeather();
        localStorage.setItem(CACHE_KEY, JSON.stringify(cached));
        document.body.classList.remove('stale');
        fn(applyOverrides(cached));
        setTimeout(load, FRESH_MS);
      } catch (e) {
        document.body.classList.add('stale');
        setTimeout(load, RETRY_MS);
      }
    };
    load();
  }
  // the next sun event as text, e.g. "Sunset 18:32"
  function nextSun(w) {
    const t = Date.now();
    if (t < w.sunrise) return `Sunrise ${hmFmt.format(new Date(w.sunrise))}`;
    if (t < w.sunset) return `Sunset ${hmFmt.format(new Date(w.sunset))}`;
    return `Sunrise ${hmFmt.format(new Date(w.nextSunrise))}`;
  }
  function setKind(kind) {
    document.body.className = document.body.className.replace(/\bk-\S+/g, '').trim() + ' k-' + kind;
  }

  // ------------------------------------------------------------ moon
  const SYNODIC = 29.530588853, DAY = 86400000;
  // days since a known new moon (2000-01-06 18:14 UTC); within a few hours, plenty for a wall display
  function moonAge(t) {
    if (query.get('age')) return +query.get('age');
    const jd = (t || Date.now()) / DAY + 2440587.5;
    return (((jd - 2451550.1) % SYNODIC) + SYNODIC) % SYNODIC;
  }
  const moonLit = (age) => (1 - Math.cos((age / SYNODIC) * 2 * Math.PI)) / 2;
  function moonName(age) {
    const names = ['New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous', 'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent'];
    return names[Math.floor(((age / SYNODIC) * 8 + 0.5) % 8)];
  }
  // date of the next moment the moon reaches the given age (0 = new, SYNODIC/2 = full)
  function nextMoon(targetAge) {
    const age = moonAge();
    let days = targetAge - age; if (days <= 0.5) days += SYNODIC;
    return new Date(Date.now() + days * DAY);
  }

  // ------------------------------------------------------------ SVG
  // moon disc at (cx,cy) radius r, lit part drawn as an arc plus an elliptical terminator (northern hemisphere view)
  function moonShape(age, cx, cy, r) {
    const a = (age / SYNODIC) * 2 * Math.PI, rx = Math.abs(Math.cos(a)) * r, waxing = age < SYNODIC / 2, k = moonLit(age);
    const top = `${cx} ${cy - r}`, bot = `${cx} ${cy + r}`;
    const outer = waxing ? 1 : 0, inner = waxing ? (k < 0.5 ? 0 : 1) : (k < 0.5 ? 1 : 0);
    const lit = `M${top} A${r} ${r} 0 0 ${outer} ${bot} A${rx} ${r} 0 0 ${inner} ${top}Z`;
    return `<g opacity=".22"><circle cx="${cx}" cy="${cy}" r="${r * 1.35}" fill="#b5afd9" class="glow"/></g>` +
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#262b38"/>` +
      `<path d="${lit}" fill="#eef0f4"/>` +
      `<circle cx="${cx - r * .3}" cy="${cy - r * .2}" r="${r * .14}" fill="#000" opacity=".07"/>` +
      `<circle cx="${cx + r * .25}" cy="${cy + r * .3}" r="${r * .2}" fill="#000" opacity=".06"/>` +
      `<circle cx="${cx + r * .1}" cy="${cy - r * .45}" r="${r * .09}" fill="#000" opacity=".07"/>`;
  }
  const CLOUD = 'M30 72h42a14 14 0 0 0 0-28a20 20 0 0 0-38-6a13 13 0 0 0-4 34z';
  const cloud = (fill, cls, dy) => `<g class="${cls}" transform="translate(0 ${dy || 0})"><path d="${CLOUD}" fill="${fill}"/></g>`;
  function sun(cx, cy, r) {
    let rays = '';
    for (let i = 0; i < 8; i++) {
      const t = (i / 8) * 2 * Math.PI, a = r * 1.45, b = r * 1.9;
      rays += `<line x1="${cx + Math.cos(t) * a}" y1="${cy + Math.sin(t) * a}" x2="${cx + Math.cos(t) * b}" y2="${cy + Math.sin(t) * b}"/>`;
    }
    return `<g opacity=".3"><circle cx="${cx}" cy="${cy}" r="${r * 1.6}" fill="#e7b785" class="glow"/></g>` +
      `<g class="spin" stroke="#e7b785" stroke-width="${r * .22}" stroke-linecap="round">${rays}</g>` +
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#e7b785"/>`;
  }
  function drops(color, cls, n) {
    let s = '';
    for (let i = 0; i < n; i++) {
      const x = 36 + i * (30 / (n - 1)), delay = ((i * 0.37) % 1).toFixed(2);
      s += cls === 'flake'
        ? `<circle class="flake" style="animation-delay:-${delay * 3}s" cx="${x}" cy="80" r="2.6" fill="${color}"/>`
        : `<line class="drop" style="animation-delay:-${delay}s" x1="${x}" y1="76" x2="${x - 2}" y2="84" stroke="${color}" stroke-width="3" stroke-linecap="round"/>`;
    }
    return s;
  }
  // weather icon for a kind, in a 100x100 viewBox; night icons use the real moon phase
  function icon(kind) {
    const age = moonAge(), light = '#d9dee7', grey = '#9aa3b2', dark = '#6b7383';
    let body;
    switch (kind) {
      case 'clear': body = sun(50, 50, 17); break;
      case 'clear-night': body = moonShape(age, 50, 50, 24); break;
      case 'partly-cloudy': body = sun(38, 38, 13) + cloud(light, 'drift', 4); break;
      case 'partly-cloudy-night': body = moonShape(age, 38, 36, 16) + cloud(light, 'drift', 6); break;
      case 'fog': body = cloud(grey, 'drift', -8) + [70, 80, 90].map((y, i) =>
        `<line class="${i % 2 ? 'drift2' : 'drift'}" x1="${24 + i * 4}" y1="${y}" x2="${76 - i * 4}" y2="${y}" stroke="${light}" stroke-width="4" stroke-linecap="round" opacity=".6"/>`).join(''); break;
      case 'rain': body = cloud(grey, 'drift', -10) + drops('#6fa8dc', 'drop', 5); break;
      case 'snow': body = cloud(light, 'drift', -10) + drops('#eef0f4', 'flake', 5); break;
      case 'thunder': body = cloud(dark, 'drift', -10) + drops('#6fa8dc', 'drop', 4) +
        '<path class="bolt" d="M52 58l-9 16h8l-4 14 13-19h-8l5-11z" fill="#dbc298"/>'; break;
      default: body = cloud(dark, 'drift2', -6) + cloud(light, 'drift', 6);
    }
    return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
  }
  // water drop filled to the humidity level, with a slow wave on the surface (100x120 viewBox)
  function humidityDrop(hum) {
    const DROP = 'M50 6C50 6 14 52 14 80a36 36 0 0 0 72 0C86 52 50 6 50 6z';
    const level = 116 - (Math.max(0, Math.min(100, hum)) / 100) * 108;
    let wave = 'M0 0';
    for (let x = 0; x < 300; x += 50) wave += `q25 -5 50 0`;
    wave += 'v130h-300z';
    return `<svg viewBox="0 0 100 120" xmlns="http://www.w3.org/2000/svg">` +
      `<defs><clipPath id="dropClip"><path d="${DROP}"/></clipPath></defs>` +
      `<path d="${DROP}" fill="#1b2029" stroke="rgba(255,255,255,.12)" stroke-width="1.5"/>` +
      `<g clip-path="url(#dropClip)"><g transform="translate(0 ${level})">` +
      `<path class="wave" d="${wave}" fill="#6fa8dc" opacity=".55"/>` +
      `<g transform="translate(-25 2)"><path class="wave" style="animation-duration:8s" d="${wave}" fill="#6fa8dc"/></g></g></g>` +
      `<path d="M36 50q-6 12 -6 24" stroke="#fff" stroke-width="4" stroke-linecap="round" fill="none" opacity=".18"/></svg>`;
  }

  window.Lite = {
    $, set, query, TZ, now, everySecond, hm: (t) => hmFmt.format(new Date(t)), dateText: () => dateFmt.format(new Date()),
    shortDate: (t) => shortDateFmt.format(new Date(t)), describe, humWord, onWeather, setKind, nextSun,
    SYNODIC, moonAge, moonLit, moonName, nextMoon, moonShape, icon, humidityDrop,
  };
  document.addEventListener('DOMContentLoaded', () => {
    const dot = document.createElement('div'); dot.id = 'stale'; document.body.appendChild(dot);
  });
})();

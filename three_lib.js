// Shared pieces for the three.js display pages (three_*.html). Loaded as an ES module; three.js comes from a CDN.
// If the CDN is unreachable the import fails and each page falls back to its plain text layer.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
export { THREE };

export const LAT = 51.4185, LON = -0.9530, TZ = 'Europe/London';
export const query = new URLSearchParams(location.search); // ?kind=thunder&hum=80&flash=1 preview overrides
export const rand = (a, b) => a + Math.random() * (b - a);

// ---------------------------------------------------------------- data
const clockFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const dateFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' });
export function londonNow() {
  const p = Object.fromEntries(clockFmt.formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { h: +p.hour % 24, m: +p.minute, s: +p.second, ms: Date.now() % 1000 };
}
export const dateText = () => dateFmt.format(new Date());
export const hhmm = (d) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);

export function describe(code, isDay) {
  const day = (a, b) => (isDay ? a : b);
  const m = {
    0: ['Clear', day('clear', 'clear-night')],
    1: ['Mainly Clear', day('partly-cloudy', 'partly-cloudy-night')],
    2: ['Partly Cloudy', day('partly-cloudy', 'partly-cloudy-night')],
    3: ['Overcast', 'cloudy'],
    45: ['Foggy', 'fog'], 48: ['Icy Fog', 'fog'],
    51: ['Drizzle', 'rain'], 53: ['Drizzle', 'rain'], 55: ['Drizzle', 'rain'],
    61: ['Light Rain', 'rain'], 63: ['Rain', 'rain'], 65: ['Heavy Rain', 'rain'],
    71: ['Light Snow', 'snow'], 73: ['Snow', 'snow'], 75: ['Heavy Snow', 'snow'], 77: ['Snow', 'snow'],
    80: ['Showers', 'rain'], 81: ['Showers', 'rain'], 82: ['Heavy Showers', 'rain'],
    85: ['Snow Showers', 'snow'], 86: ['Heavy Snow', 'snow'],
    95: ['Thunder', 'thunder'], 96: ['Thunder', 'thunder'], 99: ['Thunder', 'thunder'],
  };
  const r = m[code] || ['Cloudy', 'cloudy'];
  return { label: r[0], kind: r[1] };
}
export const humWord = (h) => (h < 30 ? 'Dry' : h < 60 ? 'Comfortable' : h < 75 ? 'Humid' : 'Very humid');

// one Open-Meteo call covers every page; times come back as unix seconds
export async function fetchWeatherData() {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
    '&current=temperature_2m,apparent_temperature,relative_humidity_2m,dew_point_2m,wind_speed_10m,pressure_msl,weather_code,is_day' +
    '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset&forecast_days=2' +
    `&timezone=${encodeURIComponent(TZ)}&timeformat=unixtime`;
  const j = await (await fetch(url)).json();
  const c = j.current, d = j.daily, info = describe(c.weather_code, c.is_day === 1);
  if (query.get('kind')) { info.kind = query.get('kind'); info.label = info.kind.replace(/-/g, ' '); }
  return {
    kind: info.kind, label: info.label, isDay: c.is_day === 1,
    temp: Math.round(c.temperature_2m), feels: Math.round(c.apparent_temperature),
    hum: query.get('hum') ? +query.get('hum') : Math.round(c.relative_humidity_2m),
    dew: Math.round(c.dew_point_2m), wind: Math.round(c.wind_speed_10m), pressure: Math.round(c.pressure_msl),
    hi: Math.round(d.temperature_2m_max[0]), lo: Math.round(d.temperature_2m_min[0]), rain: d.precipitation_probability_max[0],
    sunrise: new Date(d.sunrise[0] * 1000), sunset: new Date(d.sunset[0] * 1000), nextSunrise: new Date(d.sunrise[1] * 1000),
    prevSunset: new Date((d.sunset[0] - 86400) * 1000),
  };
}

// ---------------------------------------------------------------- tiny drawing helpers (flat, unlit, sorted by z)
export const CIRCLE = new THREE.CircleGeometry(1, 40);
export const PLANE = new THREE.PlaneGeometry(1, 1);
export const flat = (geo, color, opacity = 1, z = 0) => {
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false }));
  m.position.z = z; return m;
};
export const disc = (r, color, opacity, z) => { const m = flat(CIRCLE, color, opacity, z); m.scale.set(r, r, 1); return m; };
export const bar = (w, h, color, opacity, z) => { const m = flat(PLANE, color, opacity, z); m.scale.set(w, h, 1); return m; };
export const soft = (() => { // round, soft-edged sprite for snow, stars and glows
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.45, 'rgba(255,255,255,0.55)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
})();
export const glow = (r, color, opacity, z) => { // r = radius; additive so it reads as light, not a grey disc
  const m = new THREE.Mesh(PLANE, new THREE.MeshBasicMaterial({ map: soft, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false }));
  m.scale.set(r * 2, r * 2, 1); m.position.z = z; return m;
};

// ---------------------------------------------------------------- stage: renderer, camera, gradient background, particles
const PALETTE = {
  clear: ['#2a5d93', '#0f2540'], 'clear-night': ['#0b132b', '#010409'],
  'partly-cloudy': ['#2c4a6b', '#101c30'], 'partly-cloudy-night': ['#0f172a', '#020617'],
  cloudy: ['#334155', '#0f172a'], fog: ['#475569', '#1e293b'], rain: ['#1e293b', '#020617'],
  snow: ['#3b4a63', '#1a2335'], thunder: ['#0f1424', '#020408'],
};
export function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  const dpr = renderer.getPixelRatio();
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1.78, 1.78, 1, -1, -10, 10);
  camera.position.z = 5;

  const bgTop = new THREE.Color(PALETTE.cloudy[0]), bgBot = new THREE.Color(PALETTE.cloudy[1]), tmp = new THREE.Color();
  let tgtTop = PALETTE.cloudy[0], tgtBot = PALETTE.cloudy[1];
  const bgMat = new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false,
    uniforms: { uTop: { value: bgTop }, uBot: { value: bgBot }, uFlash: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `uniform vec3 uTop; uniform vec3 uBot; uniform float uFlash; varying vec2 vUv;
      void main(){ vec3 c = mix(uBot, uTop, vUv.y); c *= 1.0 - distance(vUv, vec2(0.5)) * 0.4; c += uFlash * 0.22; gl_FragColor = vec4(c, 1.0); }`,
  });
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bgMat);
  bg.frustumCulled = false; bg.renderOrder = -10; scene.add(bg);

  const RAIN_N = 200, rainPos = new Float32Array(RAIN_N * 6);
  const rainDrops = Array.from({ length: RAIN_N }, () => ({ x: rand(-2.6, 2.6), y: rand(-1.1, 1.1), v: rand(1.5, 2.6), l: rand(0.06, 0.13) }));
  const rainGeo = new THREE.BufferGeometry(); rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0x7db7ff, transparent: true, opacity: 0.32, depthTest: false, depthWrite: false }));
  const SNOW_N = 130, snowPos = new Float32Array(SNOW_N * 3);
  const flakes = Array.from({ length: SNOW_N }, () => ({ x: rand(-2.6, 2.6), y: rand(-1.1, 1.1), v: rand(0.12, 0.3), ph: rand(0, 6.28), a: rand(0.04, 0.12) }));
  const snowGeo = new THREE.BufferGeometry(); snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
  const snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({ map: soft, size: 6 * dpr, sizeAttenuation: false, transparent: true, opacity: 0.85, depthTest: false, depthWrite: false }));
  const mkStars = (n, size) => {
    const arr = new Float32Array(n * 3); for (let i = 0; i < n; i++) arr.set([rand(-2.6, 2.6), rand(-1, 1), 0], i * 3);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    return new THREE.Points(geo, new THREE.PointsMaterial({ map: soft, size: size * dpr, sizeAttenuation: false, transparent: true, opacity: 0.8, depthTest: false, depthWrite: false }));
  };
  const starsA = mkStars(45, 4), starsB = mkStars(45, 3);
  [rain, snow, starsA, starsB].forEach((o) => { o.frustumCulled = false; o.renderOrder = -5; o.visible = false; scene.add(o); });
  const fx = { rain: false, snow: false, stars: false };

  const stage = {
    THREE, scene, camera, renderer, dpr, flash: 0,
    add: (o) => { scene.add(o); return o; },
    // choose gradient + particles from a weather kind, or pass explicit colours/particles
    setKind(kind) { this.setScene({ palette: PALETTE[kind] || PALETTE.cloudy, rain: kind === 'rain' || kind === 'thunder', snow: kind === 'snow', stars: kind.endsWith('night') }); },
    setScene({ palette, rain: r = false, snow: s = false, stars: st = false }) { [tgtTop, tgtBot] = palette; fx.rain = r; fx.snow = s; fx.stars = st; },
    size() { const w = innerWidth, h = innerHeight, a = w / h; return { w, h, a, portrait: a < 1.1 }; },
    place(obj, x, y, s) { obj.position.set(x, y, 0); obj.scale.setScalar(Math.max(s, 0.0001)); },
    onResize(cb) { const run = () => { const s = this.size(); renderer.setSize(s.w, s.h, false); camera.left = -s.a; camera.right = s.a; camera.updateProjectionMatrix(); cb(s); }; addEventListener('resize', run); run(); },
    // ~30 fps is plenty for a wall display and kind to a Pi
    start(frame) {
      let last = performance.now();
      const loop = (ts) => {
        requestAnimationFrame(loop);
        const dt = (ts - last) / 1000; if (dt < 1 / 30) return; last = ts;
        const t = ts / 1000, d = Math.min(dt, 0.1), k = 1 - Math.exp(-d * 1.4);
        bgTop.lerp(tmp.set(tgtTop), k); bgBot.lerp(tmp.set(tgtBot), k);
        bgMat.uniforms.uFlash.value = this.flash * 0.9;
        const a = camera.right;
        rain.visible = fx.rain; snow.visible = fx.snow; starsA.visible = starsB.visible = fx.stars;
        if (fx.rain) { rainDrops.forEach((p, i) => { p.y -= p.v * d; if (p.y < -1.2) { p.y = 1.2; p.x = rand(-a - 0.3, a + 0.3); } rainPos.set([p.x, p.y, 0, p.x - p.l * 0.25, p.y + p.l, 0], i * 6); }); rainGeo.attributes.position.needsUpdate = true; }
        if (fx.snow) { flakes.forEach((f, i) => { f.y -= f.v * d; if (f.y < -1.1) { f.y = 1.1; f.x = rand(-a - 0.3, a + 0.3); } snowPos.set([f.x + Math.sin(t * 0.8 + f.ph) * f.a, f.y, 0], i * 3); }); snowGeo.attributes.position.needsUpdate = true; }
        if (fx.stars) { starsA.material.opacity = 0.4 + 0.5 * Math.sin(t * 1.3); starsB.material.opacity = 0.4 + 0.5 * Math.sin(t * 1.3 + 2.2); }
        frame(t, d);
        renderer.render(scene, camera);
      };
      requestAnimationFrame(loop);
    },
  };
  return stage;
}

// ---------------------------------------------------------------- weather icons (each designed to fit in a ~1 unit radius)
const cloud = (color) => {
  const g = new THREE.Group();
  [[-0.38, -0.08, 0.26], [-0.12, 0.1, 0.34], [0.2, 0.06, 0.3], [0.44, -0.08, 0.22], [0, -0.1, 0.3],
   [-0.27, -0.19, 0.15], [0.33, -0.19, 0.15]].forEach(([x, y, r]) => { const c = disc(r, color, 1, 0.01); c.position.set(x, y, 0.01); g.add(c); }); // last two round the bottom corners
  const base = bar(0.6, 0.3, color, 1, 0.01); base.position.set(0.03, -0.19, 0.01); g.add(base);
  return g;
};
const sun = () => {
  const g = new THREE.Group(), rays = new THREE.Group();
  const glowA = glow(0.8, 0xffc93c, 0.7, 0), glowB = glow(1.15, 0xffb020, 0.3, -0.01);
  g.add(glowB, glowA, disc(0.38, 0xffc93c, 1, 0.02));
  for (let i = 0; i < 12; i++) { const a = (i * Math.PI) / 6, r = bar(0.07, 0.2, 0xffc93c, 0.95, 0.02); r.position.set(Math.cos(a) * 0.68, Math.sin(a) * 0.68, 0); r.rotation.z = a - Math.PI / 2; rays.add(r); }
  g.add(rays);
  return { g, update: (t) => { rays.rotation.z = t * 0.25; const p = 1 + Math.sin(t * 1.6) * 0.06; glowA.scale.set(1.6 * p, 1.6 * p, 1); glowB.scale.set(2.3 * p, 2.3 * p, 1); } };
};
let crescentGeo = null;
export const moonCrescent = () => {
  if (!crescentGeo) { // outer disc minus an offset disc, built from the two arcs
    const R = 0.5, r = 0.42, dx = 0.2, dy = 0.14, d = Math.hypot(dx, dy), phi = Math.atan2(dy, dx);
    const a = (R * R - r * r + d * d) / (2 * d), delta = Math.acos(a / R), eps = Math.acos((d - a) / r), psi = phi + Math.PI;
    const outer = [], inner = [];
    for (let i = 0; i <= 48; i++) { const t = phi + delta + ((2 * Math.PI - 2 * delta) * i) / 48; outer.push([R * Math.cos(t), R * Math.sin(t)]); }
    for (let i = 0; i <= 48; i++) { const t = psi - eps + ((2 * eps) * i) / 48; inner.push([dx + r * Math.cos(t), dy + r * Math.sin(t)]); }
    const last = outer[outer.length - 1];
    if (Math.hypot(inner[0][0] - last[0], inner[0][1] - last[1]) > Math.hypot(inner[48][0] - last[0], inner[48][1] - last[1])) inner.reverse();
    const s = new THREE.Shape(); s.moveTo(...outer[0]); outer.slice(1).concat(inner).forEach((p) => s.lineTo(...p));
    crescentGeo = new THREE.ShapeGeometry(s);
  }
  return crescentGeo;
};
const moon = () => {
  const g = new THREE.Group(), halo = glow(1.0, 0xa9c0ee, 0.45, -0.01), m = flat(moonCrescent(), 0xe6ecf8, 1, 0.02);
  m.rotation.z = 0.35; g.add(halo, m);
  const sparks = [[0.62, 0.5, 0.035], [0.78, 0.05, 0.025], [0.4, 0.78, 0.022], [-0.7, 0.6, 0.03]].map(([x, y, r], i) => { const s = disc(r, 0xffffff, 0.9, 0.02); s.position.set(x, y, 0.02); s.userData.i = i; g.add(s); return s; });
  return { g, update: (t) => { halo.scale.setScalar(2 + Math.sin(t * 1.2) * 0.08); sparks.forEach((s) => { s.material.opacity = 0.35 + 0.65 * Math.abs(Math.sin(t * 1.7 + s.userData.i * 1.9)); }); } };
};
const fall = (n, mk, fn) => { // n particles falling under a cloud, wrapped between y=-0.2 and y=-0.8 (stays clear of the text below)
  const g = new THREE.Group(), items = [];
  for (let i = 0; i < n; i++) { const m = mk(); items.push({ m, x: rand(-0.45, 0.45), y: rand(-0.8, -0.2), v: rand(0.5, 0.9), ph: rand(0, 6.28) }); g.add(m); }
  return { g, update: (t, dt) => items.forEach((it) => { it.y -= it.v * dt * fn.speed; if (it.y < -0.8) { it.y = -0.2; it.x = rand(-0.45, 0.45); } fn.place(it, t); }) };
};
const rainFall = (n) => fall(n, () => bar(0.022, 0.15, 0x60a5fa, 0.9, 0), { speed: 1.9, place: (it) => { it.m.position.set(it.x + (it.y + 0.2) * 0.1, it.y, 0); it.m.rotation.z = 0.1; } });
const snowFall = (n) => fall(n, () => disc(0.035, 0xffffff, 0.95, 0), { speed: 0.55, place: (it, t) => it.m.position.set(it.x + Math.sin(t * 1.3 + it.ph) * 0.06, it.y, 0) });
let boltGeo = null;
const bolt = () => {
  if (!boltGeo) { const s = new THREE.Shape(); [[0.1, -0.18], [-0.12, -0.55], [0.0, -0.55], [-0.1, -0.95], [0.18, -0.48], [0.05, -0.48], [0.2, -0.18]].forEach((p, i) => (i ? s.lineTo(...p) : s.moveTo(...p))); boltGeo = new THREE.ShapeGeometry(s); }
  const m = flat(boltGeo, 0xfde047, 0, 0.03);
  return { m, update: (t) => { const p = t % 3.7, on = query.get('flash') === '1' || p < 0.08 || (p > 0.18 && p < 0.26); /* ?flash=1 holds the bolt on */ m.material.opacity = on ? 1 : 0; return on ? 1 : 0; } };
};
const fogBars = () => {
  const g = new THREE.Group(), rows = [-0.42, -0.6, -0.78].map((y, i) => { const b = bar(0.95 - i * 0.12, 0.09, 0xcbd5e1, 0.45, 0); b.position.y = y; g.add(b); return b; });
  return { g, update: (t) => rows.forEach((b, i) => { b.position.x = Math.sin(t * 0.5 + i * 1.7) * 0.18; b.material.opacity = 0.3 + 0.2 * Math.sin(t * 0.8 + i); }) };
};
// -> { group, update(t, dt) returning lightning flash 0..1 }
export function makeWeatherIcon(kind) {
  const group = new THREE.Group(), parts = [];
  const add = (obj, x = 0, y = 0, s = 1) => { const o = obj.g || obj.m || obj; o.position.x += x; o.position.y += y; o.scale.multiplyScalar(s); group.add(o); if (obj.update) parts.push(obj); return obj; };
  const drift = (c) => ({ g: c, update: (t) => { c.userData.bx ??= c.position.x; c.position.x = c.userData.bx + Math.sin(t * 0.4 + c.position.y * 3) * 0.04; } });
  let flash = null;
  switch (kind) {
    case 'clear': add(sun()); break;
    case 'clear-night': add(moon()); break;
    case 'partly-cloudy': add(sun(), -0.28, 0.28, 0.72); add(drift(cloud(0xf1f5f9)), 0.1, -0.08, 0.95); break;
    case 'partly-cloudy-night': add(moon(), -0.28, 0.28, 0.72); add(drift(cloud(0xe2e8f0)), 0.1, -0.08, 0.95); break;
    case 'cloudy': add(drift(cloud(0x94a3b8)), -0.3, 0.3, 0.72); add(drift(cloud(0xe2e8f0)), 0.08, -0.02, 0.98); break;
    case 'fog': add(drift(cloud(0xa8b4c4)), 0, 0.3, 0.95); add(fogBars()); break;
    case 'rain': add(drift(cloud(0x94a3b8)), 0, 0.3, 0.95); add(rainFall(14)); break;
    case 'snow': add(drift(cloud(0xcbd5e1)), 0, 0.3, 0.95); add(snowFall(14)); break;
    case 'thunder': add(drift(cloud(0x64748b)), 0, 0.3, 0.95); add(rainFall(9)); flash = add(bolt()); break;
    default: add(drift(cloud(0xcbd5e1)), 0, 0.1, 1);
  }
  return { group, update: (t, dt) => { parts.forEach((p) => p.update(t, dt)); return flash ? flash.update(t) : 0; } };
}
// swaps the icon when the kind changes and pops the new one in with a small overshoot
export function weatherIconSlot(stage) {
  let cur = null, kind = null, born = 0;
  return {
    get group() { return cur && cur.group; },
    update(t, dt, wantKind, x, y, s) {
      if (wantKind !== kind) {
        if (cur) { stage.scene.remove(cur.group); cur.group.traverse((o) => o.material && o.material.dispose()); }
        cur = makeWeatherIcon(wantKind); stage.add(cur.group); kind = wantKind; born = t;
      }
      const pop = Math.min((t - born) / 0.9, 1), ease = 1 + 2.2 * Math.pow(pop - 1, 3) + 1.2 * Math.pow(pop - 1, 2);
      stage.place(cur.group, x, y + Math.sin(t * 0.9) * 0.015 * s, s * ease);
      stage.flash = cur.update(t, dt);
    },
  };
}

// ---------------------------------------------------------------- analog dial with second ticks (design radius ~1)
export function makeDial() {
  const group = new THREE.Group(), ticks = [];
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2, big = i % 5 === 0, t = bar(big ? 0.035 : 0.022, big ? 0.13 : 0.08, 0xffffff, 0.2, 0);
    t.position.set(Math.sin(a) * 0.93, Math.cos(a) * 0.93, 0); t.rotation.z = -a; group.add(t); ticks.push(t);
  }
  const hand = (len, w, color, tail = 0.08) => { const pivot = new THREE.Group(), b = bar(w, len + tail, color, 1, 0.03); b.position.y = (len - tail) / 2; pivot.add(b); group.add(pivot); return pivot; };
  const hourHand = hand(0.46, 0.06, 0xf8fafc), minHand = hand(0.7, 0.045, 0xe2e8f0), secHand = hand(0.82, 0.015, 0xf87171, 0.16);
  group.add(disc(0.07, 0xf8fafc, 1, 0.04), disc(0.03, 0xf87171, 1, 0.05));
  return {
    group,
    update() {
      const now = londonNow(), sec = now.s + now.ms / 1000, min = now.m + sec / 60, hr = (now.h % 12) + min / 60;
      ticks.forEach((tk, i) => {
        const passed = i <= now.s, cur = i === now.s, big = i % 5 === 0;
        tk.material.color.setHex(cur ? 0xffffff : passed ? 0x38bdf8 : 0xffffff);
        tk.material.opacity = cur ? 1 : passed ? 0.75 : 0.18;
        tk.scale.set((big ? 0.035 : 0.022) * (cur ? 1.6 : 1), (big ? 0.13 : 0.08) * (cur ? 1.7 : 1), 1);
      });
      secHand.rotation.z = -(sec / 60) * Math.PI * 2; minHand.rotation.z = -(min / 60) * Math.PI * 2; hourHand.rotation.z = -(hr / 12) * Math.PI * 2;
    },
  };
}

// ---------------------------------------------------------------- water droplet that fills to a percentage (design height ~2)
export function makeDroplet() {
  const group = new THREE.Group(), shape = new THREE.Shape();
  shape.moveTo(0, 1.05); shape.bezierCurveTo(0.12, 0.75, 0.7, 0.3, 0.7, -0.3);
  shape.absarc(0, -0.3, 0.7, 0, Math.PI, true); shape.bezierCurveTo(-0.7, 0.3, -0.12, 0.75, 0, 1.05);
  const waterMat = new THREE.ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false,
    uniforms: { uLevel: { value: -1 }, uTime: { value: 0 } },
    vertexShader: 'varying vec2 vPos; void main(){ vPos = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uLevel; uniform float uTime; varying vec2 vPos;
      void main(){
        float wave = sin(vPos.x * 6.0 + uTime * 2.0) * 0.028 + sin(vPos.x * 11.0 - uTime * 1.5) * 0.014;
        float surf = uLevel + wave;
        if (vPos.y > surf) { gl_FragColor = vec4(0.55, 0.75, 1.0, 0.07); return; }
        float depth = clamp((surf - vPos.y) / 1.9, 0.0, 1.0);
        vec3 c = mix(vec3(0.20, 0.62, 1.0), vec3(0.02, 0.24, 0.68), depth);
        c += smoothstep(0.06, 0.0, surf - vPos.y) * 0.35;
        gl_FragColor = vec4(c, 0.96);
      }`,
  });
  group.add(new THREE.Mesh(new THREE.ShapeGeometry(shape, 28), waterMat));
  const rim = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(shape.getPoints(64)), new THREE.LineBasicMaterial({ color: 0x93c5fd, transparent: true, opacity: 0.85, depthTest: false }));
  rim.position.z = 0.02; group.add(rim);
  const shine = disc(1, 0xffffff, 0.22, 0.03); shine.scale.set(0.07, 0.24, 1); shine.position.set(-0.36, 0.05, 0.03); shine.rotation.z = 0.25; group.add(shine);
  const bubbles = Array.from({ length: 7 }, () => { const m = disc(rand(0.025, 0.05), 0xffffff, 0.35, 0.02); group.add(m); return { m, x: rand(-0.32, 0.32), y: rand(-0.9, 0), v: rand(0.12, 0.3), ph: rand(0, 6.28) }; });
  let shown = 0;
  return {
    group,
    get shown() { return shown; },
    update(t, dt, pct) { // eases toward pct, ripples the surface, floats bubbles
      shown += ((pct == null ? 0 : pct) - shown) * (1 - Math.exp(-dt * 1.6));
      const level = -1 + (shown / 100) * 2; waterMat.uniforms.uLevel.value = level; waterMat.uniforms.uTime.value = t;
      const top = Math.min(level - 0.1, 0.5);
      bubbles.forEach((b) => { b.y += b.v * dt; if (b.y > top) { b.y = -0.95; b.x = rand(-0.3, 0.3); } b.m.position.set(b.x + Math.sin(t * 2 + b.ph) * 0.03, b.y, 0.02); b.m.visible = top > -0.85; });
    },
  };
}

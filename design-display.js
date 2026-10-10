'use strict';
(function () {
  const stage = document.getElementById('stage');
  const id = new URLSearchParams(location.search).get('id');
  let last = '', settings = {}, clocks = [], weather = [], weatherVersion = 0;
  function fit() {
    const scale = Math.min(innerWidth / 800, innerHeight / 480);
    stage.style.transform = `scale(${scale})`;
    stage.style.left = (innerWidth - 800 * scale) / 2 + 'px';
    stage.style.top = (innerHeight - 480 * scale) / 2 + 'px';
  }
  addEventListener('resize', fit);
  fit();
  function tick() {
    try {
      const time = new Intl.DateTimeFormat('en-GB', {timeZone:settings.timezone || 'Europe/London',hour:'2-digit',minute:'2-digit'}).format(new Date());
      clocks.forEach(el => el.textContent = time);
    } catch {}
  }
  async function weatherUpdate() {
    if (!weather.length) return;
    const version = ++weatherVersion;
    try {
      const fahrenheit = settings.units === 'fahrenheit';
      const r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=' + settings.latitude + '&longitude=' + settings.longitude + '&current=temperature_2m,relative_humidity_2m&temperature_unit=' + (fahrenheit ? 'fahrenheit' : 'celsius'));
      if (!r.ok) throw Error();
      const data = await r.json();
      if (version !== weatherVersion) return;
      weather.forEach(el => el.textContent = Math.round(data.current.temperature_2m) + '°' + (fahrenheit ? 'F' : 'C') + '\n' + (settings.locationName || 'Weather') + '\n' + data.current.relative_humidity_2m + '% humidity');
    } catch {
      if (version === weatherVersion) weather.forEach(el => { if (el.textContent === 'Loading weather…') el.textContent = 'Weather unavailable'; });
    }
  }
  async function refresh() {
    try {
      const r = await fetch('/api/config', {cache:'no-store'});
      if (!r.ok) return;
      const config = await r.json(), page = config.pages.find(page => page.id === id);
      if (!page?.design) { stage.textContent = 'Page unavailable'; last = ''; clocks = []; weather = []; weatherVersion++; return; }
      const signature = JSON.stringify([page.design, config.settings]);
      if (signature === last) return;
      last = signature;
      settings = config.settings;
      await DESIGN_ASSETS.loadFonts();
      const design = page.design;
      stage.style.background = design.bg;
      stage.style.color = design.fg;
      stage.style.borderBottom = '4px solid ' + design.accent;
      stage.replaceChildren();
      clocks = []; weather = []; weatherVersion++;
      design.blocks.forEach(block => {
        const el = document.createElement('div');
        el.className = 'widget';
        Object.assign(el.style, {left:block.x+'px',top:block.y+'px',width:block.w+'px',height:block.h+'px',fontSize:block.size+'px',color:block.colour || design.fg});
        DESIGN_ASSETS.applyStyle(el, block);
        const content = DESIGN_ASSETS.fill(el, block);
        if (block.type === 'clock') clocks.push(content);
        else if (block.type === 'weather') { content.textContent = 'Loading weather…'; weather.push(content); }
        stage.append(el);
      });
      tick(); weatherUpdate();
    } catch {}
  }
  refresh();
  setInterval(refresh, 15000);
  setInterval(tick, 1000);
  setInterval(weatherUpdate, 600000);
})();

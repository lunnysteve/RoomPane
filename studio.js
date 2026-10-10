'use strict';
// Home Display Studio. plugin-studio.js extends the plugin form and the designer through
// the shared globals below (editPlugin, pluginInput, showProps, add, makeEditable…).
const $ = id => document.getElementById(id);
const themes = {midnight:['#0b1324','#f1f5fb','#70b7ff'],paper:['#f1eee7','#263244','#b85c32'],forest:['#102820','#f0f5e9','#87d4a4'],sunset:['#301c35','#fff2e3','#ffb471']};
const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
let config, savedConfig, selectedId, blockId, editing = false, dirty = false, htmlDirty = false, installPrompt, messageTimer;
const page = () => config?.pages?.find(p => p.id === selectedId);
const block = () => page()?.design?.blocks.find(b => b.id === blockId);
const makeEditable = $('make-editable'), pluginPanel = $('plugins-panel');

async function api(url, options) { const r = await fetch(url, options); const j = await r.json(); if (!r.ok) throw Error(j.error || 'Request failed'); return j; }
const post = (url, data) => api(url, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)});
const uploadFile = (file, name, replace) => { const form = new FormData(); form.append('file', file, name || file.name); return api('/api/upload' + (replace ? '?replace=1' : ''), {method:'POST', body:form}); };

// Save bar: visible while there are unsaved changes, or briefly to show a message.
function updateBar() { const bar = $('save-bar'); bar.classList.toggle('dirty', dirty); bar.classList.toggle('idle', !dirty); bar.hidden = !dirty && !messageTimer; }
function message(text) { $('status').textContent = text; clearTimeout(messageTimer); messageTimer = setTimeout(() => { messageTimer = null; if (dirty) $('status').textContent = 'You have unsaved changes'; updateBar(); }, 5000); updateBar(); }
function changed() { dirty = true; $('status').textContent = 'You have unsaved changes'; updateBar(); }

// ---------- Navigation ----------
const sections = [...document.querySelectorAll('main>section')];
function showStudioSection(section) {
  document.querySelector('main').dataset.section = section;
  for (const panel of sections) panel.hidden = panel.dataset.for !== section || (panel.id === 'page-list-view' && editing) || (panel.id === 'page-editor' && !editing);
  for (const button of document.querySelectorAll('.studio-nav button')) { const on = button.dataset.section === section; button.classList.toggle('selected', on); button.setAttribute('aria-current', on ? 'page' : 'false'); }
  if (section === 'plugins') refreshPlugins();
  if (section === 'screens') refreshScreens();
  if (section === 'settings') refreshFiles();
  if (section === 'updates') checkUpdates();
  if (section === 'pages' && editing && page()?.design) requestAnimationFrame(() => { renderStage(); fit(); });
}
for (const button of document.querySelectorAll('.studio-nav button')) button.onclick = () => showStudioSection(button.dataset.section);

// ---------- Page list ----------
function pageSummary(p) {
  const s = p.schedule;
  if (!s?.enabled) return p.time + ' s';
  const days = s.days || [0,1,2,3,4,5,6], hours = String(s.startHour ?? 0).padStart(2, '0') + ':00–' + String(s.endHour ?? 23).padStart(2, '0') + ':59';
  const dayText = days.length === 7 ? 'every day' : days.join() === '1,2,3,4,5' ? 'weekdays' : days.join() === '0,6' ? 'weekends' : days.map(d => dayNames[d]).join(' ');
  return p.time + ' s · ' + hours + ' ' + dayText;
}
function previewUrl(p) { try { const url = new URL(p.url, location.href); return ['http:','https:'].includes(url.protocol) ? url.href : 'about:blank'; } catch { return 'about:blank'; } }
function renderPages() {
  const list = $('page-list'); list.replaceChildren();
  if (!config.pages.length) { list.innerHTML = '<p class="hint">No pages yet. Add a ready-made page or design your own.</p>'; return; }
  config.pages.forEach((p, index) => {
    const card = document.createElement('div'); card.className = 'page-card'; card.dataset.id = p.id;
    const handle = document.createElement('button'); handle.className = 'drag-handle'; handle.textContent = '⠿'; handle.setAttribute('aria-label', 'Move ' + p.name + ' (use arrow keys)');
    const thumb = document.createElement('div'); thumb.className = 'thumb';
    const frame = document.createElement('iframe'); frame.loading = 'lazy'; frame.tabIndex = -1; frame.title = p.name + ' preview'; frame.setAttribute('sandbox', 'allow-scripts allow-same-origin'); frame.src = previewUrl(p); thumb.append(frame);
    const open = document.createElement('button'); open.className = 'page-open';
    const title = document.createElement('strong'); title.textContent = p.name; const meta = document.createElement('span'); meta.textContent = pageSummary(p) + (p.design ? ' · designed' : '');
    open.append(title, meta); open.onclick = () => openEditor(p.id);
    const toggle = document.createElement('label'); toggle.className = 'switch'; toggle.title = 'Show in rotation';
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = !!p.active; checkbox.setAttribute('aria-label', 'Show ' + p.name + ' in rotation');
    checkbox.onchange = () => { p.active = checkbox.checked; changed(); };
    toggle.append(checkbox, document.createElement('span'));
    handle.onkeydown = e => { const n = index + (e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0); if (n === index || n < 0 || n >= config.pages.length) return; e.preventDefault(); [config.pages[index], config.pages[n]] = [config.pages[n], config.pages[index]]; changed(); renderPages(); list.children[n].querySelector('.drag-handle').focus(); };
    handle.onpointerdown = e => dragCard(e, card);
    card.append(handle, thumb, open, toggle); list.append(card);
  });
}
// Moves the card in the DOM while dragging (so thumbnails keep running), then applies the order.
// Listens on the document because re-inserting the card releases any pointer capture.
function dragCard(e, card) {
  e.preventDefault(); const list = $('page-list'); card.classList.add('dragging');
  const move = ev => { const over = [...list.children].find(other => other !== card && ev.clientY < other.getBoundingClientRect().top + other.offsetHeight / 2); if (over) { if (over !== card.nextElementSibling) list.insertBefore(card, over); } else if (card !== list.lastElementChild) list.append(card); };
  const end = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', end); document.removeEventListener('pointercancel', end); card.classList.remove('dragging'); const order = [...list.children].map(c => c.dataset.id); if (order.join() !== config.pages.map(p => p.id).join()) { config.pages.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)); changed(); renderPages(); } };
  document.addEventListener('pointermove', move); document.addEventListener('pointerup', end); document.addEventListener('pointercancel', end);
}
async function openAddPage() {
  $('add-page-form').hidden = false; $('add-page-url').value = '';
  $('add-page-file').disabled = $('add-page-confirm').disabled = true;
  try { const files = (await api('/api/files')).files.filter(n => /\.html$/i.test(n) && !/^plugin-/.test(n)); $('add-page-file').replaceChildren(new Option('Choose a page…', ''), ...files.map(n => new Option(n.replace(/\.html$/i, '').replace(/[-_]/g, ' '), n))); } catch (e) { message(e.message); }
  finally { $('add-page-file').disabled = $('add-page-confirm').disabled = false; }
}
$('add-page').onclick = openAddPage;
$('add-page-cancel').onclick = () => { $('add-page-form').hidden = true; };
$('add-page-confirm').onclick = () => {
  const file = $('add-page-file').value, url = $('add-page-url').value.trim();
  if (!file && !/^https?:\/\//i.test(url)) return message('Choose a page or enter a web address starting with http:// or https://.');
  let address;
  if (!file) {
    try {
      address = new URL(url);
      if (!['http:', 'https:'].includes(address.protocol) || address.username || address.password) throw Error();
    } catch { return message('Enter a valid http:// or https:// address without a username or password.'); }
  }
  const name = file ? $('add-page-file').selectedOptions[0].textContent.replace(/^./, c => c.toUpperCase()) : address.hostname;
  config.pages.push({id:'p_' + Date.now(), name, url:file || url, time:30, active:true, schedule:{enabled:false}});
  $('add-page-form').hidden = true; changed(); renderPages();
};

// ---------- Page editor ----------
function openEditor(id) { selectedId = id; blockId = null; editing = true; $('html-editor').hidden = true; render(); showStudioSection('pages'); scrollTo(0, 0); }
$('back-to-pages').onclick = () => { editing = false; renderPages(); showStudioSection('pages'); };
for (let hour = 0; hour < 24; hour++) { const h = String(hour).padStart(2, '0'); $('schedule-start').append(new Option(h + ':00', hour)); $('schedule-end').append(new Option(h + ':59', hour)); }
dayNames.forEach((name, day) => { const label = document.createElement('label'), input = document.createElement('input'); input.type = 'checkbox'; input.value = day; label.append(input, name); $('schedule-days').append(label); input.onchange = scheduleChanged; });
function render() {
  renderPages(); const p = page(); if (!p || !editing) return;
  $('editor-title').textContent = p.name || 'Untitled page';
  $('name').value = p.name || ''; $('duration').value = p.time || 30; $('active').checked = !!p.active;
  const s = p.schedule || {}; $('schedule-enabled').checked = !!s.enabled; $('schedule-fields').hidden = !s.enabled;
  $('schedule-start').value = s.startHour ?? 7; $('schedule-end').value = s.endHour ?? 22;
  for (const input of $('schedule-days').querySelectorAll('input')) input.checked = (s.days || [0,1,2,3,4,5,6]).includes(Number(input.value));
  const d = p.design; $('designer').hidden = !d; $('legacy').hidden = !!d; $('style-panel').hidden = !d;
  if (!d) { $('preview').src = previewUrl(p); return; }
  for (const id of ['bg','fg','accent']) $(id).value = d[id];
  $('theme').value = d.theme || 'midnight'; renderStage(); fit();
}
function scheduleChanged() {
  const p = page(); if (!p) return;
  const days = [...$('schedule-days').querySelectorAll('input:checked')].map(input => Number(input.value));
  p.schedule = $('schedule-enabled').checked ? {enabled:true, startHour:Number($('schedule-start').value), endHour:Number($('schedule-end').value), days} : {enabled:false};
  $('schedule-fields').hidden = !p.schedule.enabled; changed();
}
for (const id of ['schedule-enabled','schedule-start','schedule-end']) $(id).onchange = scheduleChanged;
for (const [id, key] of [['name','name'],['duration','time'],['active','active']]) $(id).oninput = () => { const p = page(); if (!p) return; p[key] = id === 'active' ? $(id).checked : id === 'duration' ? Number($(id).value) : $(id).value; if (id === 'name') $('editor-title').textContent = p.name; changed(); };
$('remove').onclick = () => { if (!page() || !confirm('Remove this page? You can add ready-made pages back later.')) return; config.pages = config.pages.filter(p => p.id !== selectedId); selectedId = null; editing = false; changed(); renderPages(); showStudioSection('pages'); };

// Designer
const layerSelect = $('block-layer');
layerSelect.onchange = () => { blockId = layerSelect.value || null; renderStage(); };
for (const [name, icon] of Object.entries(DESIGN_ASSETS.icons)) {
  $('icon-choice').append(new Option(icon.label, name));
  const button = document.createElement('button'); button.type = 'button'; button.title = icon.label; button.setAttribute('aria-label', icon.label); button.style.cssText = 'font-size:24px;display:flex;justify-content:center;padding:6px';
  DESIGN_ASSETS.fill(button, {type:'icon', content:name}); button.onclick = () => { const b = block(); if (b?.type !== 'icon') return; b.content = name; changed(); renderStage(); };
  $('icon-palette').append(button);
}
function fit() { const wrap = $('stage').parentElement; $('stage').style.transform = `scale(${wrap.clientWidth / 800})`; }
function renderStage() {
  const d = page()?.design, s = $('stage'); if (!d) return;
  layerSelect.replaceChildren(new Option('Click a block, or choose one here…', ''));
  d.blocks.forEach((b, i) => layerSelect.append(new Option((i + 1) + '. ' + b.type + (b.type === 'text' ? ' — ' + b.content.slice(0, 30) : ''), b.id)));
  layerSelect.value = blockId || '';
  s.style.background = d.bg; s.style.color = d.fg; s.style.borderBottom = '4px solid ' + d.accent; s.replaceChildren();
  d.blocks.forEach(b => {
    const el = document.createElement('div'); el.className = 'block' + (b.id === blockId ? ' selected' : '');
    Object.assign(el.style, {left:b.x + 'px', top:b.y + 'px', width:b.w + 'px', height:b.h + 'px', fontSize:b.size + 'px', color:b.colour || d.fg});
    DESIGN_ASSETS.applyStyle(el, b); const content = DESIGN_ASSETS.fill(el, b);
    if (b.type === 'clock') content.textContent = new Intl.DateTimeFormat('en-GB', {timeZone:config.settings.timezone, hour:'2-digit', minute:'2-digit'}).format(new Date());
    else if (b.type === 'weather') content.textContent = '18°\n' + (config.settings.locationName || 'Weather') + '\n55% humidity';
    el.onpointerdown = e => {
      e.preventDefault(); blockId = b.id; for (const child of s.children) child.classList.remove('selected'); el.classList.add('selected'); showProps();
      const scale = s.parentElement.clientWidth / 800, startX = e.clientX, startY = e.clientY, x = b.x, y = b.y; el.setPointerCapture(e.pointerId);
      el.onpointermove = ev => { b.x = Math.max(0, Math.min(800 - b.w, Math.round(x + (ev.clientX - startX) / scale))); b.y = Math.max(0, Math.min(480 - b.h, Math.round(y + (ev.clientY - startY) / scale))); el.style.left = b.x + 'px'; el.style.top = b.y + 'px'; showProps(); changed(); };
      el.onpointerup = el.onpointercancel = () => { el.onpointermove = null; };
    };
    s.append(el);
  });
  showProps();
}
function showProps() {
  const b = block(); layerSelect.value = b?.id || ''; $('prop').hidden = !b; if (!b) return;
  for (const key of ['x','y','w','h','size','content']) $(key).value = b[key] ?? '';
  $('colour').value = b.colour || page().design.fg;
  $('content').hidden = $('text-label').hidden = !['text','image','video'].includes(b.type);
  $('text-label').textContent = ['image','video'].includes(b.type) ? 'Image or video address (or upload under Style)' : 'Text';
  for (const [id, key, fallback] of [['block-font','font','sans'],['block-weight','weight','400'],['block-align','align','center'],['block-animation','animation','none'],['block-speed','speed',4]]) $(id).value = b[key] ?? fallback;
  $('block-fill').checked = !!b.background && b.background !== 'transparent'; $('block-background').disabled = !$('block-fill').checked;
  $('block-background').value = $('block-fill').checked ? b.background : page().design.bg;
  $('icon-controls').hidden = b.type !== 'icon'; $('icon-choice').value = b.type === 'icon' ? b.content : 'sun';
}
function add(type) {
  const d = page()?.design; if (!d) return;
  const b = {id:crypto.randomUUID ? crypto.randomUUID() : Date.now() + Math.random().toString(16), type, x:30, y:30, w:type === 'icon' ? 160 : 300, h:type === 'icon' ? 160 : 150, size:type === 'clock' ? 64 : type === 'icon' ? 96 : 32, colour:type === 'icon' ? d.accent : d.fg, font:'sans', weight:'400', align:'center', background:'transparent', animation:'none', speed:4, content:type === 'text' ? 'Your message' : type === 'icon' ? 'sun' : ''};
  d.blocks.push(b); blockId = b.id; changed(); renderStage();
}
const newDesign = () => ({theme:'midnight', bg:themes.midnight[0], fg:themes.midnight[1], accent:themes.midnight[2], blocks:[]});
$('new').onclick = () => { const id = 'design_' + Date.now(); config.pages.push({id, name:'My page', url:'design-display.html?id=' + id, time:30, active:true, schedule:{enabled:false}, design:newDesign()}); openEditor(id); add('clock'); };
// Ready-made pages have no block data: start a layout with matching widgets, keeping the original URL.
makeEditable.onclick = () => {
  const p = page(); if (!p) return; const original = p.originalUrl || p.url;
  const widget = (type, x, y, w, h, size, content = '') => ({id:'block_' + Date.now() + '_' + Math.random().toString(16).slice(2), type, x, y, w, h, size, colour:'#f1f5fb', content});
  const blocks = [];
  if (/(^|\/)(display|time|large_time)\.html(?:[?#]|$)/.test(original)) blocks.push(widget('clock', 30, 60, 740, 180, 96));
  if (/(^|\/)(display|weather|humidity|forecast|large_weather)\.html(?:[?#]|$)/.test(original)) blocks.push(widget('weather', 100, 260, 600, 180, 40));
  if (!blocks.length) blocks.push(widget('text', 70, 120, 660, 220, 48, p.name));
  p.originalUrl = original; p.url = 'design-display.html?id=' + encodeURIComponent(p.id); p.design = {...newDesign(), blocks}; blockId = blocks[0].id;
  $('html-editor').hidden = true; changed(); render(); message('Layout ready. Drag blocks into place, then save.');
};
document.querySelectorAll('[data-add]').forEach(button => button.onclick = () => { add(button.dataset.add); if (button.dataset.motion && block()) { block().animation = button.dataset.motion; renderStage(); } });
for (const [id, key] of [['block-font','font'],['block-weight','weight'],['block-align','align'],['block-animation','animation'],['icon-choice','content']]) $(id).onchange = () => { const b = block(); if (!b) return; b[key] = $(id).value; changed(); renderStage(); };
$('block-speed').onchange = () => { const b = block(); if (!b) return; b.speed = Math.max(1, Math.min(20, Number($('block-speed').value) || 4)); changed(); renderStage(); };
$('block-fill').onchange = () => { const b = block(); if (!b) return; b.background = $('block-fill').checked ? $('block-background').value : 'transparent'; changed(); renderStage(); };
$('block-background').oninput = () => { const b = block(); if (!b) return; b.background = $('block-background').value; changed(); renderStage(); };
for (const key of ['x','y','w','h','size']) $(key).onchange = () => { const b = block(); if (!b) return; const value = Number($(key).value); if (!Number.isFinite(value)) return; const limits = {x:[0,800 - b.w], y:[0,480 - b.h], w:[40,800 - b.x], h:[40,480 - b.y], size:[12,400]}; b[key] = Math.max(limits[key][0], Math.min(limits[key][1], value)); changed(); renderStage(); };
for (const key of ['content','colour']) $(key).oninput = () => { const b = block(); if (!b) return; b[key] = $(key).value; changed(); renderStage(); };
$('delete-block').onclick = () => { const d = page().design; d.blocks = d.blocks.filter(b => b.id !== blockId); blockId = null; changed(); renderStage(); };
for (const key of ['bg','fg','accent']) $(key).oninput = () => { page().design[key] = $(key).value; changed(); renderStage(); };
$('theme').onchange = () => { const d = page().design; d.theme = $('theme').value; [d.bg, d.fg, d.accent] = themes[d.theme]; d.blocks.forEach(b => b.colour = d.fg); changed(); render(); };
window.addEventListener('resize', () => { if (page()?.design && editing) fit(); });

// Media
async function refreshMedia() { try { const result = await api('/api/files'); $('media-library').replaceChildren(new Option('Choose a file…', ''), ...result.files.filter(n => /\.(png|jpe?g|gif|svg|webp|mp4|webm)$/i.test(n)).map(n => new Option(n, '/' + n))); } catch (e) { $('upload-info').textContent = e.message; } }
function useMedia(url) { if (!page()?.design) return message('Open a designed page first.'); const type = /\.(mp4|webm)(?:[?#]|$)/i.test(url) ? 'video' : 'image'; if (!['image','video'].includes(block()?.type)) add(type); const b = block(); b.type = type; b.content = url; changed(); renderStage(); }
$('use-media').onclick = () => { if ($('media-library').value) useMedia($('media-library').value); };
$('upload').onchange = async () => {
  const file = $('upload').files[0]; if (!file) return;
  try {
    if (file.size > 20 * 1024 * 1024) throw Error('Maximum upload size is 20 MB');
    const extension = file.name.split('.').pop().toLowerCase();
    if (!['png','jpg','jpeg','webp','gif','svg','mp4','webm'].includes(extension)) throw Error('Choose an image, GIF, SVG, MP4 or WebM file.');
    const result = await uploadFile(file, 'media-' + Date.now() + '.' + extension);
    if (page()?.design) useMedia('/' + result.filename);
    $('upload-info').textContent = 'Uploaded: /' + result.filename; await refreshMedia(); $('media-library').value = '/' + result.filename;
  } catch (e) { message(e.message); } finally { $('upload').value = ''; }
};

// HTML editor (edits files through the authenticated file API)
let htmlFilename = '', htmlLoad = 0;
const htmlMessage = text => { $('html-status').textContent = text; };
function previewHtml() { const doc = new DOMParser().parseFromString($('html-source').value, 'text/html'); const base = document.createElement('base'); base.href = location.origin + '/'; doc.head.prepend(base); $('html-frame').srcdoc = '<!doctype html>' + doc.documentElement.outerHTML; $('html-frame').hidden = false; }
async function loadHtml(filename) {
  if (!filename) return;
  if (htmlDirty && !confirm('Discard unsaved HTML changes and open another file?')) { $('html-file').value = htmlFilename; return; }
  const ticket = ++htmlLoad; $('html-source').disabled = true; $('html-save').disabled = true; htmlMessage('Loading ' + filename + '…');
  try { const result = await api('/api/file-content?filename=' + encodeURIComponent(filename)); if (ticket !== htmlLoad) return; htmlFilename = filename; $('html-file').value = filename; $('html-source').value = result.content; htmlDirty = false; $('html-frame').hidden = true; htmlMessage('Editing ' + filename + '. Changes are unpublished until you save.'); }
  catch (e) { if (ticket === htmlLoad) { htmlMessage(e.message); $('html-file').value = htmlFilename; } }
  finally { if (ticket === htmlLoad) { $('html-source').disabled = !htmlFilename; $('html-save').disabled = !htmlFilename; } }
}
async function openHtml(preferred) {
  $('html-editor').hidden = false; $('html-editor').scrollIntoView({behavior:'smooth', block:'start'});
  try {
    const files = (await api('/api/files')).files.filter(n => /\.html$/i.test(n));
    $('html-file').replaceChildren(...files.map(n => new Option(n, n)));
    const filename = files.includes(preferred) ? preferred : files.includes(htmlFilename) ? htmlFilename : files[0];
    if (filename === htmlFilename) { $('html-file').value = filename; return; }
    if (filename) await loadHtml(filename); else htmlMessage('No editable HTML files found.');
  } catch (e) { htmlMessage(e.message); }
}
$('open-html').onclick = () => { let filename; try { const p = page(); filename = new URL(p?.originalUrl || p?.url || '', location.href).pathname.slice(1); } catch {} openHtml(filename); };
$('close-html').onclick = () => { if (htmlDirty && !confirm('Discard unsaved HTML changes?')) return; htmlDirty = false; $('html-editor').hidden = true; };
$('html-file').onchange = () => loadHtml($('html-file').value);
$('html-source').oninput = () => { htmlDirty = true; htmlMessage('Unsaved HTML changes in ' + htmlFilename); };
$('html-source').onkeydown = e => { if (e.key === 'Tab') { e.preventDefault(); const input = e.currentTarget; input.setRangeText('  ', input.selectionStart, input.selectionEnd, 'end'); input.dispatchEvent(new Event('input')); } };
$('html-preview').onclick = () => { if (htmlFilename) previewHtml(); };
$('html-save').onclick = async () => {
  if (!htmlFilename) return; const filename = htmlFilename, content = $('html-source').value; $('html-save').disabled = true; $('html-file').disabled = true;
  try {
    await post('/api/edit', {filename, content}); htmlDirty = $('html-source').value !== content;
    htmlMessage(htmlDirty ? 'HTML saved; you have more unsaved changes.' : 'Saved ' + filename + '. The file is now published.'); previewHtml();
    const current = page(); if (current && !current.design) { const url = new URL(current.url, location.href); if (url.origin === location.origin && url.pathname === '/' + filename) { url.searchParams.set('updated', Date.now()); $('preview').src = url.href; } }
  } catch (e) { htmlMessage('Save failed: ' + e.message); } finally { $('html-save').disabled = false; $('html-file').disabled = false; }
};

// ---------- Settings ----------
const settingKeys = ['latitude','longitude','timezone','units','sleepTime','wakeTime','transition'];
const settingDefaults = {latitude:51.4185, longitude:-0.953, timezone:'Europe/London', units:'celsius', sleepTime:'23:00', wakeTime:'07:00', transition:'fade'};
function settingsForm() { return {latitude:Number($('latitude').value), longitude:Number($('longitude').value), timezone:$('timezone').value.trim(), locationName:$('city').value.trim(), units:$('units').value, sleepTime:$('sleepTime').value, wakeTime:$('wakeTime').value, transition:$('transition').value}; }
function fillSettings() { for (const key of settingKeys) $(key).value = config.settings[key] ?? settingDefaults[key]; $('city').value = config.settings.locationName || ''; }
for (const id of [...settingKeys, 'city']) $(id).oninput = changed;
$('search').onclick = async () => {
  try {
    const q = $('city').value.trim(); if (!q) return;
    const r = await fetch('https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(q) + '&count=5&language=en&format=json'); if (!r.ok) throw Error('Location search unavailable');
    const data = await r.json(); $('results').replaceChildren();
    for (const place of data.results || []) { const b = document.createElement('button'); b.textContent = [place.name, place.admin1, place.country].filter(Boolean).join(', '); b.onclick = () => { $('latitude').value = place.latitude; $('longitude').value = place.longitude; $('timezone').value = place.timezone || 'UTC'; $('city').value = place.name; $('results').replaceChildren(); changed(); }; $('results').append(b); }
    if (!data.results?.length) message('No matching locations. Try a nearby town.');
  } catch (e) { message(e.message); }
};
async function refreshFonts() { const fonts = await DESIGN_ASSETS.loadFonts(); for (const font of fonts) if (![...$('block-font').options].some(o => o.value === font.key)) $('block-font').append(new Option(font.name, font.key)); return fonts; }
$('font-upload').onchange = async () => {
  const file = $('font-upload').files[0]; if (!file) return;
  try { if (file.size > 4 * 1024 * 1024) throw Error('Maximum font size is 4 MB'); const face = new FontFace('Font upload check', await file.arrayBuffer()); await face.load(); const form = new FormData(); form.append('file', file); const result = await api('/api/fonts', {method:'POST', body:form}); await refreshFonts(); refreshFiles(); $('font-status').textContent = 'Installed ' + result.font.name + '. Choose it from the Font menu in the designer.'; }
  catch (error) { $('font-status').textContent = 'Font installation failed: ' + error.message; } finally { $('font-upload').value = ''; }
};
async function refreshFiles() {
  try {
    const uploads = (await api('/api/files')).uploads, list = $('file-list'); list.replaceChildren();
    for (const name of uploads) {
      const row = document.createElement('div'); row.className = 'file'; const link = document.createElement('a'); link.href = '/' + name; link.target = '_blank'; link.rel = 'noopener'; link.textContent = name;
      const remove = document.createElement('button'); remove.textContent = 'Delete'; remove.className = 'danger';
      remove.onclick = async () => { if (!confirm('Delete ' + name + '?')) return; try { await api('/api/files/' + encodeURIComponent(name), {method:'DELETE'}); refreshFiles(); refreshMedia(); } catch (e) { message(e.message); } };
      row.append(link, remove); list.append(row);
    }
    if (!uploads.length) list.innerHTML = '<p class="hint">Nothing uploaded yet.</p>';
  } catch (e) { message(e.message); }
}
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; $('install-help').textContent = 'Ready to install the Studio on this device.'; });
$('install').onclick = async () => { if (installPrompt) { await installPrompt.prompt(); installPrompt = null; } else $('install-help').textContent = !window.isSecureContext ? 'Installing as an app needs an HTTPS address. You can keep using the Studio in your browser.' : 'Use your browser’s Install app option, or on iPhone: Share → Add to Home Screen.'; };
if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('/sw.js').catch(() => {});

// ---------- Save / discard ----------
$('save').onclick = async () => {
  try {
    for (const key of ['latitude','longitude']) if (!$(key).value.trim() || !$(key).checkValidity()) throw Error('Enter a valid weather location under Settings.');
    for (const key of ['sleepTime','wakeTime']) if (!$(key).value) throw Error('Choose screen off and on times under Settings.');
    config.settings = {...config.settings, ...settingsForm()};
    await post('/api/config', {settings:config.settings, pages:config.pages});
    savedConfig = structuredClone(config); dirty = false; message('Saved. The display picks up changes automatically.'); renderPages();
  } catch (e) { message(e.message); }
};
$('discard').onclick = () => {
  if (!confirm('Discard all unsaved changes?')) return;
  config = structuredClone(savedConfig); fillSettings(); dirty = false; blockId = null;
  if (editing && !page()) editing = false;
  render(); showStudioSection(document.querySelector('main').dataset.section); message('Changes discarded.');
};
window.addEventListener('beforeunload', e => { if (dirty || htmlDirty) { e.preventDefault(); e.returnValue = ''; } });

// ---------- Screens & display ----------
let screenEditing = '', screenOptions = [], device = {addresses:[], controls:false, manualSleep:false};
// Prefer the Pi's network name over localhost so copied addresses work on other devices.
const shareBase = () => /^(localhost|127\.|\[::1\])/.test(location.hostname) && device.addresses[0] ? device.addresses[0] : location.origin;
function showQr(url) { $('qr').src = '/api/qr.svg?text=' + encodeURIComponent(url); $('qr').alt = 'QR code for ' + url; $('qr').hidden = false; }
function endpoint(label, path, parent) {
  const url = shareBase() + path, row = document.createElement('div'); row.className = 'url';
  const link = document.createElement('a'); link.href = path; link.textContent = url; link.target = '_blank'; link.rel = 'noopener';
  const copy = document.createElement('button'); copy.textContent = 'Copy';
  copy.onclick = async () => { try { if (navigator.clipboard && isSecureContext) { await navigator.clipboard.writeText(url); message('Copied ' + url); } else prompt('Copy this address', url); } catch { prompt('Copy this address', url); } };
  const qr = document.createElement('button'); qr.textContent = 'QR'; qr.onclick = () => showQr(url);
  if (label) { const name = document.createElement('strong'); name.textContent = label; parent.append(name); }
  row.append(link, copy, qr); parent.append(row);
}
async function refreshScreens() {
  try {
    const [profiles, plugins, info] = await Promise.all([api('/api/screens'), api('/api/plugins'), api('/api/device')]); device = info;
    $('endpoint-list').replaceChildren(); endpoint('Display', '/', $('endpoint-list')); endpoint('Studio', '/admin', $('endpoint-list')); showQr(shareBase() + '/');
    $('screen-list').replaceChildren();
    for (const screen of profiles.screens) {
      const card = document.createElement('div'); card.className = 'card'; const title = document.createElement('h3'); title.textContent = screen.name; card.append(title);
      endpoint('', screen.path, card);
      const count = document.createElement('p'); count.className = 'hint'; count.textContent = screen.pageIds === null ? 'All pages and plugins' : screen.pageIds.length + ' selected'; card.append(count);
      const edit = document.createElement('button'); edit.textContent = 'Edit'; edit.onclick = () => editScreen(screen);
      const remove = document.createElement('button'); remove.textContent = 'Remove'; remove.className = 'danger'; remove.style.marginLeft = '8px';
      remove.onclick = async () => { if (!confirm('Remove ' + screen.name + '? Its address will stop working.')) return; await api('/api/screens/' + screen.id, {method:'DELETE'}); refreshScreens(); };
      const sleep = document.createElement('button'); sleep.textContent = screen.manualSleep ? 'Turn screen on' : 'Turn screen off';
      sleep.style.marginLeft = '8px';
      sleep.onclick = async () => { try { await post('/api/display/sleep', {screen:screen.id,sleep:!screen.manualSleep}); await refreshScreens(); } catch(error) { message(error.message); } };
      const schedule = document.createElement('p'); schedule.className = 'hint'; schedule.textContent = screen.schedule ? (screen.schedule.sleepTime === screen.schedule.wakeTime ? 'Always on' : 'Off ' + screen.schedule.sleepTime + ' / on ' + screen.schedule.wakeTime) : 'Uses the default schedule';
      card.append(schedule, edit, remove, sleep); $('screen-list').append(card);
    }
    screenOptions = [...(config?.pages || []), ...plugins.plugins.map(p => ({id:p.id, name:p.name + ' (plugin)'}))];
    renderDisplayControls();
  } catch (error) { message(error.message); }
}
function editScreen(screen) {
  screenEditing = screen?.id || ''; $('screen-name').value = screen?.name || ''; $('screen-all').checked = !screen || screen.pageIds === null; $('screen-pages').replaceChildren();
  for (const p of screenOptions) { const label = document.createElement('label'), checkbox = document.createElement('input'); label.className = 'check'; checkbox.type = 'checkbox'; checkbox.value = p.id; checkbox.checked = !screen || screen.pageIds === null || screen.pageIds.includes(p.id); label.append(checkbox, ' ' + p.name); $('screen-pages').append(label); }
  $('screen-pages').hidden = $('screen-all').checked; $('screen-form').hidden = false;
  $('screen-inherit').checked = !screen?.schedule; $('screen-schedule').hidden = $('screen-inherit').checked;
  $('screen-sleep').value = screen?.schedule?.sleepTime || config.settings.sleepTime || '23:00';
  $('screen-wake').value = screen?.schedule?.wakeTime || config.settings.wakeTime || '07:00';
}
$('new-screen').onclick = async () => { await refreshScreens(); editScreen(); };
$('screen-all').onchange = () => { $('screen-pages').hidden = $('screen-all').checked; };
$('screen-inherit').onchange = () => { $('screen-schedule').hidden = $('screen-inherit').checked; };
$('cancel-screen').onclick = () => { $('screen-form').hidden = true; };
$('save-screen').onclick = async () => { try { await post('/api/screens', {id:screenEditing || undefined, name:$('screen-name').value, schedule:$('screen-inherit').checked ? null : {sleepTime:$('screen-sleep').value,wakeTime:$('screen-wake').value}, pageIds:$('screen-all').checked ? null : [...document.querySelectorAll('#screen-pages input:checked')].map(input => input.value)}); $('screen-form').hidden = true; await refreshScreens(); } catch (error) { message(error.message); } };
function renderDisplayControls() {
  $('sleep-toggle').textContent = device.manualSleep ? 'Turn screen on' : 'Turn screen off';
  $('restart-browser').disabled = $('reboot-pi').disabled = !device.controls;
  $('display-status').textContent = device.controls ? '' : 'Restart and reboot are available on a Pi set up with install.sh.';
}
$('sleep-toggle').onclick = async () => { try { device.manualSleep = (await post('/api/display/sleep', {sleep:!device.manualSleep})).manualSleep; renderDisplayControls(); $('display-status').textContent = device.manualSleep ? 'Screen turned off. It stays off until you turn it on.' : 'Manual off cleared. The screen now follows its schedule.'; } catch (e) { $('display-status').textContent = e.message; } };
for (const [id, action, question] of [['restart-browser','restart_browser','Restart the display browser?'],['reboot-pi','reboot_pi','Reboot the Pi? The display and Studio will be unavailable for about a minute.']])
  $(id).onclick = async () => { if (!confirm(question)) return; try { await post('/api/pi/control', {action}); $('display-status').textContent = action === 'reboot_pi' ? 'Rebooting…' : 'Browser restarting…'; } catch (e) { $('display-status').textContent = e.message; } };

// ---------- Plugins ----------
let editingPlugin = '', pluginFile = '', pluginItems = [];
function pluginInput() { let source = $('plugin-source').value.trim(); const type = $('plugin-type').value; if (source && type === 'mainsail' && !/^https?:\/\//i.test(source)) source = 'http://' + source + (/:\d+$/.test(source) ? '' : ':7125'); const input = {id:editingPlugin || undefined, type, name:$('plugin-name').value.trim(), sourceUrl:source, time:Number($('plugin-time').value), enabled:$('plugin-enabled').checked, onlyConnected:$('plugin-connected').checked, pageFile:pluginFile, healthPath:$('plugin-health').value}; if ($('plugin-clear-key').checked) input.apiKey = ''; else if ($('plugin-key').value) input.apiKey = $('plugin-key').value; return input; }
function editPlugin(plugin) { editingPlugin = plugin?.id || ''; pluginFile = plugin?.pageFile || ''; $('plugin-name').value = plugin?.name || 'My printer'; $('plugin-type').value = plugin?.type || 'mainsail'; $('plugin-source').value = plugin?.sourceUrl || ''; $('plugin-time').value = plugin?.time || 30; $('plugin-enabled').checked = plugin?.enabled !== false; $('plugin-connected').checked = plugin?.onlyConnected !== false; $('plugin-health').value = plugin?.healthPath || '/'; $('plugin-key').value = ''; $('plugin-key').placeholder = plugin?.hasApiKey ? 'Saved key kept unless replaced' : 'Optional Moonraker API key'; $('plugin-clear-key').checked = false; $('plugin-file').textContent = pluginFile || 'Upload a single HTML file, or download the starter page.'; $('custom-plugin-fields').hidden = $('plugin-type').value !== 'custom'; $('plugin-form').hidden = false; $('plugin-result').textContent = 'Enter a source address, then test the real connection.'; }
async function refreshPlugins() {
  try {
    pluginItems = (await api('/api/plugins')).plugins; $('plugin-list').replaceChildren();
    for (const plugin of pluginItems) {
      const card = document.createElement('div'); card.className = 'card'; const title = document.createElement('h3'); title.textContent = plugin.name;
      const status = document.createElement('p'); status.className = 'hint'; status.id = 'status-' + plugin.id; status.textContent = plugin.enabled ? 'Checking source…' : 'Disabled';
      const edit = document.createElement('button'); edit.textContent = 'Edit'; edit.onclick = () => editPlugin(plugin);
      const remove = document.createElement('button'); remove.textContent = 'Remove'; remove.className = 'danger'; remove.style.marginLeft = '8px';
      remove.onclick = async () => { if (!confirm('Remove ' + plugin.name + ' from the display?')) return; try { await api('/api/plugins/' + plugin.id, {method:'DELETE'}); if (editingPlugin === plugin.id) $('plugin-form').hidden = true; await refreshPlugins(); } catch (error) { message(error.message); } };
      card.append(title, status, edit, remove); $('plugin-list').append(card);
    }
    if (!pluginItems.length) $('plugin-list').innerHTML = '<p class="hint">No plugins yet.</p>';
    refreshPluginConnections();
  } catch (error) { message(error.message); }
}
async function refreshPluginConnections() { if (pluginPanel.hidden) return; try { for (const item of (await api('/api/plugin-status')).statuses) { const target = $('status-' + item.id); if (target) target.textContent = (item.connected ? 'Connected · ' : 'Offline · ') + item.message; } } catch {} }
$('new-plugin').onclick = () => editPlugin();
$('plugin-type').onchange = () => { $('custom-plugin-fields').hidden = $('plugin-type').value !== 'custom'; };
$('plugin-cancel').onclick = () => { $('plugin-form').hidden = true; $('plugin-key').value = ''; };
$('plugin-html').onchange = async () => { const file = $('plugin-html').files[0]; if (!file) return; try { if (!/\.html$/i.test(file.name)) throw Error('Choose one HTML file'); pluginFile = (await uploadFile(file, 'plugin-page-' + Date.now() + '.html')).filename; $('plugin-file').textContent = 'Uploaded ' + pluginFile; } catch (error) { $('plugin-result').textContent = error.message; } finally { $('plugin-html').value = ''; } };
$('plugin-test').onclick = async () => { const button = $('plugin-test'); button.disabled = true; $('plugin-result').textContent = 'Testing the source from the Pi…'; try { const result = await post('/api/plugins/test', pluginInput()); $('plugin-result').textContent = (result.connected ? 'Connected: ' : 'Not connected: ') + result.message; } catch (error) { $('plugin-result').textContent = error.message; } finally { button.disabled = false; } };
$('plugin-save').onclick = async () => { try { const result = await post('/api/plugins', pluginInput()); editingPlugin = result.plugin.id; $('plugin-key').value = ''; $('plugin-result').textContent = 'Plugin saved. The display updates within 10 seconds.'; await refreshPlugins(); } catch (error) { $('plugin-result').textContent = error.message; } };
setInterval(refreshPluginConnections, 10000);

// ---------- Updates ----------
async function checkUpdates(force = false) {
  $('check-updates').disabled = true;
  try {
    const result = await api('/api/updates' + (force ? '?check=1' : ''));
    $('update-version').textContent = 'Installed version ' + result.version + (result.latest ? ' · latest ' + result.latest : '');
    $('update-message').textContent = result.message; $('install-update').disabled = !result.available || !result.installable;
    $('nav-updates').classList.toggle('badge', !!result.available); $('nav-updates').title = result.available ? 'Update available' : '';
    $('release-link').hidden = !result.releaseUrl; if (result.releaseUrl) $('release-link').href = result.releaseUrl;
    // The token is only relevant while the release repository is private.
    $('token-options').hidden = !result.tokenConfigured && (result.available || !!result.latest);
    $('update-install-state').textContent = result.state ? result.state.state + ': ' + result.state.message : '';
  } catch (error) { $('update-message').textContent = error.message; } finally { $('check-updates').disabled = false; }
}
$('check-updates').onclick = () => checkUpdates(true);
$('save-github-token').onclick = async () => { try { await post('/api/updates/token', {token:$('github-token').value.trim()}); $('github-token').value = ''; $('github-token-state').textContent = 'Access token saved. Checking releases…'; await checkUpdates(true); } catch (error) { $('github-token-state').textContent = error.message; } };
$('install-update').onclick = async () => {
  if (!confirm('Install the latest release? The server restarts; settings and uploads are kept.')) return;
  $('install-update').disabled = true;
  try { await post('/api/updates/install', {}); $('update-install-state').textContent = 'Update started. Waiting for the server to restart…'; let attempts = 0; const timer = setInterval(async () => { attempts++; try { await checkUpdates(); if (attempts > 60 || /^(complete|failed):/.test($('update-install-state').textContent)) clearInterval(timer); } catch {} }, 5000); }
  catch (error) { $('update-install-state').textContent = error.message; }
};

// ---------- Start ----------
(async () => {
  try {
    config = await api('/api/config'); delete config.manualSleep; delete config.screen; savedConfig = structuredClone(config);
    fillSettings(); renderPages(); showStudioSection('pages'); refreshMedia(); refreshFonts();
    $('install-help').textContent = window.isSecureContext ? 'Install the Studio from your browser menu.' : 'Installing as an app needs HTTPS; the Studio works in your browser without it.';
    message('Ready.'); setTimeout(() => checkUpdates(), 1500);
  } catch (e) { message(e.message); }
})();

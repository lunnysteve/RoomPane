const designAssets = require('./design-assets.js');

const blockTypes = ['clock', 'weather', 'text', 'image', 'video', 'icon', 'plugin'];
const color = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);

// Returns an error message for the first invalid block, or null when the design fits the 800 × 480 canvas.
function designError(d, uploadedFonts) {
  if (!color(d.bg) || !color(d.fg) || !color(d.accent) || !Array.isArray(d.blocks) || d.blocks.length > 40) return 'Invalid page design.';
  const ids = new Set();
  for (const b of d.blocks) {
    if (!b || typeof b.id !== 'string' || ids.has(b.id) || !blockTypes.includes(b.type) || !color(b.colour) || typeof b.content !== 'string' || b.content.length > 2000) return 'Invalid design block.';
    ids.add(b.id);
    const validFont = b.font === undefined || Object.hasOwn(designAssets.fonts, b.font)
      || (typeof b.font === 'string' && b.font.startsWith('uploaded:') && uploadedFonts.includes(b.font.slice(9)));
    if (!validFont
      || (b.animation !== undefined && !designAssets.animations.includes(b.animation))
      || (b.weight !== undefined && !['400', '600', '700'].includes(b.weight))
      || (b.align !== undefined && !['left', 'center', 'right'].includes(b.align))
      || (b.background !== undefined && b.background !== 'transparent' && !color(b.background))
      || (b.speed !== undefined && (!Number.isFinite(b.speed) || b.speed < 1 || b.speed > 20))
      || (b.type === 'icon' && !Object.hasOwn(designAssets.icons, b.content))) return 'Invalid block style or icon.';
    if (b.type === 'plugin' && (typeof b.pluginId !== 'string' || !/^plugin_[A-Za-z0-9_-]{1,100}$/.test(b.pluginId))) return 'Choose a plugin connection for this block.';
    if (['x', 'y', 'w', 'h', 'size'].some(key => !Number.isFinite(b[key])) || b.x < 0 || b.y < 0 || b.w < 40 || b.h < 40 || b.x + b.w > 800 || b.y + b.h > 480 || b.size < 12 || b.size > 400) return 'Design block must fit within the screen.';
    if (['image', 'video'].includes(b.type) && b.content) {
      try { const url = new URL(b.content, 'http://display.local'); if (!['http:', 'https:'].includes(url.protocol)) throw Error(); } catch { return 'Invalid image URL.'; }
    }
  }
  return null;
}

function pagesError(pages, uploadedFonts) {
  if (!Array.isArray(pages) || pages.some(p => !p || typeof p.url !== 'string' || typeof p.name !== 'string' || typeof p.id !== 'string' || !Number.isFinite(p.time) || p.time < 5)) return 'Invalid pages.';
  const ids = new Set();
  for (const page of pages) {
    if (!page.id || ids.has(page.id)) return 'Pages must have unique IDs.';
    ids.add(page.id);
    try {
      const url = new URL(page.url, 'http://display.local/');
      if (!page.url.trim() || !['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw Error();
    } catch { return 'Use a valid page filename or HTTP(S) address without inline credentials.'; }
    if (page.schedule?.enabled) {
      const {days, startHour, endHour} = page.schedule;
      if (!Array.isArray(days) || days.some(day => !Number.isInteger(day) || day < 0 || day > 6)
        || [startHour, endHour].some(hour => !Number.isInteger(hour) || hour < 0 || hour > 23)) return 'Invalid page schedule.';
    }
    const error = page.design && designError(page.design, uploadedFonts);
    if (error) return error;
  }
  return null;
}

module.exports = { pagesError };

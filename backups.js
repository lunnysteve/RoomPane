'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), zlib = require('zlib');
const {promisify} = require('util');
const scrypt = promisify(crypto.scrypt);
const {pagesError} = require('./design-validation');
const createScreens = require('./screens'), createPlugins = require('./plugins');
const MAGIC = Buffer.from('HOME-DISPLAY-BACKUP-1\n');
const LIMIT = 50 * 1024 * 1024, PACKED_LIMIT = 75 * 1024 * 1024;
const names = ['config.json', 'screens.json', 'plugins.json', 'plugin-definitions.json', 'display-state.json'];
module.exports = function createBackups(dataDir, validContentName, resetCaches) {
  let busy = false;
  const validMedia = name => validContentName(name) || /^font-[a-zA-Z0-9._-]+\.(ttf|otf|woff|woff2)$/.test(name);
  function passwordCheck(password) {
    if (typeof password !== 'string' || password.length < 12 || password.length > 1024) throw Error('Use a backup password of 12–1024 characters.');
  }
  function snapshot() {
    const files = []; let total = 0;
    const add = (name, target) => {
      const stat = fs.lstatSync(target);
      if (!stat.isFile() || stat.isSymbolicLink()) throw Error('Backup contains an unsupported file.');
      total += stat.size;
      if (total > LIMIT || files.length >= 2000) throw Error('Browser backups support up to 50 MB and 2,000 files. Use the full Pi backup procedure for larger libraries.');
      files.push({name, data:fs.readFileSync(target).toString('base64')});
    };
    for (const name of names) if (fs.existsSync(path.join(dataDir, name))) add(name, path.join(dataDir, name));
    for (const name of fs.readdirSync(path.join(dataDir, 'content'))) {
      if (!validMedia(name)) throw Error('Unsupported content filename. Use the full Pi backup procedure.');
      add('content/' + name, path.join(dataDir, 'content', name));
    }
    return {format:1, version:require('./package.json').version, createdAt:new Date().toISOString(), files};
  }
  async function unpack(buffer, password) {
    passwordCheck(password);
    if (buffer.length > PACKED_LIMIT || buffer.length < MAGIC.length + 44 || !buffer.subarray(0, MAGIC.length).equals(MAGIC)) throw Error('Choose a Home Display .hdbackup file.');
    const offset = MAGIC.length;
    const key = await scrypt(password, buffer.subarray(offset, offset + 16), 32);
    let plaintext;
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, buffer.subarray(offset + 16, offset + 28));
      decipher.setAAD(MAGIC); decipher.setAuthTag(buffer.subarray(offset + 28, offset + 44));
      const compressed = Buffer.concat([decipher.update(buffer.subarray(offset + 44)), decipher.final()]);
      plaintext = zlib.gunzipSync(compressed, {maxOutputLength:PACKED_LIMIT});
    } catch { throw Error('Wrong backup password, damaged file or backup too large.'); }
    finally { key.fill(0); }
    let archive;
    try { archive = JSON.parse(plaintext.toString('utf8')); } catch { throw Error('Invalid backup contents.'); }
    if (archive.format !== 1 || !Array.isArray(archive.files) || archive.files.length > 2000) throw Error('Unsupported backup format.');
    const seen = new Set(); let total = 0;
    const files = archive.files.map(file => {
      if (!file || typeof file.name !== 'string' || seen.has(file.name)
        || !(names.includes(file.name) || (file.name.startsWith('content/') && validMedia(file.name.slice(8))))
        || typeof file.data !== 'string' || (file.data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(file.data))) throw Error('Unsafe or invalid backup file.');
      seen.add(file.name); const data = Buffer.from(file.data, 'base64'); total += data.length;
      if (total > LIMIT) throw Error('Backup exceeds the 50 MB restore limit.');
      return {name:file.name, data};
    });
    if (!seen.has('config.json')) throw Error('Backup has no display configuration.');
    return {files, summary:{version:archive.version, createdAt:archive.createdAt, files:files.length, bytes:total}};
  }
  function validate(stage) {
    const parse = name => JSON.parse(fs.readFileSync(path.join(stage, name), 'utf8'));
    const config = parse('config.json'), settings = config.settings;
    const fonts = fs.readdirSync(path.join(stage, 'content')).filter(name => name.startsWith('font-'));
    const pageError = pagesError(config.pages, fonts);
    if (pageError) throw Error(pageError);
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw Error('Invalid backup settings.');
    for (const key of ['sleepTime','wakeTime']) if (settings[key] !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(settings[key])) throw Error('Invalid backup schedule.');
    if (settings.timezone !== undefined) new Intl.DateTimeFormat('en', {timeZone:settings.timezone}).format();
    for (const [key, min, max] of [['latitude',-90,90],['longitude',-180,180]]) if (settings[key] !== undefined && (!Number.isFinite(settings[key]) || settings[key] < min || settings[key] > max)) throw Error('Invalid backup location.');
    const screens = createScreens(stage), profiles = parse('screens.json');
    if (!Array.isArray(profiles) || profiles.length > 20 || new Set(profiles.map(p => p?.id)).size !== profiles.length) throw Error('Invalid backup screens.');
    for (const screen of profiles) { if (!screen?.id) throw Error('Invalid screen ID.'); screens.save(screen); }
    const definitions = parse('plugin-definitions.json'), connections = parse('plugins.json');
    if (!Array.isArray(definitions) || definitions.length > 50 || !Array.isArray(connections) || connections.length > 50
      || new Set(definitions.map(d => d?.id)).size !== definitions.length || new Set(connections.map(p => p?.id)).size !== connections.length) throw Error('Invalid backup plugins.');
    const plugins = createPlugins(stage, path.join(stage, 'content'));
    for (const definition of definitions) plugins.installDefinition(definition);
    for (const plugin of connections) {
      if (!plugin || !/^plugin_[A-Za-z0-9_-]{1,100}$/.test(plugin.id)) throw Error('Invalid plugin ID.');
      plugins.save(plugin);
    }
    const state = parse('display-state.json');
    if (!state || typeof state.manualSleep !== 'boolean') throw Error('Invalid backup display state.');
  }
  async function restore(buffer, password, inspect = false) {
    if (busy) throw Error('Another backup operation is in progress.'); busy = true;
    let stage, rollback;
    try {
      const archive = await unpack(buffer, password);
      stage = fs.mkdtempSync(path.join(dataDir, '.restore-')); fs.chmodSync(stage, 0o700);
      fs.mkdirSync(path.join(stage, 'content'), {mode:0o700});
      for (const file of archive.files) fs.writeFileSync(path.join(stage, file.name), file.data, {mode:0o600});
      for (const name of names.slice(1)) if (!fs.existsSync(path.join(stage, name))) fs.writeFileSync(path.join(stage, name), name === 'display-state.json' ? '{"manualSleep":false}' : '[]', {mode:0o600});
      validate(stage);
      if (inspect) return archive.summary;
      rollback = fs.mkdtempSync(path.join(dataDir, '.before-restore-')); fs.chmodSync(rollback, 0o700);
      const moved = [], installed = [];
      try {
        for (const name of [...names, 'content']) {
          const target = path.join(dataDir, name);
          if (fs.existsSync(target)) { fs.renameSync(target, path.join(rollback, name)); moved.push(name); }
          fs.renameSync(path.join(stage, name), target); installed.push(name);
        }
        resetCaches();
      } catch (error) {
        for (const name of installed.reverse()) fs.rmSync(path.join(dataDir, name), {recursive:true,force:true});
        for (const name of moved.reverse()) fs.renameSync(path.join(rollback, name), path.join(dataDir, name));
        throw error;
      }
      return archive.summary;
    } finally {
      if (stage) fs.rmSync(stage, {recursive:true,force:true});
      if (rollback && fs.readdirSync(rollback).length === 0) fs.rmdirSync(rollback);
      // On success retain the previous data, mode 0700, for manual recovery.
      busy = false;
    }
  }
  return {restore, async export(password) {
    passwordCheck(password);
    if (busy) throw Error('Another backup operation is in progress.'); busy = true;
    let key;
    try {
      const payload = zlib.gzipSync(Buffer.from(JSON.stringify(snapshot())));
      const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
      key = await scrypt(password, salt, 32);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv); cipher.setAAD(MAGIC);
      const encrypted = Buffer.concat([cipher.update(payload), cipher.final()]);
      return Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), encrypted]);
    } finally { if (key) key.fill(0); busy = false; }
  }};
};

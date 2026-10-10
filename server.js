const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const designAssets = require('./design-assets.js');
const createPlugins = require('./plugins.js');
const createScreens = require('./screens.js');
const createUpdates = require('./updates.js');
const { execFile } = require('child_process');
const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.resolve(process.env.HOME_DISPLAY_DATA_DIR || __dirname);
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const CONTENT_DIR = path.join(DATA_DIR, 'content');
const extensions = new Set(['.html', '.css', '.js', '.json', '.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.mp4', '.webm']);
const assets = fs.readdirSync(__dirname).filter(name => /\.(html|css|js)$/.test(name) && !['server.js','plugins.js','screens.js','updates.js'].includes(name));
const protectedAssets = ['index.html', 'admin.html', 'designer.html', 'designer.js', 'studio-extras.js', 'studio-devices.js', 'studio-navigation.js', 'plugins.js', 'screens.js', 'updates.js', 'plugin-mainsail.html', 'plugin-mainsail.js', 'design-display.html', 'design-display.js', 'design-assets.js', 'design-assets.css', 'sw.js', 'lite.js'];
const editableAssets = assets.filter(name => !protectedAssets.includes(name));
fs.mkdirSync(CONTENT_DIR, { recursive: true });
if (!fs.existsSync(CONFIG_FILE)) fs.copyFileSync(path.join(__dirname, 'config.example.json'), CONFIG_FILE);
let manualSleepState = false;
const plugins = createPlugins(DATA_DIR, CONTENT_DIR);
const screens = createScreens(DATA_DIR),updates = createUpdates(DATA_DIR);
const fontFiles=()=>fs.readdirSync(CONTENT_DIR).filter(name=>/^font-[a-zA-Z0-9._-]+\.(ttf|otf|woff|woff2)$/.test(name));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false }));

function readConfig() { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); }
function validName(name) {
  return typeof name === 'string' && name === path.basename(name) && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name)
    && extensions.has(path.extname(name).toLowerCase()) && !['config.json', 'server.js', 'package.json', 'package-lock.json', 'runtime-config.js', 'app-icon.svg', 'app-icon-192.png', 'app-icon-512.png', ...protectedAssets].includes(name);
}
function writeConfig(data) {
  fs.writeFileSync(CONFIG_FILE + '.tmp', JSON.stringify(data, null, 2));
  fs.renameSync(CONFIG_FILE + '.tmp', CONFIG_FILE);
}
function authorized(req, res, next) {
  const expected = process.env.HOME_DISPLAY_ADMIN_PASSWORD_HASH;
  // Non-installer deployments retain their original access behavior.
  if (!expected) return next();
  let credentials = '';
  if (/^Basic /i.test(req.headers.authorization || '')) credentials = Buffer.from(req.headers.authorization.slice(6), 'base64').toString();
  const separator = credentials.indexOf(':');
  const username = credentials.slice(0, separator);
  const password = credentials.slice(separator + 1);
  const actual = crypto.createHash('sha256').update(password).digest('hex');
  if (separator >= 0 && username === 'admin' && expected.length === actual.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual))) return next();
  res.set('WWW-Authenticate', 'Basic realm="Home Display", charset="UTF-8"').status(401).send('Admin login required.');
}
app.use((req, res, next) => {
  if (['POST', 'DELETE', 'PUT', 'PATCH'].includes(req.method) && req.headers.origin) {
    try { if (new URL(req.headers.origin).host !== req.headers.host) return res.status(403).json({ error: 'Origin not allowed.' }); }
    catch { return res.status(403).json({ error: 'Invalid origin.' }); }
  }
  next();
});
app.get('/api/health', (req, res) => res.json({ ok: true }));
app.get('/api/config', (req, res) => {const config=readConfig();if(req.query.screen){const screen=screens.find(req.query.screen);if(!screen)return res.status(404).json({error:'Screen not found.'});if(screen.pageIds!==null)config.pages=config.pages.filter(p=>screen.pageIds.includes(p.id));config.screen=screen;}res.set('Cache-Control','no-store').json({ ...config, manualSleep: manualSleepState });});
app.get('/api/screens',(req,res)=>res.json({screens:screens.read().map(s=>({...s,path:'/screen/'+s.id})),defaultPath:'/',adminPath:'/admin'}));
app.get('/api/version',(req,res)=>res.json({version:updates.version}));
app.get('/api/fonts',(req,res)=>res.json({fonts:fontFiles().map(name=>({key:'uploaded:'+name,name:name.replace(/^font-[a-f0-9]+-/,'').replace(/\.[^.]+$/,''),url:'/'+name}))}));
app.get('/api/plugin-status',async(req,res,next)=>{try{let pages=plugins.pages();if(req.query.screen){const screen=screens.find(req.query.screen);if(!screen)return res.status(404).json({error:'Screen not found.'});if(screen.pageIds!==null)pages=pages.filter(p=>screen.pageIds.includes(p.id));}res.set('Cache-Control','no-store').json({statuses:await plugins.statuses(),pages});}catch(error){next(error);}});
app.get('/api/plugin-data/:id',async(req,res,next)=>{try{const data=await plugins.data(req.params.id);res.set('Cache-Control','no-store').status(data?200:404).json(data||{error:'Plugin not found.'});}catch(error){next(error);}});
app.get('/runtime-config.js', (req, res) => {
  const settings = readConfig().settings || {};
    res.set('Cache-Control', 'no-store').type('js').send('window.DISPLAY_SETTINGS=' + JSON.stringify({ latitude: settings.latitude ?? 51.4185, longitude: settings.longitude ?? -0.953, timezone: settings.timezone || 'Europe/London', units: settings.units || 'celsius' }).replace(/</g, '\\u003c') + ';');
});
app.use('/api', authorized);
app.post('/api/screens',(req,res)=>{try{res.json({screen:screens.save(req.body)});}catch(error){res.status(400).json({error:error.message});}});
app.delete('/api/screens/:id',(req,res)=>{screens.remove(req.params.id);res.json({success:true});});
app.get('/api/updates',async(req,res)=>res.json({...await updates.check(req.query.check==='1'),state:updates.state(),tokenConfigured:updates.tokenConfigured()}));
app.post('/api/updates/token',(req,res)=>{try{updates.saveToken(req.body.token);res.json({success:true});}catch(error){res.status(400).json({error:error.message});}});
app.post('/api/updates/install',async(req,res)=>{if(process.env.HOME_DISPLAY_CONTROL!=='local')return res.status(503).json({error:'Automatic installation requires the standalone Pi setup.'});const update=await updates.check(true);if(!update.available||!update.installable)return res.status(400).json({error:update.message||'No installable update is available.'});execFile('/usr/bin/sudo',['-n','/usr/local/sbin/home-display-control','install_update'],{timeout:15000},error=>{if(error)return res.status(500).json({error:'Update service could not start. Install the latest updater helper on the Pi.'});res.status(202).json({success:true,message:'Update started.'});});});
app.get('/api/plugins',(req,res)=>res.json({plugins:plugins.list()}));
app.post('/api/plugins',(req,res)=>{try{res.json({plugin:plugins.save(req.body)});}catch(error){res.status(400).json({error:error.message});}});
app.post('/api/plugins/test',async(req,res)=>{try{res.json(await plugins.test(req.body));}catch(error){res.status(400).json({error:error.message});}});
app.delete('/api/plugins/:id',(req,res)=>{plugins.remove(req.params.id);res.json({success:true});});
const fontUpload=multer({storage:multer.memoryStorage(),limits:{fileSize:4*1024*1024,files:1}});
app.post('/api/fonts',fontUpload.single('file'),(req,res)=>{const file=req.file,extension=file&&path.extname(file.originalname).toLowerCase(),signatures={'.ttf':'00010000','.otf':'4f54544f','.woff':'774f4646','.woff2':'774f4632'};if(!file||!signatures[extension]||file.buffer.subarray(0,4).toString('hex')!==signatures[extension])return res.status(400).json({error:'Choose a valid TTF, OTF, WOFF or WOFF2 font (maximum 4 MB).'});const label=path.basename(file.originalname,extension).replace(/[^a-zA-Z0-9_-]/g,'-').slice(0,80)||'Custom-font',name='font-'+crypto.randomBytes(6).toString('hex')+'-'+label+extension;fs.writeFileSync(path.join(CONTENT_DIR,name),file.buffer);res.json({font:{key:'uploaded:'+name,name:label,url:'/'+name}});});
app.post('/api/config', (req, res) => {
  const current = readConfig();
  const { settings, pages } = req.body;
  if (settings) {
    if (typeof settings !== 'object' || Array.isArray(settings)) return res.status(400).json({ error: 'Invalid settings.' });
    for (const [key, min, max] of [['latitude', -90, 90], ['longitude', -180, 180]]) {
      if (settings[key] !== undefined && (typeof settings[key] !== 'number' || !Number.isFinite(settings[key]) || settings[key] < min || settings[key] > max)) return res.status(400).json({ error: 'Invalid ' + key });
    }
    if (settings.timezone !== undefined) {
      try { new Intl.DateTimeFormat('en', { timeZone: settings.timezone }).format(); }
      catch { return res.status(400).json({ error: 'Invalid timezone.' }); }
    }
    for (const key of ['sleepTime', 'wakeTime']) if (settings[key] !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(settings[key])) return res.status(400).json({ error: 'Invalid ' + key });
    if (settings.units !== undefined && !['celsius', 'fahrenheit'].includes(settings.units)) return res.status(400).json({ error: 'Invalid weather units.' });
    if (settings.locationName !== undefined && (typeof settings.locationName !== 'string' || settings.locationName.length > 200)) return res.status(400).json({ error: 'Invalid location name.' });
    current.settings = { ...current.settings, ...settings };
  }
  if (pages !== undefined) {
    if (!Array.isArray(pages) || pages.some(p => !p || typeof p.url !== 'string' || typeof p.name !== 'string' || typeof p.id !== 'string' || !Number.isFinite(p.time) || p.time < 5)) return res.status(400).json({ error: 'Invalid pages.' });
    for (const page of pages) {
      if (!page.design) continue;
      const d = page.design;
      const color = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
      if (!color(d.bg) || !color(d.fg) || !color(d.accent) || !Array.isArray(d.blocks) || d.blocks.length > 40) return res.status(400).json({ error: 'Invalid page design.' });
      const ids = new Set();
      for (const b of d.blocks) {
        if (!b || typeof b.id !== 'string' || ids.has(b.id) || !['clock', 'weather', 'text', 'image', 'video', 'icon'].includes(b.type) || !color(b.colour) || typeof b.content !== 'string' || b.content.length > 2000) return res.status(400).json({ error: 'Invalid design block.' });
        const validFont=b.font===undefined||Object.hasOwn(designAssets.fonts,b.font)||(typeof b.font==='string'&&b.font.startsWith('uploaded:')&&fontFiles().includes(b.font.slice(9)));
        if (!validFont || (b.animation !== undefined && !designAssets.animations.includes(b.animation)) || (b.weight !== undefined && !['400','600','700'].includes(b.weight)) || (b.align !== undefined && !['left','center','right'].includes(b.align)) || (b.background !== undefined && b.background !== 'transparent' && !color(b.background)) || (b.speed !== undefined && (!Number.isFinite(b.speed) || b.speed < 1 || b.speed > 20)) || (b.type === 'icon' && !Object.hasOwn(designAssets.icons,b.content))) return res.status(400).json({ error: 'Invalid block style or icon.' });
        ids.add(b.id);
        if (['x', 'y', 'w', 'h', 'size'].some(key => !Number.isFinite(b[key])) || b.x < 0 || b.y < 0 || b.w < 40 || b.h < 40 || b.x + b.w > 800 || b.y + b.h > 480 || b.size < 12 || b.size > 400) return res.status(400).json({ error: 'Design block must fit within the screen.' });
        if (['image','video'].includes(b.type) && b.content) {
          try { const url = new URL(b.content, 'http://display.local'); if (!['http:', 'https:'].includes(url.protocol)) throw Error(); } catch { return res.status(400).json({ error: 'Invalid image URL.' }); }
        }
      }
    }
    current.pages = pages;
  }
  writeConfig(current);
  res.json({ success: true, config: current });
});
app.post('/api/display/sleep', (req, res) => { manualSleepState = Boolean(req.body.sleep); res.json({ success: true, manualSleep: manualSleepState }); });
app.post('/api/pi/control', (req, res) => {
  const action = req.body.action;
  if (!['restart_browser', 'reboot_pi'].includes(action)) return res.status(400).json({ error: 'Invalid action.' });
  let command, args;
  if (process.env.HOME_DISPLAY_CONTROL === 'local') {
    command = '/usr/bin/sudo'; args = ['-n', '/usr/local/sbin/home-display-control', action];
  } else if (process.env.HOME_DISPLAY_PI_HOST && /^[a-zA-Z0-9._-]+$/.test(process.env.HOME_DISPLAY_PI_HOST)) {
    command = 'ssh'; args = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', 'pi@' + process.env.HOME_DISPLAY_PI_HOST, action === 'restart_browser' ? 'pkill -f chromium' : 'sudo /sbin/reboot'];
  } else return res.status(503).json({ error: 'Display controls are not configured.' });
  execFile(command, args, { timeout: 15000 }, err => {
    if (err) return res.status(500).json({ error: 'Display control failed.' });
    res.json({ success: true, action });
  });
});
const upload = multer({
  storage: multer.diskStorage({ destination: CONTENT_DIR, filename: (req, file, cb) => cb(null, file.originalname) }),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => validName(file.originalname) ? cb(null, true) : cb(new Error('Unsupported or reserved filename.'))
});
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  res.json({ success: true, filename: req.file.filename });
});
app.get('/api/files', (req, res) => res.json({ files: [...new Set([...editableAssets, ...fs.readdirSync(CONTENT_DIR).filter(validName)])].sort() }));
app.get('/api/file-content', (req, res) => {
  const name = req.query.filename;
  if (!validName(name)) return res.status(400).json({ error: 'Invalid filename.' });
  const target = fs.existsSync(path.join(CONTENT_DIR, name)) ? path.join(CONTENT_DIR, name) : editableAssets.includes(name) ? path.join(__dirname, name) : null;
  if (!target || !fs.existsSync(target)) return res.status(404).json({ error: 'File not found.' });
  res.json({ filename: name, content: fs.readFileSync(target, 'utf8') });
});
app.post('/api/edit', (req, res) => {
  const { filename, content } = req.body;
  if (!validName(filename) || typeof content !== 'string') return res.status(400).json({ error: 'Invalid filename or content.' });
  fs.writeFileSync(path.join(CONTENT_DIR, filename), content);
  res.json({ success: true });
});
app.delete('/api/files/:filename', (req, res) => {
  const name = req.params.filename;
  if (!validName(name)) return res.status(400).json({ error: 'Invalid filename.' });
  const target = path.join(CONTENT_DIR, name);
  if (!fs.existsSync(target)) return res.status(404).json({ error: 'Only uploaded files and custom overrides can be deleted.' });
  fs.unlinkSync(target);
  res.json({ success: true });
});
app.get('/admin', authorized, (req, res) => res.sendFile(path.join(__dirname, 'designer.html')));
app.get(['/admin.html', '/designer.html'], authorized, (req, res) => res.sendFile(path.join(__dirname, req.path.slice(1))));
app.get('/manifest.webmanifest', (req, res) => res.type('application/manifest+json').sendFile(path.join(__dirname, 'manifest.webmanifest')));
app.get('/app-icon.svg', (req, res) => res.sendFile(path.join(__dirname, 'app-icon.svg')));
app.get(['/app-icon-192.png', '/app-icon-512.png'], (req, res) => res.sendFile(path.join(__dirname, req.path.slice(1))));
app.get(['/studio-sans.ttf', '/studio-serif.ttf', '/studio-mono.ttf', '/studio-heavy.ttf', '/studio-serif-bold.ttf', '/studio-mono-italic.ttf'], (req, res) => res.sendFile(path.join(__dirname, req.path.slice(1))));
app.use(express.static(CONTENT_DIR, { dotfiles: 'deny', index: false }));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/screen/:id',(req,res)=>{if(!screens.find(req.params.id))return res.status(404).send('Screen not found.');res.sendFile(path.join(__dirname,'index.html'));});
for (const asset of assets.filter(name => !['admin.html', 'designer.html'].includes(name))) app.get('/' + asset, (req, res) => res.sendFile(path.join(__dirname, asset)));
app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(err instanceof multer.MulterError || /filename/.test(err.message) ? 400 : 500).json({ error: err instanceof multer.MulterError || /filename/.test(err.message) ? err.message : 'Request failed.' });
});
app.listen(PORT, process.env.HOST || '0.0.0.0', () => console.log(`Home Display listening on port ${PORT}`));

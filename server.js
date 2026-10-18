const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const QRCode = require('qrcode-svg');
const { pagesError } = require('./design-validation.js');
const { verifyPassword } = require('./password.js');
const appFiles = require('./app-files.json');
const createPlugins = require('./plugins.js');
const createScreens = require('./screens.js');
const createUpdates = require('./updates.js');
const { execFile } = require('child_process');
const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.resolve(process.env.HOME_DISPLAY_DATA_DIR || __dirname);
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const CONTENT_DIR = path.join(DATA_DIR, 'content');
const extensions = new Set(['.html', '.css', '.js', '.json', '.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.mp4', '.webm', '.ics']);
// app-files.json lists server modules (never served) and Studio files (served but not editable or replaceable).
const assets = fs.readdirSync(__dirname).filter(name => /\.(html|css|js)$/.test(name) && !appFiles.server.includes(name));
const protectedAssets = [...appFiles.server, ...appFiles.studio];
const editableAssets = assets.filter(name => !protectedAssets.includes(name));
fs.mkdirSync(CONTENT_DIR, { recursive: true });
if (!fs.existsSync(CONFIG_FILE)) fs.copyFileSync(path.join(__dirname, 'config.example.json'), CONFIG_FILE);
const plugins = createPlugins(DATA_DIR, CONTENT_DIR);
const screens = createScreens(DATA_DIR),updates = createUpdates(DATA_DIR);
const fontFiles=()=>fs.readdirSync(CONTENT_DIR).filter(name=>/^font-[a-zA-Z0-9._-]+\.(ttf|otf|woff|woff2)$/.test(name));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false }));

function readConfig() { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); }
function validName(name) {
  return typeof name === 'string' && name === path.basename(name) && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name)
    && extensions.has(path.extname(name).toLowerCase()) && !['config.json', 'server.js', 'package.json', 'package-lock.json', 'runtime-config.js', 'app-files.json', 'app-icon.svg', 'app-icon-192.png', 'app-icon-512.png', ...protectedAssets].includes(name);
}
function writeConfig(data) {
  fs.writeFileSync(CONFIG_FILE + '.tmp', JSON.stringify(data, null, 2));
  fs.renameSync(CONFIG_FILE + '.tmp', CONFIG_FILE);
}
function authorized(req, res, next) {
  const expected = process.env.HOME_DISPLAY_ADMIN_PASSWORD_HASH;
  if (!expected) return next();
  let credentials = '';
  if (/^Basic /i.test(req.headers.authorization || '')) credentials = Buffer.from(req.headers.authorization.slice(6), 'base64').toString();
  const separator = credentials.indexOf(':');
  if (separator >= 0 && credentials.slice(0, separator) === 'admin' && verifyPassword(credentials.slice(separator + 1), expected)) return next();
  res.set('WWW-Authenticate', 'Basic realm="Roompane", charset="UTF-8"').status(401).send('Admin login required.');
}
app.use((req, res, next) => {
  if (['POST', 'DELETE', 'PUT', 'PATCH'].includes(req.method) && req.headers.origin) {
    try { if (new URL(req.headers.origin).host !== req.headers.host) return res.status(403).json({ error: 'Origin not allowed.' }); }
    catch { return res.status(403).json({ error: 'Invalid origin.' }); }
  }
  next();
});
app.get('/api/health', (req, res) => res.json({ ok: true }));
app.get('/api/config', (req, res) => {const config=readConfig();if(req.query.screen){const screen=screens.find(req.query.screen);if(!screen)return res.status(404).json({error:'Screen not found.'});if(screen.pageIds!==null)config.pages=config.pages.filter(p=>screen.pageIds.includes(p.id));config.screen=screen;if(screen.schedule)config.settings={...config.settings,...screen.schedule};}res.set('Cache-Control','no-store').json({ ...config, manualSleep: screens.sleep(req.query.screen) });});
app.get('/api/screens',(req,res)=>res.json({screens:screens.read().map(s=>({...s,path:'/screen/'+s.id})),defaultPath:'/',adminPath:'/admin'}));
app.get('/api/version',(req,res)=>res.json({version:updates.version}));
app.get('/api/fonts',(req,res)=>res.json({fonts:fontFiles().map(name=>({key:'uploaded:'+name,name:name.replace(/^font-[a-f0-9]+-/,'').replace(/\.[^.]+$/,''),url:'/'+name}))}));
app.get('/api/plugin-status',async(req,res,next)=>{try{let pages=plugins.pages();if(req.query.screen){const screen=screens.find(req.query.screen);if(!screen)return res.status(404).json({error:'Screen not found.'});if(screen.pageIds!==null)pages=pages.filter(p=>screen.pageIds.includes(p.id));}res.set('Cache-Control','no-store').json({statuses:await plugins.statuses(),pages});}catch(error){next(error);}});
app.get('/api/plugin-view/:id',(req,res)=>{const view=plugins.view(req.params.id);res.status(view?200:404).json(view||{error:'Plugin not found.'});});
app.get('/api/plugin-data/:id',async(req,res,next)=>{try{const data=await plugins.data(req.params.id);res.set('Cache-Control','no-store').status(data?200:404).json(data||{error:'Plugin not found.'});}catch(error){next(error);}});
app.get('/runtime-config.js', (req, res) => {
  const settings = readConfig().settings || {};
    res.set('Cache-Control', 'no-store').type('js').send('window.DISPLAY_SETTINGS=' + JSON.stringify({ latitude: settings.latitude ?? 51.4185, longitude: settings.longitude ?? -0.953, timezone: settings.timezone || 'Europe/London', units: settings.units || 'celsius' }).replace(/</g, '\\u003c') + ';');
});
app.use('/api', authorized);

const backups = require('./backups')(DATA_DIR, validName, () => plugins.resetCache());
const restoreUpload = multer({storage:multer.memoryStorage(),limits:{fileSize:75*1024*1024,files:1,fields:1,fieldSize:2048}});
app.post('/api/backups/export', async (req,res) => {
  try { const buffer=await backups.export(req.body.password); res.set('Cache-Control','no-store').attachment('home-display-'+new Date().toISOString().slice(0,10)+'.hdbackup').type('application/octet-stream').send(buffer); }
  catch(error) { res.status(400).json({error:error.message}); }
});
for (const mode of ['inspect','restore']) app.post('/api/backups/'+mode, restoreUpload.single('file'), async (req,res) => {
  try { if(!req.file)throw Error('Choose a backup file.'); const summary=await backups.restore(req.file.buffer,req.body.password,mode==='inspect'); res.set('Cache-Control','no-store').json({success:true,summary}); }
  catch(error) { res.status(400).json({error:error.message}); }
});

app.post('/api/screens',(req,res)=>{try{res.json({screen:screens.save(req.body)});}catch(error){res.status(400).json({error:error.message});}});
app.delete('/api/screens/:id',(req,res)=>{screens.remove(req.params.id);res.json({success:true});});
app.get('/api/updates',async(req,res)=>res.json({...await updates.check(req.query.check==='1'),state:updates.state()}));
app.post('/api/updates/install',async(req,res)=>{if(process.env.HOME_DISPLAY_CONTROL!=='local')return res.status(503).json({error:'Automatic installation requires the standalone Pi setup.'});const update=await updates.check(true);if(!update.available||!update.installable)return res.status(400).json({error:update.message||'No installable update is available.'});execFile('/usr/bin/sudo',['-n','/usr/local/sbin/home-display-control','install_update'],{timeout:15000},error=>{if(error)return res.status(500).json({error:'Update service could not start. Install the latest updater helper on the Pi.'});res.status(202).json({success:true,message:'Update started.'});});});
app.get('/api/plugin-catalog',(req,res)=>res.json({definitions:plugins.catalog()}));
app.post('/api/plugin-definitions',(req,res)=>{try{res.json({definition:plugins.installDefinition(req.body)});}catch(error){res.status(400).json({error:error.message});}});
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
    const error = pagesError(pages, fontFiles());
    if (error) return res.status(400).json({ error });
    current.pages = pages;
  }
  writeConfig(current);
  res.json({ success: true, config: current });
});
// Addresses other devices on the network can use; hostname.local works where avahi/mDNS is running.
function networkAddresses() {
  const hosts = [os.hostname().toLowerCase() + '.local'];
  for (const entries of Object.values(os.networkInterfaces())) for (const entry of entries || []) if (entry.family === 'IPv4' && !entry.internal) hosts.push(entry.address);
  return hosts.map(host => 'http://' + host + (String(PORT) === '80' ? '' : ':' + PORT));
}
app.get('/api/device', (req, res) => res.set('Cache-Control', 'no-store').json({ addresses: networkAddresses(), controls: process.env.HOME_DISPLAY_CONTROL === 'local', manualSleep: screens.sleep(req.query.screen) }));
app.get('/api/qr.svg', (req, res) => {
  const text = req.query.text;
  if (typeof text !== 'string' || !/^https?:\/\//.test(text) || text.length > 300) return res.status(400).json({ error: 'Invalid address.' });
  res.type('image/svg+xml').send(new QRCode({ content: text, padding: 2, width: 220, height: 220, ecl: 'M', join: true, container: 'svg-viewbox' }).svg());
});
app.post('/api/display/sleep', (req, res) => { try { const id=req.body.screen; if(id !== undefined && typeof id !== 'string') throw Error('Invalid screen.'); res.json({success:true,manualSleep:screens.setSleep(id,req.body.sleep)}); } catch(error) { res.status(400).json({error:error.message}); } });
app.post('/api/pi/control', (req, res) => {
  const action = req.body.action;
  if (!['restart_browser', 'reboot_pi'].includes(action)) return res.status(400).json({ error: 'Invalid action.' });
  if (process.env.HOME_DISPLAY_CONTROL !== 'local') return res.status(503).json({ error: 'Display controls require the standalone Pi setup.' });
  execFile('/usr/bin/sudo', ['-n', '/usr/local/sbin/home-display-control', action], { timeout: 15000 }, err => {
    if (err) return res.status(500).json({ error: 'Display control failed.' });
    res.json({ success: true, action });
  });
});
// Bring the kiosk back if the screen has fallen to the LightDM login box.
if (process.env.HOME_DISPLAY_CONTROL === 'local') setInterval(() => execFile('/usr/bin/sudo', ['-n', '/usr/local/sbin/home-display-control', 'ensure_kiosk'], { timeout: 30000 }, () => {}), 120000).unref();
function freeName(name) {
  const extension = path.extname(name), base = name.slice(0, -extension.length || undefined);
  let candidate = name;
  for (let n = 2; fs.existsSync(path.join(CONTENT_DIR, candidate)); n++) candidate = base + '-' + n + extension;
  return candidate;
}
const upload = multer({
  // Same-named uploads get a numbered copy unless the caller explicitly asks to replace (?replace=1).
  storage: multer.diskStorage({ destination: CONTENT_DIR, filename: (req, file, cb) => cb(null, req.query.replace === '1' ? file.originalname : freeName(file.originalname)) }),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => validName(file.originalname) ? cb(null, true) : cb(new Error('Unsupported or reserved filename.'))
});
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  res.json({ success: true, filename: req.file.filename });
});
app.get('/api/files', (req, res) => {
  const uploads = fs.readdirSync(CONTENT_DIR).filter(validName).sort();
  res.json({ files: [...new Set([...editableAssets, ...uploads])].sort(), uploads });
});
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
app.get(['/admin', '/studio.html'], authorized, (req, res) => res.sendFile(path.join(__dirname, 'studio.html')));
app.get('/manifest.webmanifest', (req, res) => res.type('application/manifest+json').sendFile(path.join(__dirname, 'manifest.webmanifest')));
app.get('/app-icon.svg', (req, res) => res.sendFile(path.join(__dirname, 'app-icon.svg')));
app.get(['/app-icon-192.png', '/app-icon-512.png'], (req, res) => res.sendFile(path.join(__dirname, req.path.slice(1))));
app.get(['/studio-sans.ttf', '/studio-serif.ttf', '/studio-mono.ttf', '/studio-heavy.ttf', '/studio-serif-bold.ttf', '/studio-mono-italic.ttf'], (req, res) => res.sendFile(path.join(__dirname, req.path.slice(1))));
app.use(express.static(CONTENT_DIR, { dotfiles: 'deny', index: false }));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/screen/:id',(req,res)=>{if(!screens.find(req.params.id))return res.status(404).send('Screen not found.');res.sendFile(path.join(__dirname,'index.html'));});
for (const asset of assets.filter(name => name !== 'studio.html')) app.get('/' + asset, (req, res) => res.sendFile(path.join(__dirname, asset)));
app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(err instanceof multer.MulterError || /filename/.test(err.message) ? 400 : 500).json({ error: err instanceof multer.MulterError || /filename/.test(err.message) ? err.message : 'Request failed.' });
});
app.listen(PORT, process.env.HOST || '0.0.0.0', () => {
  console.log(`Roompane listening on port ${PORT}`);
  if (!process.env.HOME_DISPLAY_ADMIN_PASSWORD_HASH) console.warn('Warning: HOME_DISPLAY_ADMIN_PASSWORD_HASH is not set, so anyone who can reach this server can change it. Create one with: node password.js');
});

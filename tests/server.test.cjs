const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const net = require('node:net');
const vm = require('node:vm');
const { hashPassword, verifyPassword } = require('../password.js');

test('bundled page scripts parse and settings load before the lightweight pages', () => {
  const root = path.join(__dirname, '..');
  for (const name of fs.readdirSync(root).filter(name => name.endsWith('.html'))) {
    const text = fs.readFileSync(path.join(root, name), 'utf8');
    for (const match of text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      if (!/\bsrc=|application\/ld\+json/i.test(match[1])) new vm.Script(match[2], { filename: name });
    }
  }
  for (const name of ['display', 'time', 'weather', 'humidity', 'sky']) {
    const html = fs.readFileSync(path.join(root, name + '.html'), 'utf8');
    assert.ok(html.indexOf('/runtime-config.js') >= 0 && html.indexOf('/runtime-config.js') < html.indexOf('src="lite.js"'));
  }
});

test('scrypt password hashes verify and legacy SHA-256 hashes still work', () => {
  const stored = hashPassword('correct horse battery');
  assert.match(stored, /^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/);
  assert.equal(verifyPassword('correct horse battery', stored), true);
  assert.equal(verifyPassword('wrong password here', stored), false);
  const legacy = crypto.createHash('sha256').update('legacy-password').digest('hex');
  assert.equal(verifyPassword('legacy-password', legacy), true);
  assert.equal(verifyPassword('legacy-passwore', legacy), false);
  assert.equal(verifyPassword('anything', 'not-a-hash'), false);
});

test('standalone admin access, content safety and persistence', async () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'home-display-test-'));
  const listener = net.createServer();
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  const auth = 'Basic ' + Buffer.from('admin:test-password-123').toString('base64');
  let child;
  let output = '';
  async function start() {
    child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
      env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', HOME_DISPLAY_DATA_DIR: data,
        HOME_DISPLAY_ADMIN_PASSWORD_HASH: hashPassword('test-password-123') },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    child.stdout.on('data', text => { output += text; });
    child.stderr.on('data', text => { output += text; });
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(base + '/api/health')).ok) return; } catch {}
      if (child.exitCode !== null) throw new Error(output);
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error('Server did not start: ' + output);
  }
  async function stop() {
    if (child && child.exitCode === null) await new Promise(resolve => { child.once('exit', resolve); child.kill(); });
  }
  const request = (url, body, extra = {}) => fetch(base + url, {
    method: 'POST', headers: { Authorization: auth, 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(body)
  });
  try {
    await start();
    assert.equal((await fetch(base + '/')).status, 200);
    assert.equal((await fetch(base + '/api/config')).status, 200);
    for (const url of ['/admin', '/admin.html', '/designer.html', '/api/plugins', '/api/files', '/api/file-content?filename=weather.html']) assert.equal((await fetch(base + url)).status, 401);
    assert.equal((await fetch(base + '/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401);
    assert.equal((await fetch(base + '/admin', { headers: { Authorization: auth } })).status, 200);
    assert.equal((await fetch(base + '/admin', { headers: { Authorization: 'Basic ' + Buffer.from('admin:wrong').toString('base64') } })).status, 401);
    for (const url of ['/server.js', '/plugins.js', '/package.json', '/config.json', '/.git/config', '/install.sh']) assert.equal((await fetch(base + url)).status, 404);
    assert.equal((await request('/api/plugins', {type:'mainsail',name:'Invalid',sourceUrl:'file:///tmp/test'})).status, 400);
    assert.equal((await request('/api/plugins', {type:'custom',name:'Invalid',pageFile:'../secret.html'})).status, 400);
    assert.equal((await request('/api/screens',{name:'Living room',pageIds:['p_three_time']})).status,200);
    assert.equal((await fetch(base+'/screen/living-room')).status,200);
    assert.deepEqual((await (await fetch(base+'/api/config?screen=living-room')).json()).pages.map(p=>p.id),['p_three_time']);
    assert.equal((await fetch(base+'/api/config?screen=missing')).status,404);
    assert.equal((await request('/api/screens',{id:'../bad',name:'Invalid',pageIds:null})).status,400);
    assert.equal((await (await fetch(base+'/api/version')).json()).version,require('../package.json').version);
    assert.equal((await request('/api/updates/install',{})).status,503);
    const badFont=new FormData();badFont.append('file',new Blob(['not a font']),'bad.ttf');
    assert.equal((await fetch(base+'/api/fonts',{method:'POST',headers:{Authorization:auth},body:badFont})).status,400);
    assert.equal((await request('/api/config', { settings: { latitude: 200 } })).status, 400);
    assert.equal((await request('/api/config', { settings: { timezone: 'fake/timezone' } })).status, 400);
    assert.equal((await request('/api/config', { settings: { latitude: 40, longitude: -74, timezone: 'America/New_York' } }, { Origin: 'http://elsewhere.test' })).status, 403);
    assert.equal((await request('/api/config', { settings: { latitude: 40, longitude: -74, timezone: 'America/New_York' } })).status, 200);
    assert.match(await (await fetch(base + '/runtime-config.js')).text(), /America\/New_York/);
    const designedPage = {id:'design_test',name:'Designed page',url:'design-display.html?id=design_test',time:30,active:true,design:{bg:'#102820',fg:'#ffffff',accent:'#87d4a4',blocks:[{id:'clock',type:'clock',x:10,y:10,w:300,h:150,size:64,colour:'#ffffff',content:''}]}};
    assert.equal((await request('/api/config', {pages:[designedPage]})).status, 200);
    const invalidPage = structuredClone(designedPage);
    invalidPage.design.blocks[0].x = 750;
    assert.equal((await request('/api/config', {pages:[invalidPage]})).status, 400);
    for (const style of [{font:'unknown'},{animation:'unknown'},{background:'url(bad)'},{speed:0},{type:'icon',content:'unknown'}]) {
      const badStyle = structuredClone(designedPage);
      Object.assign(badStyle.design.blocks[0],style);
      assert.equal((await request('/api/config', {pages:[badStyle]})).status, 400);
    }
    assert.equal((await fetch(base + '/studio-serif.ttf')).status, 200);
    for (const filename of ['design-assets.js','design-assets.css']) assert.equal((await request('/api/edit', {filename,content:'bad'})).status, 400);
    assert.equal((await request('/api/config', {settings:{units:'invalid'}})).status, 400);
    assert.equal((await fetch(base + '/manifest.webmanifest')).status, 200);
    assert.equal((await fetch(base + '/design-display.html?id=design_test')).status, 200);
    for (const filename of ['designer.html', 'designer.js', 'design-display.js', 'sw.js']) assert.equal((await request('/api/edit', {filename,content:'bad'})).status, 400);
    assert.equal((await request('/api/edit', { filename: 'server.js', content: 'bad' })).status, 400);
    assert.equal((await request('/api/edit', { filename: '../outside.html', content: 'bad' })).status, 400);
    assert.equal((await request('/api/edit', { filename: 'weather.html', content: '<h1>Custom weather</h1>' })).status, 200);
    assert.match(await (await fetch(base + '/weather.html')).text(), /Custom weather/);
    const form = new FormData();
    form.append('file', new Blob(['<h1>Uploaded page</h1>'], { type: 'text/html' }), 'uploaded.html');
    assert.equal((await fetch(base + '/api/upload', { method: 'POST', headers: { Authorization: auth }, body: form })).status, 200);
    assert.equal(fs.existsSync(path.join(data, 'content', 'uploaded.html')), true);
    const duplicate = new FormData();
    duplicate.append('file', new Blob(['<h1>Second page</h1>'], { type: 'text/html' }), 'uploaded.html');
    assert.equal((await (await fetch(base + '/api/upload', { method: 'POST', headers: { Authorization: auth }, body: duplicate })).json()).filename, 'uploaded-2.html');
    const replacement = new FormData();
    replacement.append('file', new Blob(['<h1>Replaced page</h1>'], { type: 'text/html' }), 'uploaded-2.html');
    assert.equal((await (await fetch(base + '/api/upload?replace=1', { method: 'POST', headers: { Authorization: auth }, body: replacement })).json()).filename, 'uploaded-2.html');
    assert.match(fs.readFileSync(path.join(data, 'content', 'uploaded-2.html'), 'utf8'), /Replaced page/);
    const rejected = new FormData();
    rejected.append('file', new Blob(['bad']), 'admin.html');
    assert.equal((await fetch(base + '/api/upload', { method: 'POST', headers: { Authorization: auth }, body: rejected })).status, 400);
    await stop();
    await start();
    const persisted = await (await fetch(base + '/api/config')).json();
    assert.equal(persisted.settings.latitude, 40);
    assert.deepEqual(persisted.pages[0].design, designedPage.design);
    assert.match(await (await fetch(base + '/uploaded.html')).text(), /Uploaded page/);
    assert.match(await (await fetch(base + '/weather.html')).text(), /Custom weather/);
    assert.equal((await fetch(base + '/api/files', { headers: { Authorization: auth } })).status, 200);
    assert.equal((await fetch(base + '/api/files/weather.html', { method: 'DELETE', headers: { Authorization: auth } })).status, 200);
    assert.match(await (await fetch(base + '/weather.html')).text(), /lite.js/);
    assert.equal((await request('/api/pi/control', { action: 'reboot_pi; echo bad' })).status, 400);
    assert.equal((await request('/api/pi/control', { action: 'restart_browser' })).status, 503);
  } finally {
    await stop();
    fs.rmSync(data, { recursive: true, force: true });
  }
});

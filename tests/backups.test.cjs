const {test}=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'), path=require('node:path'), os=require('node:os'), crypto=require('node:crypto'), zlib=require('node:zlib');
const createBackups=require('../backups');
const password='a-long-backup-password';
function fixture(t) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'display-backup-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  fs.mkdirSync(path.join(dir,'content'));
  fs.copyFileSync(path.join(__dirname,'../config.example.json'),path.join(dir,'config.json'));
  fs.writeFileSync(path.join(dir,'content','photo.png'),Buffer.from([1,2,3,4]));
  fs.writeFileSync(path.join(dir,'plugins.json'),JSON.stringify([{id:'plugin_test',type:'mainsail',name:'Printer',sourceUrl:'http://printer.local:7125',apiKey:'private-printer-key',enabled:true,onlyConnected:true,time:30,options:{}}]));
  let resets=0;
  const backups=createBackups(dir,name=>/^[a-z0-9-]+\.(png|html)$/.test(name),()=>resets++);
  return {dir,backups,resets:()=>resets};
}
test('encrypted backup restores settings, media and credentials without changing device secrets',async t=>{
  const {dir,backups,resets}=fixture(t), original=fs.readFileSync(path.join(dir,'config.json'));
  fs.writeFileSync(path.join(dir,'github-token.json'),'keep-this-device-token');
  const buffer=await backups.export(password);
  assert.equal(buffer.includes(Buffer.from('private-printer-key')),false);
  assert.equal(buffer.includes(Buffer.from('keep-this-device-token')),false);
  const summary=await backups.restore(buffer,password,true);assert.equal(summary.files,3);assert.equal(resets(),0);
  fs.writeFileSync(path.join(dir,'config.json'),'{}');fs.unlinkSync(path.join(dir,'content','photo.png'));
  fs.writeFileSync(path.join(dir,'content','later.html'),'later');
  await backups.restore(buffer,password);
  assert.deepEqual(fs.readFileSync(path.join(dir,'config.json')),original);
  assert.deepEqual(fs.readFileSync(path.join(dir,'content','photo.png')),Buffer.from([1,2,3,4]));
  assert.equal(fs.existsSync(path.join(dir,'content','later.html')),false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'plugins.json')))[0].apiKey,'private-printer-key');
  assert.equal(fs.readFileSync(path.join(dir,'github-token.json'),'utf8'),'keep-this-device-token');assert.equal(resets(),1);
});
test('wrong password and tampered ciphertext leave live data untouched',async t=>{
  const {dir,backups}=fixture(t), before=fs.readFileSync(path.join(dir,'config.json'));
  const buffer=await backups.export(password);
  await assert.rejects(backups.restore(buffer,'incorrect-long-password'),/Wrong backup password/);
  buffer[buffer.length-1]^=1;await assert.rejects(backups.restore(buffer,password),/Wrong backup password/);
  assert.deepEqual(fs.readFileSync(path.join(dir,'config.json')),before);
});
function encrypted(files) {
  const magic=Buffer.from('HOME-DISPLAY-BACKUP-1\n'),salt=crypto.randomBytes(16),iv=crypto.randomBytes(12);
  const cipher=crypto.createCipheriv('aes-256-gcm',crypto.scryptSync(password,salt,32),iv);cipher.setAAD(magic);
  const data=Buffer.concat([cipher.update(zlib.gzipSync(Buffer.from(JSON.stringify({format:1,files})))),cipher.final()]);
  return Buffer.concat([magic,salt,iv,cipher.getAuthTag(),data]);
}
test('restore rejects traversal, protected files, duplicate entries and invalid configuration',async t=>{
  const {dir,backups}=fixture(t),before=fs.readFileSync(path.join(dir,'config.json'));
  for(const name of ['content/../../escape.html','server.js','github-token.json','content/sub/page.html']) {
    await assert.rejects(backups.restore(encrypted([{name,data:Buffer.from('bad').toString('base64')}]),password),/Unsafe/);
  }
  const entry={name:'config.json',data:before.toString('base64')};
  await assert.rejects(backups.restore(encrypted([entry,entry]),password),/Unsafe/);
  await assert.rejects(backups.restore(encrypted([{name:'config.json',data:Buffer.from('{}').toString('base64')}]),password),/Invalid pages/);
  assert.deepEqual(fs.readFileSync(path.join(dir,'config.json')),before);
});
test('failed file replacement rolls back previous settings and media',async t=>{
  const {dir,backups}=fixture(t),buffer=await backups.export(password);
  const changed=JSON.parse(fs.readFileSync(path.join(dir,'config.json')));changed.settings.locationName='Changed after backup';
  fs.writeFileSync(path.join(dir,'config.json'),JSON.stringify(changed));
  const rename=fs.renameSync;
  t.mock.method(fs,'renameSync',(from,to)=>{
    if(String(from).includes('.restore-') && to===path.join(dir,'content'))throw Error('Simulated disk failure');
    return rename(from,to);
  });
  await assert.rejects(backups.restore(buffer,password),/Simulated disk failure/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'config.json'))).settings.locationName,'Changed after backup');
  assert.equal(fs.existsSync(path.join(dir,'content','photo.png')),true);
});

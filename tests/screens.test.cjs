const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const createScreens=require('../screens');
test('screen schedules and manual sleep persist independently across reloads',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'display-screens-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const screens=createScreens(dir);
  screens.save({name:'TV',pageIds:null,schedule:{sleepTime:'00:00',wakeTime:'00:00'}});
  screens.setSleep('tv',true);assert.equal(screens.sleep(),false);
  const reloaded=createScreens(dir);assert.equal(reloaded.sleep('tv'),true);
  assert.deepEqual(reloaded.find('tv').schedule,{sleepTime:'00:00',wakeTime:'00:00'});
  reloaded.setSleep(undefined,true);reloaded.setSleep('tv',false);
  assert.equal(createScreens(dir).sleep(),true);assert.equal(createScreens(dir).sleep('tv'),false);
  reloaded.save({id:'tv',name:'Living room TV',pageIds:null});
  assert.deepEqual(reloaded.find('tv').schedule,{sleepTime:'00:00',wakeTime:'00:00'});
  assert.throws(()=>reloaded.save({id:'tv',name:'TV',pageIds:null,schedule:{sleepTime:'25:00',wakeTime:'07:00'}}));
  assert.throws(()=>reloaded.setSleep('missing',true));
});

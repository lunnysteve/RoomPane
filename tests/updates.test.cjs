const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const createUpdates=require('../updates');
test('release versions compare numerically and private token never leaves update results',async()=>{
  assert.equal(createUpdates.compare('1.10.0','1.9.9'),1);
  assert.equal(createUpdates.compare('1.1.0','2.0.0'),-1);
  assert.equal(createUpdates.compare('1.1.0','1.1.0'),0);
  const data=fs.mkdtempSync(path.join(os.tmpdir(),'display-update-')),original=global.fetch;
  const next=String(Number(require('../package.json').version.split('.')[0])+1)+'.0.0';
  let calls=0;
  global.fetch=async(url,options)=>{calls++;assert.equal(options.headers.Authorization,'Bearer github_pat_test_private_token_12345');return {ok:true,status:200,json:async()=>({tag_name:'v'+next,html_url:'https://github.com/lunnysteve/home-display/releases/tag/v'+next,assets:[{name:'home-display-v'+next+'.tar.gz'},{name:'SHA256SUMS'}]})};};
  try{const updates=createUpdates(data);updates.saveToken('github_pat_test_private_token_12345');const result=await updates.check();assert.equal(result.available,true);assert.equal(result.installable,true);assert.ok(!JSON.stringify(result).includes('private_token'));await updates.check();assert.equal(calls,1);await updates.check(true);assert.equal(calls,2);assert.throws(()=>updates.saveToken('bad\ntoken'));}finally{global.fetch=original;fs.rmSync(data,{recursive:true,force:true});}
});

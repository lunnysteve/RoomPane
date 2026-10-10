'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const createPlugins=require('../plugins');

test('universal definitions, private credentials and all four example adapters',async()=>{
  const data=fs.mkdtempSync(path.join(os.tmpdir(),'home-plugins-')),content=path.join(data,'content');fs.mkdirSync(content);
  fs.writeFileSync(path.join(content,'example.html'),'<html>Plugin</html>');fs.writeFileSync(path.join(content,'photo.jpg'),'photo');
  const stamp=date=>date.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');const tomorrow=new Date(Date.now()+86400000);tomorrow.setUTCHours(10,0,0,0);const end=new Date(tomorrow.valueOf()+3600000);
  const feed=['BEGIN:VCALENDAR','VERSION:2.0','BEGIN:VEVENT','UID:repeat','DTSTART:'+stamp(tomorrow),'DTEND:'+stamp(end),'RRULE:FREQ=DAILY;COUNT=3','SUMMARY:Family breakfast','END:VEVENT','END:VCALENDAR'].join('\r\n');
  const source=http.createServer((req,res)=>{
    res.setHeader('Content-Type','application/json');let value;
    if(req.url==='/server/info'){assert.equal(req.headers['x-api-key'],'printer-secret');value={result:{klippy_connected:true,klippy_state:'ready'}};}
    else if(req.url.startsWith('/printer/objects/query'))value={result:{status:{print_stats:{state:'printing',filename:'test.gcode'},virtual_sdcard:{progress:.42},extruder:{temperature:205},heater_bed:{temperature:60}}}};
    else if(req.url==='/api/'){assert.equal(req.headers.authorization,'Bearer ha-secret');value={message:'API running.'};}
    else if(req.url.startsWith('/api/states/')){assert.equal(req.headers.authorization,'Bearer ha-secret');value={entity_id:'sensor.room',state:'21',attributes:{friendly_name:'Living room',unit_of_measurement:'°C'}};}
    else if(req.url.startsWith('/api/calendars/')){assert.equal(req.headers.authorization,'Bearer ha-secret');value=[{summary:'School',start:{dateTime:tomorrow.toISOString()},end:{dateTime:end.toISOString()}}];}
    else if(req.url==='/feed.ics?private=feed-secret'){res.setHeader('Content-Type','text/calendar');res.end(feed);return;}
    else if(req.url==='/status'){assert.equal(req.headers.authorization,'Bearer community-secret');value={power:123};}
    else{res.statusCode=404;value={error:'not found'};}res.end(JSON.stringify(value));
  });await new Promise(resolve=>source.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+source.address().port;
  try{
    const plugins=createPlugins(data,content),save=input=>plugins.save({name:'Example',enabled:true,onlyConnected:true,time:30,...input});
    assert.equal(plugins.catalog().length,5);
    const printer=save({type:'mainsail',sourceUrl:url,apiKey:'printer-secret'});assert.equal((await plugins.data(printer.id)).data.progress,.42);
    const ha=save({type:'homeassistant',sourceUrl:url,apiKey:'ha-secret',options:{entityIds:'sensor.room'}});assert.equal((await plugins.data(ha.id)).data.entities[0].name,'Living room');assert.equal(ha.hasApiKey,true);assert.ok(!JSON.stringify(ha).includes('ha-secret'));
    const photos=save({type:'photos',onlyConnected:false,showPage:false,options:{images:'/photo.jpg',interval:5,fit:'cover'}});assert.equal((await plugins.data(photos.id)).data.images.length,1);assert.ok(!plugins.pages().some(p=>p.id===photos.id));assert.equal(plugins.view(photos.id).adapter,'photos');
    const calendar=save({type:'calendar',feedUrl:url+'/feed.ics?private=feed-secret',options:{days:10}});const agenda=await plugins.data(calendar.id);assert.equal(agenda.connected,true,agenda.message);assert.equal(agenda.data.events.length,3);assert.equal(calendar.hasFeedUrl,true);assert.ok(!JSON.stringify(calendar).includes('feed-secret'));
    fs.writeFileSync(path.join(content,'calendar.ics'),feed);const local=save({type:'calendar',calendarFile:'calendar.ics',onlyConnected:false});assert.equal((await plugins.data(local.id)).data.events.length,3);
    const haCalendar=save({type:'calendar',sourceUrl:url,apiKey:'ha-secret',options:{calendarEntity:'calendar.family',days:14}});assert.equal((await plugins.data(haCalendar.id)).data.events[0].summary,'School');
    plugins.installDefinition({schemaVersion:1,id:'community.power',name:'Power meter',version:'1.0.0',adapter:'json',auth:'bearer',sourceRequired:true,pageFile:'example.html',healthPath:'/status',fields:[{key:'title',label:'Title',type:'text',default:'Power'}]});
    const community=save({type:'community.power',sourceUrl:url,apiKey:'community-secret',options:{title:'Energy'}});assert.equal((await plugins.data(community.id)).data.power,123);assert.equal(plugins.view(community.id).url,'example.html?plugin='+community.id);assert.equal(createPlugins(data,content).catalog().length,6);
    plugins.installDefinition({schemaVersion:1,id:'community.entity',name:'Entity example',version:'1.0.0',adapter:'json',auth:'bearer',sourceRequired:true,pageFile:'example.html',healthPath:'/api/states/{entity}',fields:[{key:'entity',label:'Entity ID',type:'text',default:'sensor.room'}]});
    const templated=save({type:'community.entity',sourceUrl:url,apiKey:'ha-secret'});assert.equal((await plugins.data(templated.id)).data.state,'21');
    assert.throws(()=>plugins.installDefinition({schemaVersion:1,id:'mainsail',name:'Override'}));assert.throws(()=>save({type:'homeassistant',sourceUrl:url,apiKey:'x',options:{entityIds:'../bad'}}));assert.throws(()=>save({type:'photos',options:{images:'javascript:alert(1)'},onlyConnected:false}));
    assert.ok(!JSON.stringify(plugins.list()).includes('community-secret'));assert.ok(!JSON.stringify(plugins.list()).includes('feed-secret'));
    const restored=createPlugins(data,content);assert.equal((await restored.data(ha.id)).data.entities[0].state,'21');
  }finally{await new Promise(resolve=>source.close(resolve));fs.rmSync(data,{recursive:true,force:true});}
});

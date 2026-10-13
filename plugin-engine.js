'use strict';

const fs=require('fs'),path=require('path'),crypto=require('crypto');
const ical=require('node-ical');
const builtins=require('./plugin-catalog');

module.exports=function createPlugins(dataDir,contentDir){
  const file=path.join(dataDir,'plugins.json'),definitionFile=path.join(dataDir,'plugin-definitions.json'),cache=new Map();
  const read=()=>fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):[];
  const readDefinitions=()=>fs.existsSync(definitionFile)?JSON.parse(fs.readFileSync(definitionFile,'utf8')):[];
  function write(target,value){fs.writeFileSync(target+'.tmp',JSON.stringify(value,null,2),{mode:0o600});fs.renameSync(target+'.tmp',target);}
  const catalog=()=>[...builtins,...readDefinitions()];
  const definition=id=>catalog().find(item=>item.id===id);
  function httpUrl(value,allowQuery=false){
    if(typeof value!=='string'||value.length>2000)throw Error('Enter an HTTP(S) address.');
    const url=new URL(/^[a-z]+:\/\//i.test(value)?value:'http://'+value);
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.hash||(!allowQuery&&url.search))throw Error('Use HTTP(S), without inline credentials.');
    return url.href.replace(/\/$/,'');
  }
  function filename(value,extension){return typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value)&&value.endsWith(extension)&&fs.existsSync(path.join(contentDir,value));}
  function endpoint(value){if(typeof value!=='string'||!/^\/(?!\/)/.test(value)||value.length>500||/[\\#]/.test(value)||value.split('/').includes('..'))throw Error('Use a source path beginning with /.');return value;}
  function installDefinition(input){
    if(!input||input.schemaVersion!==1||!/^community\.[a-z0-9][a-z0-9.-]{0,79}$/.test(input.id||''))throw Error('Use schemaVersion 1 and a community.* plugin ID.');
    if(typeof input.name!=='string'||!input.name.trim()||input.name.length>100||!/^\d+\.\d+\.\d+$/.test(input.version||''))throw Error('Provide a plugin name and semantic version.');
    if(input.adapter!=='json'||!['none','bearer','api-key'].includes(input.auth||'none'))throw Error('Community plugins support the JSON adapter and none, bearer or api-key authentication.');
    if(!filename(input.pageFile,'.html'))throw Error('Upload the plugin HTML renderer first, then reference its filename.');
    const fields=input.fields||[];
    if(!Array.isArray(fields)||fields.length>20||fields.some(f=>!f||!/^\w{1,40}$/.test(f.key)||['__proto__','constructor','prototype'].includes(f.key)||typeof f.label!=='string'||f.label.length>150||!['text','textarea','number','checkbox','media'].includes(f.type)))throw Error('Invalid plugin settings fields.');
    if(new Set(fields.map(f=>f.key)).size!==fields.length)throw Error('Plugin field keys must be unique.');
    const item={schemaVersion:1,id:input.id,name:input.name.trim(),version:input.version,description:String(input.description||'').slice(0,500),adapter:'json',auth:input.auth||'none',sourceRequired:!!input.sourceRequired,pageFile:input.pageFile,healthPath:endpoint(input.healthPath||'/'),fields:fields.map(f=>({key:f.key,label:f.label,type:f.type,default:['string','number','boolean'].includes(typeof f.default)?f.default:''}))};
    const items=readDefinitions();if(!items.some(d=>d.id===item.id)&&items.length>=50)throw Error('Maximum 50 community definitions.');
    write(definitionFile,[...items.filter(d=>d.id!==item.id),item]);cache.clear();return item;
  }
  function validate(input,old={}){
    const def=definition(input?.type);if(!def)throw Error('Choose an installed plugin definition.');
    if(typeof input.name!=='string'||!input.name.trim()||input.name.length>100)throw Error('Enter a plugin name.');
    const plugin={id:old.id||'plugin_'+crypto.randomUUID(),type:def.id,name:input.name.trim(),enabled:input.enabled!==false,onlyConnected:input.onlyConnected!==false,showPage:input.showPage!==false,sourceUrl:input.sourceUrl?httpUrl(input.sourceUrl):'',apiKey:input.apiKey===undefined?old.apiKey||'':input.apiKey,time:input.time??30,pageFile:input.pageFile||def.pageFile||'',healthPath:endpoint(input.healthPath||def.healthPath||'/'),options:{},feedUrl:input.feedUrl===undefined?old.feedUrl||'':input.feedUrl,calendarFile:input.calendarFile===undefined?old.calendarFile||'':input.calendarFile};
    if(typeof plugin.apiKey!=='string'||plugin.apiKey.length>4096||/[\r\n]/.test(plugin.apiKey))throw Error('Invalid source credential.');
    if(!Number.isFinite(plugin.time)||plugin.time<5||plugin.time>3600)throw Error('Page duration must be 5–3600 seconds.');
    for(const field of def.fields){const value=input.options?.[field.key]??old.options?.[field.key]??field.default;if(!['string','number','boolean'].includes(typeof value)||String(value).length>10000)throw Error('Invalid setting: '+field.label);plugin.options[field.key]=value;}
    if(def.sourceRequired&&!plugin.sourceUrl)throw Error('Enter the source address.');
    if(def.adapter==='json'&&!filename(plugin.pageFile,'.html'))throw Error('Upload an HTML plugin page first.');
    if(def.adapter==='homeassistant'){
      const ids=String(plugin.options.entityIds||'').split(/[\s,]+/).filter(Boolean);
      if(!ids.length||ids.length>12||ids.some(id=>!/^\w+\.\w+$/.test(id)))throw Error('Enter 1–12 valid Home Assistant entity IDs.');
      if(!plugin.apiKey)throw Error('Enter a Home Assistant long-lived access token.');
    }
    if(def.adapter==='photos'){
      const images=String(plugin.options.images||'').split('\n').map(s=>s.trim()).filter(Boolean);
      if(images.length>200)throw Error('Maximum 200 photos per slideshow.');
      for(const image of images){if(image.startsWith('/')){if(!/^\/[a-zA-Z0-9][a-zA-Z0-9._-]*\.(png|jpe?g|webp|gif)$/i.test(image))throw Error('Use uploaded image URLs or HTTP(S) image URLs.');}else httpUrl(image,true);}
      plugin.options.interval=Math.max(3,Math.min(3600,Number(plugin.options.interval)||10));plugin.options.fit=plugin.options.fit==='cover'?'cover':'contain';
    }
    if(def.adapter==='calendar'){
      if(plugin.feedUrl)plugin.feedUrl=httpUrl(plugin.feedUrl.replace(/^webcal:/i,'https:'),true);
      if(plugin.calendarFile&&!filename(plugin.calendarFile,'.ics'))throw Error('Upload an .ics calendar file first.');
      if(plugin.options.calendarEntity&&!/^calendar\.\w+$/.test(plugin.options.calendarEntity))throw Error('Enter a calendar.* entity ID.');
      if(!plugin.feedUrl&&!plugin.calendarFile&&!(plugin.sourceUrl&&plugin.options.calendarEntity))throw Error('Provide an iCalendar feed, uploaded calendar file, or Home Assistant calendar source.');
      if(plugin.sourceUrl&&plugin.options.calendarEntity&&!plugin.apiKey)throw Error('Enter a Home Assistant access token.');
      plugin.options.days=Math.max(1,Math.min(90,Number(plugin.options.days)||14));
    }
    if(plugin.onlyConnected&&!plugin.sourceUrl&&!['photos','calendar'].includes(def.adapter))throw Error('Connected-only needs a source; disable it for a standalone page.');
    return plugin;
  }
  function publicPlugin(p){const {apiKey,feedUrl,...safe}=p;return {...safe,hasApiKey:!!apiKey,hasFeedUrl:!!feedUrl};}
  async function request(url,headers={},json=true){
    const response=await fetch(url,{headers,signal:AbortSignal.timeout(5000),redirect:'error'});
    if(!response.ok)throw Error(response.status===401||response.status===403?'Source requires valid credentials.':'Source returned HTTP '+response.status);
    if(json==='optional'&&!response.headers.get('content-type')?.includes('json')){await response.body?.cancel();return null;}
    const reader=response.body?.getReader();if(!reader)throw Error('Source returned an empty response.');
    let size=0;const chunks=[];while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>1024*1024){await reader.cancel();throw Error('Source response is too large.');}chunks.push(Buffer.from(value));}
    const text=Buffer.concat(chunks).toString('utf8');return json?JSON.parse(text):text;
  }
  function headers(plugin){const auth=definition(plugin.type)?.auth;return plugin.apiKey?(auth==='bearer'?{Authorization:'Bearer '+plugin.apiKey}:auth==='api-key'?{'X-Api-Key':plugin.apiKey}:{}):{};}
  const get=(plugin,url,json=true)=>request(plugin.sourceUrl+url,headers(plugin),json);
  async function probe(plugin){
    const def=definition(plugin.type),result={id:plugin.id,name:plugin.name,type:plugin.type,connected:false,checkedAt:new Date().toISOString(),data:null,message:'Source unavailable'};
    if(!plugin.enabled)return {...result,message:'Plugin disabled'};
    if(!def)return {...result,message:'Plugin definition unavailable'};
    try{
      if(def.adapter==='moonraker'){
        const info=(await get(plugin,'/server/info')).result;if(typeof info?.klippy_connected!=='boolean')throw Error('This address is not the Moonraker API. Try port 7125.');
        result.connected=info.klippy_connected;result.message=info.klippy_connected?'Printer '+info.klippy_state:'Moonraker reachable; printer disconnected';
        if(info.klippy_connected&&info.klippy_state==='ready'){
          const status=(await get(plugin,'/printer/objects/query?print_stats&virtual_sdcard&extruder&heater_bed')).result?.status;
          if(!status||typeof status!=='object')throw Error('Invalid Moonraker response.');const stats=status.print_stats||{},number=value=>typeof value==='number'&&Number.isFinite(value)?value:null;
          result.data={state:stats.state||'standby',filename:stats.filename||'',progress:number(status.virtual_sdcard?.progress),duration:number(stats.print_duration),nozzle:number(status.extruder?.temperature),nozzleTarget:number(status.extruder?.target),bed:number(status.heater_bed?.temperature),bedTarget:number(status.heater_bed?.target),message:stats.message||''};
        }
      }else if(def.adapter==='homeassistant'){
        await get(plugin,'/api/');const ids=String(plugin.options.entityIds).split(/[\s,]+/).filter(Boolean);
        result.data={entities:await Promise.all(ids.map(async id=>{const entity=await get(plugin,'/api/states/'+encodeURIComponent(id));return {id,name:entity.attributes?.friendly_name||id,state:entity.state,unit:entity.attributes?.unit_of_measurement||'',icon:entity.attributes?.icon||'',updatedAt:entity.last_updated,latitude:typeof entity.attributes?.latitude==='number'?entity.attributes.latitude:null,longitude:typeof entity.attributes?.longitude==='number'?entity.attributes.longitude:null,radius:typeof entity.attributes?.radius==='number'?entity.attributes.radius:null,picture:entity.attributes?.entity_picture||null,battery:entity.attributes?.battery_level??entity.attributes?.battery??null,sourceType:entity.attributes?.source_type||null};}))};result.connected=true;result.message='Home Assistant connected';
      }else if(def.adapter==='photos'){
        const images=String(plugin.options?.images||'').split('\n').map(s=>s.trim()).filter(Boolean).filter(url=>!url.startsWith('/')||fs.existsSync(path.join(contentDir,url.slice(1)))||fs.existsSync(path.join(__dirname,url.slice(1))));
        result.data={images,interval:plugin.options?.interval||10,fit:plugin.options?.fit||'contain'};result.connected=images.length>0;result.message=images.length?images.length+' photos ready':'Add photos to the slideshow';
      }else if(def.adapter==='calendar'){
        const from=new Date(),to=new Date(Date.now()+(plugin.options?.days||14)*86400000);let events=[];
        if(plugin.sourceUrl&&plugin.options?.calendarEntity){
          const raw=await get(plugin,'/api/calendars/'+encodeURIComponent(plugin.options.calendarEntity)+'?start='+encodeURIComponent(from.toISOString())+'&end='+encodeURIComponent(to.toISOString()));
          if(!Array.isArray(raw))throw Error('Invalid calendar response.');events=raw.map(e=>({summary:e.summary||'Event',start:e.start?.dateTime||e.start?.date,end:e.end?.dateTime||e.end?.date,allDay:!!e.start?.date,location:e.location||''}));
        }else{
          const text=plugin.feedUrl?await request(plugin.feedUrl,{},false):fs.readFileSync(path.join(contentDir,plugin.calendarFile),'utf8');
          if(text.length>1024*1024||!text.includes('BEGIN:VCALENDAR'))throw Error('Invalid iCalendar feed.');
          for(const event of Object.values(ical.sync.parseICS(text))){
            if(event.type!=='VEVENT'||event.status==='CANCELLED'||!event.start)continue;
            const instances=ical.expandRecurringEvent(event,{from,to});
            for(const item of instances){if(item.start&&item.end&&new Date(item.end)>=from)events.push({summary:item.summary||event.summary||'Event',start:new Date(item.start).toISOString(),end:new Date(item.end).toISOString(),allDay:!!item.isFullDay||event.datetype==='date',location:item.location||event.location||''});}
          }
        }
        result.data={events:events.sort((a,b)=>new Date(a.start)-new Date(b.start)).slice(0,50)};result.connected=true;result.message=events.length+' upcoming events';
      }else if(plugin.sourceUrl){const endpointPath=plugin.healthPath.replace(/\{([A-Za-z]\w*)\}/g,(match,key)=>{if(plugin.options?.[key]===undefined)throw Error('Invalid source path setting.');return encodeURIComponent(String(plugin.options[key]));});result.data=await get(plugin,endpointPath,'optional');result.connected=true;result.message='Source connected';}
      else{result.connected=true;result.message='Standalone page';}
    }catch(error){result.connected=false;result.data=null;result.message=error.name==='TimeoutError'?'Source timed out':/^(Source|This address|Invalid)/.test(error.message)?error.message:'Unable to connect to source';}
    return result;
  }
  async function status(plugin,force=false){const existing=cache.get(plugin.id);if(existing&&!force&&Date.now()-existing.at<6000)return existing.value;const value=probe(plugin);cache.set(plugin.id,{at:Date.now(),value});return value;}
  function pageUrl(p){const adapter=definition(p.type)?.adapter;if(adapter==='json')return p.pageFile+'?plugin='+encodeURIComponent(p.id);if(p.type==='mainsail')return 'plugin-mainsail.html?id='+encodeURIComponent(p.id);return 'plugin-view.html?id='+encodeURIComponent(p.id);}
  return {read,catalog,installDefinition,publicPlugin,status,request,resetCache:()=>cache.clear(),
    list:()=>read().map(publicPlugin),
    async statuses(){return Promise.all(read().map(p=>status(p)));},
    async data(id){const plugin=read().find(p=>p.id===id);return plugin?status(plugin):null;},
    view(id){const p=read().find(p=>p.id===id);return p?{...publicPlugin(p),adapter:definition(p.type)?.adapter,url:pageUrl(p)}:null;},
    async test(input){const old=read().find(p=>p.id===input.id);return probe(validate({...input,pageFile:input.pageFile||old?.pageFile},old));},
    save(input){const items=read(),old=items.find(p=>p.id===input.id);if(!old&&items.length>=50)throw Error('Maximum 50 configured plugins.');const p=validate(input,old),next=old?items.map(item=>item.id===old.id?p:item):[...items,p];write(file,next);cache.delete(p.id);return publicPlugin(p);},
    remove(id){write(file,read().filter(p=>p.id!==id));cache.delete(id);},
    appendPhotos(id,urls){const items=read(),p=items.find(p=>p.id===id);if(!p||definition(p.type)?.adapter!=='photos')throw Error('Photos plugin not found.');const images=[...new Set([...String(p.options?.images||'').split('\n').filter(Boolean),...urls])];if(images.length>200)throw Error('Maximum 200 photos per slideshow.');p.options={...p.options,images:images.join('\n')};write(file,items);cache.delete(id);},
    pages(){return read().filter(p=>p.showPage!==false).map(p=>({id:p.id,name:p.name,url:pageUrl(p),time:p.time,active:p.enabled,pluginId:p.id,onlyConnected:p.onlyConnected}));}
  };
};

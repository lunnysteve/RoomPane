'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

module.exports = function createPlugins(dataDir, contentDir) {
  const file = path.join(dataDir, 'plugins.json'), cache = new Map();
  const read = () => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
  function write(items) { fs.writeFileSync(file + '.tmp', JSON.stringify(items,null,2), {mode:0o600}); fs.renameSync(file + '.tmp',file); }
  function source(value) {
    if (typeof value !== 'string' || value.length > 500) throw Error('Enter a source IP or HTTP(S) address.');
    const url = new URL(/^[a-z]+:\/\//i.test(value) ? value : 'http://' + value);
    if (!['http:','https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw Error('Use an HTTP(S) source address without credentials or query parameters.');
    return url.href.replace(/\/$/,'');
  }
  function validate(input, old = {}) {
    if (!input || !['mainsail','custom'].includes(input.type)) throw Error('Choose a plugin type.');
    if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 100) throw Error('Enter a plugin name.');
    const plugin = {id:old.id || 'plugin_' + crypto.randomUUID(),type:input.type,name:input.name.trim(),enabled:input.enabled !== false,onlyConnected:input.onlyConnected !== false,sourceUrl:input.sourceUrl ? source(input.sourceUrl) : '',apiKey:input.apiKey === undefined ? old.apiKey || '' : input.apiKey,time:input.time ?? 30,pageFile:input.pageFile || '',healthPath:input.healthPath || '/'};
    if (typeof plugin.apiKey !== 'string' || plugin.apiKey.length > 500 || /[\r\n]/.test(plugin.apiKey)) throw Error('Invalid API key.');
    if (!Number.isFinite(plugin.time) || plugin.time < 5 || plugin.time > 3600) throw Error('Page duration must be 5–3600 seconds.');
    if (plugin.type === 'mainsail' && !plugin.sourceUrl) throw Error('Enter the Moonraker address, usually http://printer-ip:7125.');
    if (plugin.type === 'custom') {
      if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.html$/.test(plugin.pageFile) || !fs.existsSync(path.join(contentDir,plugin.pageFile))) throw Error('Upload a single HTML page first.');
      if (typeof plugin.healthPath !== 'string' || !/^\/(?!\/)/.test(plugin.healthPath) || plugin.healthPath.length > 200 || /[?#\\]/.test(plugin.healthPath) || plugin.healthPath.split('/').includes('..')) throw Error('Invalid source health path.');
      if (plugin.onlyConnected && !plugin.sourceUrl) throw Error('A source address is needed for connected-only pages.');
    }
    return plugin;
  }
  const publicPlugin = ({apiKey,...plugin}) => ({...plugin,hasApiKey:!!apiKey});
  async function get(plugin, endpoint, json = true) {
    const url = plugin.sourceUrl + endpoint;
    const response = await fetch(url, {headers:plugin.apiKey ? {'X-Api-Key':plugin.apiKey} : {},signal:AbortSignal.timeout(3500),redirect:'error'});
    if (!response.ok) throw Error(response.status === 401 || response.status === 403 ? 'Source requires a valid API key or trusted-client access.' : 'Source returned HTTP ' + response.status);
    if (!json) { if(response.body) await response.body.cancel(); return null; }
    if(json==='optional'&&!response.headers.get('content-type')?.includes('json')){if(response.body)await response.body.cancel();return null;}
    const reader=response.body.getReader(); let size=0; const chunks=[];
    while (true) { const {value,done}=await reader.read(); if(done)break; size+=value.length; if(size>1024*1024){await reader.cancel();throw Error('Source response is too large.');} chunks.push(Buffer.from(value)); }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }
  async function probe(plugin) {
    const result={id:plugin.id,name:plugin.name,type:plugin.type,connected:false,checkedAt:new Date().toISOString(),data:null,message:'Source unavailable'};
    if (!plugin.enabled) return {...result,message:'Plugin disabled'};
    try {
      if(plugin.type==='mainsail'){
        const info=(await get(plugin,'/server/info')).result;
        if(typeof info?.klippy_connected!=='boolean')throw Error('This address is not a Moonraker API. Try port 7125.');
        result.connected=info.klippy_connected;result.message=info.klippy_connected?'Printer '+info.klippy_state:'Moonraker reachable; printer disconnected';
        if(info.klippy_connected&&info.klippy_state==='ready'){
          const query=await get(plugin,'/printer/objects/query?print_stats&virtual_sdcard&extruder&heater_bed');
          const status=query.result?.status;if(!status||typeof status!=='object')throw Error('Invalid Moonraker printer response.');
          const stats=status.print_stats||{},sd=status.virtual_sdcard||{};
          const number=value=>typeof value==='number'&&Number.isFinite(value)?value:null;
          result.data={state:stats.state||'standby',filename:stats.filename||'',progress:number(sd.progress),duration:number(stats.print_duration),nozzle:number(status.extruder?.temperature),nozzleTarget:number(status.extruder?.target),bed:number(status.heater_bed?.temperature),bedTarget:number(status.heater_bed?.target),message:stats.message||''};
        }
      }else if(plugin.sourceUrl){result.data=await get(plugin,plugin.healthPath,'optional');result.connected=true;result.message='Source connected';}
      else {result.connected=true;result.message='Standalone page';}
    }catch(error){result.connected=false;result.data=null;result.message=error.name==='TimeoutError'?'Source timed out':error.message.startsWith('Source')||error.message.startsWith('This address')||error.message.startsWith('Invalid Moonraker')?error.message:'Unable to connect to source';}
    return result;
  }
  async function status(plugin,force=false) {
    const existing=cache.get(plugin.id);if(existing&&!force&&Date.now()-existing.at<6000)return existing.value;
    const value=probe(plugin);cache.set(plugin.id,{at:Date.now(),value});return value;
  }
  return {read,publicPlugin,status,
    list:()=>read().map(publicPlugin),
    async statuses(){return Promise.all(read().map(plugin=>status(plugin)));},
    async data(id){const plugin=read().find(p=>p.id===id);return plugin?status(plugin):null;},
    async test(input){const old=read().find(p=>p.id===input.id);return probe(validate({...input,pageFile:input.pageFile||old?.pageFile},old));},
    save(input){const items=read(),old=items.find(p=>p.id===input.id);if(!old&&items.length>=20)throw Error('Maximum 20 plugins.');const plugin=validate(input,old);const next=old?items.map(p=>p.id===old.id?plugin:p):[...items,plugin];write(next);cache.delete(plugin.id);return publicPlugin(plugin);},
    remove(id){write(read().filter(plugin=>plugin.id!==id));cache.delete(id);},
    pages(){return read().map(p=>({id:p.id,name:p.name,url:p.type==='mainsail'?'plugin-mainsail.html?id='+encodeURIComponent(p.id):p.pageFile+'?plugin='+encodeURIComponent(p.id),time:p.time,active:p.enabled,pluginId:p.id,onlyConnected:p.onlyConnected}));}
  };
};

'use strict';
// A small public API for community page/block renderers. No admin credentials are exposed.
window.HomeDisplayPlugin={
  id:new URLSearchParams(location.search).get('plugin')||new URLSearchParams(location.search).get('id'),
  embedded:new URLSearchParams(location.search).get('embedded')==='1',
  async config(){const response=await fetch('/api/plugin-view/'+encodeURIComponent(this.id),{cache:'no-store'});if(!response.ok)throw Error('Plugin unavailable');return response.json();},
  async data(){const response=await fetch('/api/plugin-data/'+encodeURIComponent(this.id),{cache:'no-store'});if(!response.ok)throw Error('Plugin unavailable');return response.json();},
  watch(render,interval=10000){let active=true,lastConfig=null;const update=async()=>{try{const [result,config]=await Promise.all([this.data(),this.config()]);if(active){lastConfig=config;if(this.embedded)document.body.style.visibility=config.onlyConnected&&!result.connected?'hidden':'';render({...result,options:config.options||{}});}}catch{if(active){if(this.embedded&&lastConfig?.onlyConnected)document.body.style.visibility='hidden';render({connected:false,message:'Source unavailable',data:null,options:lastConfig?.options||{}});}}};update();const timer=setInterval(update,Math.max(6000,interval));return()=>{active=false;clearInterval(timer);};}
};

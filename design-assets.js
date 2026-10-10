(function (root) {
  'use strict';
  const fonts = {sans:'"Studio Sans", sans-serif',serif:'"Studio Serif", serif',mono:'"Studio Mono", monospace',heavy:'"Studio Heavy", sans-serif',serifbold:'"Studio Serif Bold", serif',monoitalic:'"Studio Mono Italic", monospace',system:'system-ui, sans-serif'};
  const loadedFonts=new Set();
  async function loadFonts(){try{const response=await fetch('/api/fonts',{cache:'no-store'});if(!response.ok)return [];const {fonts:items}=await response.json();await Promise.all(items.map(async item=>{if(!loadedFonts.has(item.key)){const family='Custom '+item.key.slice(9),face=new FontFace(family,'url("'+item.url+'")');try{await face.load();document.fonts.add(face);fonts[item.key]='"'+family+'", sans-serif';loadedFonts.add(item.key);}catch{}}}));return items;}catch{return [];}}
  const icons = {
    sun:{label:'Sun',paths:['M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8','M12 1v3m0 16v3M1 12h3m16 0h3M4.2 4.2l2.1 2.1m11.4 11.4 2.1 2.1M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1']},
    moon:{label:'Moon',paths:['M20.5 14a9 9 0 0 1-10.5-10.5A9 9 0 1 0 20.5 14Z']},
    cloud:{label:'Cloud',paths:['M6 18h12a4 4 0 0 0 0-8 6 6 0 0 0-11.7-1.7A5 5 0 0 0 6 18Z']},
    rain:{label:'Rain',paths:['M6 14h12a4 4 0 0 0 0-8 6 6 0 0 0-11.7-1.7A5 5 0 0 0 6 14Z','M7 18l-1 3m6-3-1 3m6-3-1 3']},
    snow:{label:'Snow',paths:['M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7','m9 4 3 3 3-3m-6 16 3-3 3 3M4 10l4-1-1-4m10 14-1-4 4-1M4 14l4 1-1 4m10-14-1 4 4 1']},
    wind:{label:'Wind',paths:['M3 8h12a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h7a3 3 0 1 1-3 3']},
    thermometer:{label:'Temperature',paths:['M9 14V5a3 3 0 0 1 6 0v9a5 5 0 1 1-6 0Z','M12 9v9m6-12h3m-3 4h3']},
    droplet:{label:'Humidity',paths:['M12 2S5 10 5 15a7 7 0 0 0 14 0c0-5-7-13-7-13Z','M8 15a4 4 0 0 0 4 4']},
    home:{label:'Home',paths:['m2 10 10-8 10 8M5 8v14h14V8M9 22v-8h6v8']},
    light:{label:'Light',paths:['M9 18h6m-6 3h6M8 15a7 7 0 1 1 8 0l-1 3H9l-1-3Z']},
    power:{label:'Power',paths:['M12 2v10M6 5a9 9 0 1 0 12 0']},
    clock:{label:'Clock',paths:['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20','M12 6v6l4 2']},
    star:{label:'Star',paths:['m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z']},
    heart:{label:'Heart',paths:['M12 21 3 12a6 6 0 0 1 9-8 6 6 0 0 1 9 8l-9 9Z']},
    gear:{label:'Settings',paths:['m9 2 6 0 1 4 4 1 2 5-3 3 0 4-5 3-3-3-4 0-3-5 3-3 0-4 4-1Z','M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8']},
    printer:{label:'Printer',paths:['M6 8V2h12v6M6 17H2V8h20v9h-4M6 14h12v8H6Z','M18 11h1']}
  };
  const animations=['none','pulse','float','spin','bounce','fade'];
  function applyStyle(el,b){el.style.fontFamily=fonts[b.font||'sans'];el.style.fontWeight=b.weight||'400';el.style.textAlign=b.align||'center';el.style.justifyContent=b.align==='left'?'flex-start':b.align==='right'?'flex-end':'center';el.style.backgroundColor=b.background||'transparent';}
  function fill(el,b){
    if(b.type==='plugin'){
      const frame=document.createElement('iframe');frame.className='design-content motion-'+(animations.includes(b.animation)?b.animation:'none');frame.title='Plugin';frame.style.cssText='width:100%;height:100%;border:0;pointer-events:none';frame.style.animationDuration=(b.speed||4)+'s';
      el.style.padding='0';el.append(frame);
      if(b.pluginId)fetch('/api/plugin-view/'+encodeURIComponent(b.pluginId)).then(async response=>{
        if(!response.ok)throw Error();const view=await response.json();
        const url=new URL(view.adapter==='json'?view.url:'/plugin-view.html?id='+encodeURIComponent(b.pluginId),location.origin);
        url.searchParams.set('embedded','1');url.searchParams.set('colour',b.colour||'#f1f5fb');url.searchParams.set('size',String(b.size||28));
        if(url.origin!==location.origin)throw Error();frame.src=url.href;
      }).catch(()=>{frame.remove();el.textContent='Plugin unavailable';});
      return frame;
    }

    const media=document.createElement(b.type==='video'?'video':b.type==='image'?'img':'span');
    media.className='design-content motion-'+(animations.includes(b.animation)?b.animation:'none');media.style.animationDuration=(b.speed||4)+'s';
    if(b.type==='icon'){
      const icon=icons[b.content]||icons.sun,ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
      svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.7');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('role','img');svg.setAttribute('aria-label',icon.label);
      icon.paths.forEach(d=>{const path=document.createElementNS(ns,'path');path.setAttribute('d',d);svg.append(path);});media.append(svg);
    }else if(b.type==='image'||b.type==='video'){
      media.src=b.content||'/app-icon.svg';media.draggable=false;
      if(b.type==='video'){media.muted=true;media.autoplay=true;media.loop=true;media.playsInline=true;media.preload='metadata';media.setAttribute('muted','');media.setAttribute('playsinline','');}else media.alt='';
    }else media.textContent=b.content||'';
    el.append(media);return media;
  }
  const assets={fonts,icons,animations,applyStyle,fill,loadFonts};
  if(typeof module==='object'&&module.exports)module.exports=assets;else root.DESIGN_ASSETS=assets;
})(typeof window==='object'?window:globalThis);

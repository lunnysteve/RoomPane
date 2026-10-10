'use strict';
(function(){
  const params=new URLSearchParams(location.search),id=params.get('id'),embedded=params.get('embedded')==='1';
  document.body.classList.toggle('embedded',embedded);
  if(embedded)document.documentElement.style.background='transparent';
  if(embedded){const colour=params.get('colour');if(colour&&CSS.supports('color',colour))document.body.style.color=colour;const size=Number(params.get('size'));if(size>=12&&size<=400){const style=document.createElement('style');style.textContent='.value{font-size:'+size+'px!important}';document.head.append(style);}}
  const title=document.getElementById('title'),message=document.getElementById('message'),items=document.getElementById('items');
  let view=null,photoSignature='',photoTimer=null;
  function element(tag,text,className){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;}
  function tile(label,value){const el=element('div',undefined,'tile');el.append(element('div',label,'label'),element('div',value,'value'));return el;}
  function stopPhotos(){clearInterval(photoTimer);photoTimer=null;photoSignature='';document.getElementById('photo')?.remove();}
  function render(result){
    title.textContent=result.name;message.textContent='';
    if(!result.connected){stopPhotos();items.replaceChildren();if(embedded&&view.onlyConnected){title.hidden=true;message.hidden=true;document.body.style.background='transparent';}else{title.hidden=false;message.hidden=false;message.textContent=result.message;}return;}
    title.hidden=false;message.hidden=false;document.body.style.background='';const data=result.data||{};
    if(view.adapter==='photos'){
      const signature=JSON.stringify(data);if(signature===photoSignature)return;stopPhotos();photoSignature=signature;items.replaceChildren();title.hidden=true;
      const image=element('img');image.id='photo';image.alt=result.name;image.style.objectFit=data.fit||'contain';document.body.append(image);let index=0;const cursorKey='home-display-photo-'+id;
      try{index=Math.max(0,Number(localStorage.getItem(cursorKey))||0);}catch{}
      const show=()=>{image.src=data.images[index++%data.images.length];try{localStorage.setItem(cursorKey,String(index));}catch{}};image.onerror=()=>{message.textContent='Photo unavailable';message.style.position='relative';message.style.zIndex='1';};image.onload=()=>{message.textContent='';};show();photoTimer=setInterval(show,(data.interval||10)*1000);return;
    }
    stopPhotos();items.replaceChildren();
    if(view.adapter==='homeassistant'){
      items.className='grid';for(const entity of data.entities||[])items.append(tile(entity.name,entity.state+((entity.unit||'')?' '+entity.unit:'')));
    }else if(view.adapter==='calendar'){
      items.className='';for(const event of (data.events||[]).slice(0,embedded?6:12)){
        const item=element('div',undefined,'event');let when;
        try{when=new Intl.DateTimeFormat(undefined,event.allDay?{weekday:'short',month:'short',day:'numeric',timeZone:'UTC'}:{weekday:'short',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(event.start));}catch{when=event.start;}
        item.append(element('div',event.summary,'event-title'),element('div',when+(event.allDay?' · All day':'')+(event.location?' · '+event.location:''),'event-time'));items.append(item);
      }if(!data.events?.length)message.textContent='No upcoming events';
    }else if(view.adapter==='moonraker'){
      items.className='grid';items.append(tile('State',data.state||result.message),tile('Progress',Math.round((data.progress||0)*100)+'%'),tile('Nozzle',data.nozzle==null?'—':Math.round(data.nozzle)+'°C'),tile('Bed',data.bed==null?'—':Math.round(data.bed)+'°C'));if(data.filename)message.textContent=data.filename;
    }
  }
  async function refresh(){try{const [metadata,response]=await Promise.all([fetch('/api/plugin-view/'+encodeURIComponent(id),{cache:'no-store'}),fetch('/api/plugin-data/'+encodeURIComponent(id),{cache:'no-store'})]);if(!metadata.ok||!response.ok)throw Error();view=await metadata.json();render(await response.json());}catch{stopPhotos();items.replaceChildren();if(embedded&&view?.onlyConnected){title.hidden=true;message.hidden=true;}else message.textContent='Plugin unavailable';}}
  refresh();setInterval(refresh,10000);
})();

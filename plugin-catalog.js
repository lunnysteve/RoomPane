'use strict';

// Definitions describe reusable integrations. Connections and credentials live in runtime data.
module.exports = [
  {schemaVersion:1,id:'mainsail',name:'Klipper / Moonraker',version:'1.0.0',description:'Printer state, job progress and temperatures.',adapter:'moonraker',auth:'api-key',sourceRequired:true,fields:[]},
  {schemaVersion:1,id:'homeassistant',name:'Home Assistant',version:'1.0.0',description:'Read selected sensors, lights and other entity states.',adapter:'homeassistant',auth:'bearer',sourceRequired:true,fields:[{key:'entityIds',label:'Entity IDs (one per line, maximum 12)',type:'textarea',default:'sensor.living_room_temperature'}]},
  {schemaVersion:1,id:'photos',name:'Photos',version:'1.0.0',description:'A slideshow from uploads, image URLs or imported Google Photos exports.',adapter:'photos',auth:'none',sourceRequired:false,fields:[{key:'images',label:'Photo URLs or uploaded filenames (one per line)',type:'media',default:''},{key:'interval',label:'Seconds per photo',type:'number',default:10},{key:'fit',label:'Image fit: contain or cover',type:'text',default:'contain'}]},
  {schemaVersion:1,id:'calendar',name:'Calendar',version:'1.0.0',description:'Google Calendar through its iCal address, other iCalendar feeds/files, or a Home Assistant calendar.',adapter:'calendar',auth:'bearer',sourceRequired:false,fields:[{key:'calendarEntity',label:'Home Assistant calendar entity (optional)',type:'text',default:''},{key:'days',label:'Days ahead (1–90)',type:'number',default:14}]},
  {schemaVersion:1,id:'custom',name:'Community HTML plugin',version:'1.0.0',description:'Install a reusable definition and HTML renderer, or use your own HTML page.',adapter:'json',auth:'api-key',sourceRequired:false,fields:[]}
];

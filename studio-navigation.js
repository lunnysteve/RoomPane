'use strict';
// Keep editing and device administration in focused workspaces.
const studioMain=document.querySelector('main');
const pagePanels=[...studioMain.children].filter(panel=>!['plugins-panel','devices-panel','html-editor'].includes(panel.id));
const appearance=document.querySelector('.settings');
const globalPanel=document.createElement('section');
globalPanel.id='settings-panel';globalPanel.className='panel';globalPanel.hidden=true;
const weatherHeading=[...appearance.querySelectorAll('h2')].find(heading=>heading.textContent==='Weather location');
const weatherDivider=weatherHeading.previousElementSibling;
let settingsNode=weatherDivider;
while(settingsNode&&settingsNode!==$('font-upload').parentElement){const next=settingsNode.nextElementSibling;globalPanel.append(settingsNode);settingsNode=next;}
globalPanel.querySelector('hr')?.remove();
studioMain.append(globalPanel);
const updatePanel=document.createElement('section');updatePanel.id='updates-panel';updatePanel.className='panel';updatePanel.hidden=true;
const updateHeading=[...devicePanel.querySelectorAll('h2')].find(heading=>heading.textContent==='Software updates');
updateHeading.previousElementSibling.remove();
let updateNode=updateHeading;while(updateNode){const next=updateNode.nextElementSibling;updatePanel.append(updateNode);updateNode=next;}
studioMain.append(updatePanel);
const tokenOptions=document.createElement('details');tokenOptions.className='token-options';const tokenSummary=document.createElement('summary');tokenSummary.textContent='Private repository access (optional)';tokenOptions.append(tokenSummary,githubAccess);updatePanel.append(tokenOptions);
githubAccess.querySelector('.hint').textContent='Public releases work without a token. While the repository is private, use a token restricted to this repository with Contents: read-only. Leave the field empty and save to remove a stored token.';
$('github-token-state').textContent=githubAccess.querySelector('.hint').textContent;
devicePanel.querySelector('h2').textContent='Screens & display URLs';
$('close-devices').hidden=true;$('close-plugins').hidden=true;
const navigation=document.createElement('nav');navigation.className='studio-nav';navigation.setAttribute('aria-label','Studio sections');
document.querySelector('header').after(navigation);
const navButtons={};
function showStudioSection(section){
  studioMain.dataset.section=section;
  for(const panel of pagePanels)panel.hidden=section!=='pages';
  if(section!=='pages')$('html-editor').hidden=true;
  pluginPanel.hidden=section!=='plugins';devicePanel.hidden=section!=='screens';globalPanel.hidden=section!=='settings';updatePanel.hidden=section!=='updates';
  for(const [name,button] of Object.entries(navButtons)){button.classList.toggle('selected',name===section);button.setAttribute('aria-current',name===section?'page':'false');}
  if(section==='plugins')refreshPlugins();if(section==='screens')refreshScreens();if(section==='updates')checkUpdates();
  if(section==='pages'&&page()?.design)requestAnimationFrame(renderStage);
}
for(const [section,label] of [['pages','Pages & designer'],['screens','Screens'],['plugins','Plugins'],['settings','Weather & schedule'],['updates','Updates']]){const button=document.createElement('button');button.textContent=label;button.onclick=()=>showStudioSection(section);navButtons[section]=button;navigation.append(button);}
pluginButton.hidden=true;devicesButton.hidden=true;
versionBadge.onclick=()=>showStudioSection('updates');
const previousHtmlAction=$('open-html').onclick;$('open-html').onclick=()=>{showStudioSection('pages');previousHtmlAction?.();};
const saveButton=$('save');if(saveButton)saveButton.textContent='Save page & settings';
const style=document.createElement('style');style.textContent=`
[hidden]{display:none!important}header{padding:18px 28px}.studio-nav{display:flex;gap:8px;flex-wrap:wrap;max-width:1500px;margin:auto;padding:16px 24px 0}.studio-nav button{background:transparent;border-color:transparent;color:#adbed1}.studio-nav button.selected{background:#213c5d;border-color:#6ebaff;color:#fff}main:not([data-section="pages"]){display:block;max-width:1080px}main:not([data-section="pages"])>.panel{margin-bottom:20px}#settings-panel{max-width:720px}#screen-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}#endpoint-list a,#screen-list a{overflow-wrap:anywhere}#screen-form,#plugin-form{border-top:1px solid #3b4d66;margin-top:24px;padding-top:12px}.token-options{border-top:1px solid #3b4d66;margin-top:24px;padding-top:18px}.token-options summary{cursor:pointer;color:#adbed1}#updates-panel .row{flex-wrap:wrap}#updates-panel .row>*{flex:0 1 auto}#plugins-panel>p,#devices-panel>p{max-width:760px}header #version-badge{background:transparent;font-size:13px}#pages{max-height:420px;overflow:auto}@media(max-width:700px){.studio-nav{padding:12px 12px 0;gap:4px}.studio-nav button{padding:8px}#screen-list{display:block}}
`;
document.head.append(style);showStudioSection('pages');

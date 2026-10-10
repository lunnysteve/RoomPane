'use strict';
(() => {
  const byId = id => document.getElementById(id);
  const message = text => { byId('backup-status').textContent = text; };
  const lock = value => { byId('backup-export').disabled = byId('backup-restore').disabled = value; };
  const password = () => { const value=byId('backup-password').value; if(value.length<12)throw Error('Enter a backup password of at least 12 characters.'); return value; };
  async function checked(response) { if(!response.ok) { const data=await response.json().catch(()=>({}));throw Error(data.error||'Backup request failed.'); } return response; }
  byId('backup-export').onclick = async () => {
    lock(true);
    try {
      if(dirty || htmlDirty)throw Error('Save or discard your changes before creating a backup.');
      const secret=password(); message('Preparing encrypted backup…');
      const response=await checked(await fetch('/api/backups/export',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:secret})}));
      const url=URL.createObjectURL(await response.blob()), link=document.createElement('a');
      link.href=url; link.download='home-display-'+new Date().toISOString().slice(0,10)+'.hdbackup'; document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
      byId('backup-password').value=''; message('Backup downloaded. Store it and its password safely.');
    } catch(error) { message(error.message); } finally { lock(false); }
  };
  byId('backup-restore').onclick = async () => {
    lock(true);
    try {
      const secret=password(), file=byId('backup-file').files[0]; if(!file)throw Error('Choose a .hdbackup file.');
      if(file.size>75*1024*1024)throw Error('Backup file is too large.');
      const send=async mode=>{const data=new FormData();data.append('password',secret);data.append('file',file);return (await checked(await fetch('/api/backups/'+mode,{method:'POST',body:data}))).json();};
      message('Checking password and backup contents…'); const {summary}=await send('inspect');
      if(!confirm('Restore '+summary.files+' files from '+(summary.createdAt||'this backup')+'? This replaces saved pages, media, screens and plugin connections. Any unsaved edits will be discarded.')) { message('Restore cancelled. Nothing changed.'); return; }
      message('Restoring backup…'); await send('restore'); byId('backup-password').value='';
      // Clear the editor's unload prompt only after a successful restore.
      dirty=false; htmlDirty=false; location.reload();
    } catch(error) { message(error.message); } finally { lock(false); }
  };
})();

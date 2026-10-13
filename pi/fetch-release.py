#!/usr/bin/env python3
"""Root-owned release installer; only installs stable releases from its configured repo."""
import hashlib, json, os, re, shutil, subprocess, tarfile, tempfile, time
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlparse
from urllib.request import Request, build_opener, HTTPRedirectHandler

APP=Path('/opt/home-display/app')
NODE=Path('/opt/home-display/node/bin')
UPDATES=Path('/opt/home-display/updates')
DATA=Path(os.environ.get('HOME_DISPLAY_DATA_DIR','/var/lib/home-display'))
REPO=os.environ.get('HOME_DISPLAY_UPDATE_REPO','lunnysteve/RoomPane')
TRUSTED_PREFIXES=tuple({f'https://api.github.com/repos/{REPO}/','https://api.github.com/repos/lunnysteve/RoomPane/','https://api.github.com/repos/lunnysteve/home-display/'})
SYSTEM_FILES={
    'fetch-release.py':(Path('/usr/local/lib/home-display/fetch-release.py'),0o755),
    'home-display-control':(Path('/usr/local/sbin/home-display-control'),0o755),
    'home-display.sudoers':(Path('/etc/sudoers.d/home-display'),0o440),
    'home-display-update.service':(Path('/etc/systemd/system/home-display-update.service'),0o644),
}
class Redirect(HTTPRedirectHandler):
    def redirect_request(self,request,fp,code,msg,headers,newurl):
        if urlparse(newurl).scheme!='https': raise ValueError('Insecure download redirect rejected')
        redirected=super().redirect_request(request,fp,code,msg,headers,newurl)
        return redirected
opener=build_opener(Redirect())
INSTALL_LOG=[]
def status(state,message,version=None):
    target=DATA/'update-status.json'
    INSTALL_LOG.append(time.strftime('%H:%M:%S')+'  '+message)
    del INSTALL_LOG[:-50]
    descriptor,temporary=tempfile.mkstemp(prefix='.update-',dir=DATA)
    with os.fdopen(descriptor,'w') as handle:
        os.fchmod(handle.fileno(),0o644)
        json.dump({'state':state,'message':message,'version':version,'updatedAt':time.time(),'log':INSTALL_LOG},handle)
    os.replace(temporary,target)
def download(url,target=None,limit=150*1024*1024,asset=False):
    prefixes=tuple({f'https://api.github.com/repos/{REPO}/',*TRUSTED_PREFIXES})
    if not any(url.startswith(p) for p in prefixes): raise ValueError('Untrusted release URL')
    headers={'User-Agent':'home-display-updater','Accept':'application/octet-stream' if asset else 'application/vnd.github+json'}
    with opener.open(Request(url,headers=headers),timeout=30) as response:
        chunks=[];size=0
        while True:
            chunk=response.read(65536)
            if not chunk: break
            size+=len(chunk)
            if size>limit: raise ValueError('Release download exceeds size limit')
            chunks.append(chunk)
    data=b''.join(chunks)
    if target: target.write_bytes(data)
    return data
def run(*args):
    subprocess.run(args,check=True,env={**os.environ,'PATH':str(NODE)+':/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'},stdout=subprocess.DEVNULL)
def healthy():
    for attempt in range(30):
        if subprocess.run(['curl','--fail','--silent','http://127.0.0.1:3000/api/health'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0:return True
        time.sleep(1)
    return False

def replace_system_file(source,target,mode):
    target.parent.mkdir(parents=True,exist_ok=True)
    temporary=target.with_name(target.name+'.update-tmp')
    try:
        shutil.copyfile(source,temporary)
        temporary.chmod(mode)
        os.replace(temporary,target)
    finally:
        if temporary.exists():temporary.unlink()

def prepare_system_files(stage,backup):
    for name,(target,mode) in SYSTEM_FILES.items():
        source=stage/'pi'/name
        if not source.is_file():raise ValueError('Release is missing an updater helper: '+name)
    run('visudo','-cf',str(stage/'pi/home-display.sudoers'))
    backup.mkdir(mode=0o700)
    for name,(target,mode) in SYSTEM_FILES.items():
        if target.exists():shutil.copy2(target,backup/name)
        else:(backup/(name+'.absent')).touch()

def restore_system_files(backup):
    for name,(target,mode) in SYSTEM_FILES.items():
        if (backup/(name+'.absent')).exists():target.unlink(missing_ok=True)
        else:replace_system_file(backup/name,target,mode)
    run('systemctl','daemon-reload')
def main():
    if os.geteuid()!=0: raise ValueError('Updater must run as root')
    if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+',REPO): raise ValueError('Invalid update repository')
    UPDATES.mkdir(parents=True,exist_ok=True)
    current=json.loads((APP/'package.json').read_text())['version']
    status('checking','Checking GitHub releases',current)
    release=json.loads(download('https://api.github.com/repos/'+REPO+'/releases/latest',limit=2*1024*1024))
    tag=release.get('tag_name','')
    if not re.fullmatch(r'v\d+\.\d+\.\d+',tag) or release.get('draft') or release.get('prerelease'):raise ValueError('Invalid stable release')
    version=tag[1:]
    if tuple(map(int,version.split('.')))<=tuple(map(int,current.split('.'))):status('complete','Already up to date',current);return
    assets={item['name']:item['url'] for item in release['assets']}
    name='home-display-'+tag+'.tar.gz'
    if name not in assets or 'SHA256SUMS' not in assets:raise ValueError('Release package or checksums missing')
    with tempfile.TemporaryDirectory(prefix='download-',dir=UPDATES) as work:
        work=Path(work);archive=work/name;stage=work/'app';stage.mkdir()
        status('downloading','Downloading '+tag,version)
        download(assets[name],archive,asset=True)
        sums=download(assets['SHA256SUMS'],limit=65536,asset=True).decode()
        expected=next((line.split()[0] for line in sums.splitlines() if len(line.split())==2 and line.split()[1].lstrip('*')==name),None)
        if not expected or hashlib.sha256(archive.read_bytes()).hexdigest()!=expected:raise ValueError('Release checksum verification failed')
        status('verifying','Checksum verified; checking archive contents',version)
        with tarfile.open(archive) as tar:
            total=0
            for member in tar.getmembers():
                parts=Path(member.name).parts
                if Path(member.name).is_absolute() or '..' in parts or not (member.isfile() or member.isdir()) or any(part in {'.git','node_modules','content','.local'} for part in parts) or member.name=='config.json':raise ValueError('Unsafe release archive')
                total+=member.size
                if total>300*1024*1024:raise ValueError('Release archive exceeds extraction limit')
                member.mode=0o755 if member.isdir() or member.name.endswith('.sh') else 0o644
                tar.extract(member,stage,set_attrs=False)
                (stage/member.name).chmod(member.mode)
        if json.loads((stage/'package.json').read_text())['version']!=version:raise ValueError('Package version differs from release tag')
        status('installing','Installing dependencies for '+tag,version)
        subprocess.run([str(NODE/'npm'),'ci','--omit=dev','--ignore-scripts'],cwd=stage,check=True,env={**os.environ,'PATH':str(NODE)+':/usr/bin:/bin'},stdout=subprocess.DEVNULL)
        # The daemon runs as home-display, rather than the root installer.
        for directory,subdirs,files in os.walk(stage):
            Path(directory).chmod(0o755)
            for name in files:
                target=Path(directory)/name
                if not target.is_symlink():target.chmod(0o755 if target.stat().st_mode&0o111 else 0o644)
        for script in stage.glob('*.js'):run(str(NODE/'node'),'--check',str(script))
        # Runtime settings, screens, plugins, keys and uploads live outside APP.
        backup=UPDATES/('app-v'+current+'-'+str(time.time_ns()))
        system_backup=UPDATES/('system-v'+current+'-'+str(time.time_ns()))
        prepare_system_files(stage,system_backup)
        status('installing','Dependencies ready; replacing application',version)
        run('systemctl','stop','home-display')
        try:
            APP.rename(backup);stage.rename(APP)
            for name,(target,mode) in SYSTEM_FILES.items():replace_system_file(APP/'pi'/name,target,mode)
            run('systemctl','daemon-reload')
            run('systemctl','start','home-display')
            status('verifying','Checking the restarted application',version)
            if not healthy():raise ValueError('Updated service failed its health check')
        except Exception:
            status('rolling-back','Installation failed; restoring previous application',current)
            run('systemctl','stop','home-display')
            if backup.exists():
                if APP.exists():APP.rename(work/'failed-app')
                backup.rename(APP)
            restore_system_files(system_backup)
            run('systemctl','start','home-display')
            raise
        status('complete','Installed '+tag+'. Previous app retained for rollback.',version)
if __name__=='__main__':
    try:main()
    except Exception as error:
        status('failed','Update failed; application preserved or restored. '+('GitHub access denied or no release available.' if isinstance(error,HTTPError) else str(error)))
        raise SystemExit(1)

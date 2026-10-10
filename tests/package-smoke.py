"""Start a fresh extracted release with independent data and real dependencies."""
import json, os, shutil, socket, subprocess, tarfile, tempfile, time
from pathlib import Path
from urllib.request import urlopen
root=Path(__file__).resolve().parents[1]
subprocess.run([shutil.which('python') or 'python3',str(root/'tools/package-release.py')],cwd=root,check=True)
version=json.loads((root/'package.json').read_text())['version']
with tempfile.TemporaryDirectory(prefix='home-display-package-') as temporary:
    app=Path(temporary)/'app';app.mkdir();data=Path(temporary)/'data'
    with tarfile.open(root/'dist'/('home-display-v'+version+'.tar.gz')) as archive:archive.extractall(app,filter='data')
    manifest=json.loads((app/'app-files.json').read_text())
    for group in manifest.values():
        for name in group:assert (app/name).is_file(),name
    subprocess.run([shutil.which('npm'),'ci','--omit=dev','--ignore-scripts'],cwd=app,check=True,stdout=subprocess.DEVNULL)
    with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    env={**os.environ,'PORT':str(port),'HOST':'127.0.0.1','HOME_DISPLAY_DATA_DIR':str(data)};env.pop('HOME_DISPLAY_ADMIN_PASSWORD_HASH',None)
    process=subprocess.Popen([shutil.which('node'),'server.js'],cwd=app,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    base='http://127.0.0.1:'+str(port)
    try:
        for _ in range(150):
            try:urlopen(base+'/api/health').close();break
            except OSError:time.sleep(.1)
        assert json.load(urlopen(base+'/api/version'))['version']==version
        assert json.load(urlopen(base+'/api/config'))['pages']
        assert len(json.load(urlopen(base+'/api/plugin-catalog'))['definitions'])>=4
        for route in ['/','/admin','/studio-backup.js','/plugin-studio.js','/design-assets.js']:assert urlopen(base+route).status==200,route
        assert (data/'config.json').is_file()
        print('PASS: fresh extracted release, real dependency install, manifest assets and independent data')
    finally:process.terminate();process.wait(timeout=10)

"""Exercise release replacement and rollback with temporary paths and service stubs."""
import hashlib,importlib.util,io,json,os,tarfile,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('updater',Path(__file__).resolve().parents[1]/'pi/fetch-release.py')
updater=importlib.util.module_from_spec(spec);spec.loader.exec_module(updater)
class ReleaseInstall(unittest.TestCase):
    def exercise(self,healthy,unsafe=False):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);app=root/'app';app.mkdir();data=root/'data';data.mkdir();updates=root/'updates'
            (app/'package.json').write_text('{"version":"1.1.0"}');(app/'old.txt').write_text('original');(data/'screens.json').write_text('preserved')
            stream=io.BytesIO()
            with tarfile.open(fileobj=stream,mode='w:gz') as tar:
                for name,text in [('package.json','{"version":"1.2.0"}'),('server.js','console.log("new")')]+([('../escape','bad')] if unsafe else []):
                    content=text.encode();item=tarfile.TarInfo(name);item.size=len(content);tar.addfile(item,io.BytesIO(content))
            archive=stream.getvalue();name='home-display-v1.2.0.tar.gz';repo='test/repo';prefix='https://api.github.com/repos/'+repo+'/'
            release={'tag_name':'v1.2.0','assets':[{'name':name,'url':prefix+'releases/assets/1'},{'name':'SHA256SUMS','url':prefix+'releases/assets/2'}]}
            def download(url,target=None,**kwargs):
                content=json.dumps(release).encode() if url.endswith('latest') else archive if url.endswith('/1') else (hashlib.sha256(archive).hexdigest()+'  '+name+'\n').encode()
                if target:target.write_bytes(content)
                return content
            commands=[]
            with patch.object(updater,'APP',app),patch.object(updater,'DATA',data),patch.object(updater,'UPDATES',updates),patch.object(updater,'REPO',repo),patch.object(updater.os,'geteuid',return_value=0,create=True),patch.object(updater,'download',side_effect=download),patch.object(updater,'status'),patch.object(updater,'healthy',return_value=healthy),patch.object(updater,'run',side_effect=lambda *args:commands.append(args)),patch.object(updater.subprocess,'run'):
                if healthy and not unsafe:updater.main();self.assertEqual(json.loads((app/'package.json').read_text())['version'],'1.2.0');self.assertTrue(any(updates.glob('app-v1.1.0-*')))
                else:
                    with self.assertRaises(ValueError):updater.main()
                    self.assertEqual((app/'old.txt').read_text(),'original')
                self.assertEqual((data/'screens.json').read_text(),'preserved');self.assertFalse((root/'escape').exists())
            if not healthy and not unsafe:self.assertGreaterEqual(commands.count(('systemctl','start','home-display')),2)
    def test_success(self):self.exercise(True)
    def test_failed_health_check_restores_app(self):self.exercise(False)
    def test_unsafe_archive_preserves_app(self):self.exercise(True,True)
unittest.main()

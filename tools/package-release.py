"""Package only distributable application files, excluding runtime and signing data."""
import hashlib,json,tarfile
from pathlib import Path
root=Path(__file__).resolve().parents[1]
version=json.loads((root/'package.json').read_text())['version']
dist=root/'dist';dist.mkdir(exist_ok=True)
target=dist/f'home-display-v{version}.tar.gz'
files=set()
for pattern in ('*.html','*.css','*.js','studio-*.ttf','app-icon*.png','app-icon.svg'):
    files.update(root.glob(pattern))
for name in ('package.json','package-lock.json','config.example.json','manifest.webmanifest','install.sh','studio-font-license.txt','README.md','INSTALL.md','PLUGINS.md','RELEASING.md','CHANGELOG.md'):
    files.add(root/name)
for directory in ('pi','tests','plugin-examples','tools'):
    files.update(path for path in (root/directory).rglob('*') if path.is_file() and '__pycache__' not in path.parts and path.suffix not in ('.log','.png'))
with tarfile.open(target,'w:gz') as tar:
    for file in sorted(files):tar.add(file,arcname=file.relative_to(root),recursive=False)
files.update(path for path in (root/'docs').rglob('*') if path.is_file() and path.suffix not in ('.log',))
forbidden={'config.json','github-token.json','plugins.json','screens.json','plugin-definitions.json'}
with tarfile.open(target) as tar:
    assert not any(Path(item.name).name in forbidden or any(part in {'.local','.git','content','node_modules'} for part in Path(item.name).parts) for item in tar.getmembers())
print(f'Packaged {target.name}; runtime settings, credentials and signing keys excluded.')

"""Upload this project's signing credentials to its private GitHub Actions secrets."""
import base64,json,subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[1];config=json.loads((root/'.local/tv-signing.json').read_text())
for name,value in [('ANDROID_TV_KEYSTORE',base64.b64encode(Path(config['keystore']).read_bytes()).decode()),('ANDROID_TV_STORE_PASSWORD',config['password'])]:
    subprocess.run(['gh','secret','set',name,'--repo','lunnysteve/home-display'],input=value,text=True,check=True,stdout=subprocess.DEVNULL)
print('Configured Android TV signing secrets for GitHub Actions.')

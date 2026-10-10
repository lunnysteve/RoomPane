"""Create a project signing key locally. Its private files must stay out of Git."""
import json, os, secrets, subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[1];private=root/'.local';private.mkdir(exist_ok=True)
config=private/'tv-signing.json';key=private/'tv-keystore.jks'
if not config.exists():
    password=secrets.token_urlsafe(32)
    subprocess.run(['keytool','-genkeypair','-keystore',str(key),'-storepass:env','HD_TV_STORE_PASSWORD','-keypass:env','HD_TV_STORE_PASSWORD','-alias','home-display','-keyalg','RSA','-keysize','3072','-validity','10000','-dname','CN=Home Display TV'],env={**os.environ,'HD_TV_STORE_PASSWORD':password},check=True,stdout=subprocess.DEVNULL)
    config.write_text(json.dumps({'password':password,'keystore':str(key.resolve())}));config.chmod(0o600)
print('TV signing key is ready in the ignored .local directory.')

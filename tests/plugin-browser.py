"""Exercise reusable plugin installation and all example designer blocks with real HTTP sources."""
import json,os,socket,subprocess,tempfile,time,shutil,threading
from pathlib import Path
from datetime import datetime,timedelta,timezone
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from urllib.request import urlopen,Request
from playwright.sync_api import sync_playwright

root=Path(__file__).resolve().parents[1]
tomorrow=(datetime.now(timezone.utc)+timedelta(days=1)).replace(hour=10,minute=0,second=0,microsecond=0)
ics='\r\n'.join(['BEGIN:VCALENDAR','VERSION:2.0','BEGIN:VEVENT','UID:browser-family','DTSTART:'+tomorrow.strftime('%Y%m%dT%H%M%SZ'),'DTEND:'+(tomorrow+timedelta(hours=1)).strftime('%Y%m%dT%H%M%SZ'),'SUMMARY:Family outing','END:VEVENT','END:VCALENDAR'])
class Source(BaseHTTPRequestHandler):
    online=True
    def log_message(self,*args):pass
    def do_GET(self):
        if not Source.online:
            self.send_response(503);self.end_headers();return
        if self.path.startswith('/calendar.ics'):
            self.send_response(200);self.send_header('Content-Type','text/calendar');self.end_headers();self.wfile.write(ics.encode());return
        if self.path.startswith('/api/') and self.headers.get('Authorization')!='Bearer private-ha-token':
            self.send_response(401);self.end_headers();return
        if self.path=='/server/info':data={'result':{'klippy_connected':True,'klippy_state':'ready'}}
        elif self.path.startswith('/printer/objects/query'):data={'result':{'status':{'print_stats':{'state':'printing','filename':'cube.gcode'},'virtual_sdcard':{'progress':.5},'extruder':{'temperature':210},'heater_bed':{'temperature':60}}}}
        elif self.path=='/api/':data={'message':'API running.'}
        elif self.path.startswith('/api/states/'):data={'state':'22','attributes':{'friendly_name':'Room temperature','unit_of_measurement':'°C'}}
        elif self.path=='/power':data={'watts':123}
        else:self.send_response(404);self.end_headers();return
        self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(json.dumps(data).encode())
source=ThreadingHTTPServer(('127.0.0.1',0),Source);threading.Thread(target=source.serve_forever,daemon=True).start();source_url='http://127.0.0.1:'+str(source.server_port)
with tempfile.TemporaryDirectory(prefix='plugin-browser-') as data:
    with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    env={**os.environ,'HOST':'127.0.0.1','PORT':str(port),'HOME_DISPLAY_DATA_DIR':data};env.pop('HOME_DISPLAY_ADMIN_PASSWORD_HASH',None)
    process=subprocess.Popen([shutil.which('node'),'server.js'],cwd=root,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
    base='http://127.0.0.1:'+str(port)
    def api(path,payload=None):
        return json.loads(urlopen(Request(base+path,data=json.dumps(payload).encode() if payload is not None else None,headers={'Content-Type':'application/json'})).read())
    try:
        for _ in range(100):
            try:api('/api/health');break
            except OSError:time.sleep(.1)
        api('/api/plugins',{'type':'mainsail','name':'Workshop printer','sourceUrl':source_url,'time':30,'enabled':True,'onlyConnected':True})
        photo=Path(data)/'family-photo.png';shutil.copy(root/'app-icon-192.png',photo)
        second_photo=Path(data)/'family-photo-two.png';shutil.copy(root/'app-icon-512.png',second_photo)
        renderer=Path(data)/'power.html';renderer.write_text('<!doctype html><html><body><h1>Power example</h1><div id="reading"></div><script src="/plugin-sdk.js"></script><script>HomeDisplayPlugin.watch(p=>document.getElementById("reading").textContent=p.connected?p.data.watts+" W":p.message)</script></body></html>')
        manifest=Path(data)/'power.json';manifest.write_text(json.dumps({'schemaVersion':1,'id':'community.power','name':'Power meter','version':'1.0.0','adapter':'json','auth':'none','sourceRequired':True,'healthPath':'/power','pageFile':'power.html','fields':[]}))
        with sync_playwright() as pw:
            browser=pw.chromium.launch();page=browser.new_page(viewport={'width':1440,'height':1100});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
            page.goto(base+'/admin');page.wait_for_function("document.querySelector('#status').textContent.startsWith('Ready')")
            page.locator('#make-editable').click()
            page.get_by_role('button',name='+ Home Assistant',exact=True).click();page.locator('#plugin-name').fill('Home sensors');page.locator('#plugin-source').fill(source_url);page.locator('#plugin-key').fill('private-ha-token');page.locator('#plugin-option-entityIds').fill('sensor.room');page.locator('#plugin-test').click();page.wait_for_function("document.querySelector('#plugin-result').textContent.startsWith('Connected:')");page.locator('#plugin-save').click();page.wait_for_function("document.querySelector('main').dataset.section==='pages'");page.locator('#stage iframe').wait_for();page.get_by_role('button',name='Plugins',exact=True).click()
            page.locator('#new-plugin').click();page.locator('#plugin-type').select_option('photos');page.locator('#plugin-name').fill('Family photos');page.locator('#plugin-photo-upload').set_input_files([str(photo),str(second_photo)]);page.wait_for_function("document.querySelector('#plugin-photo-status').textContent.startsWith('Photos uploaded')");page.locator('#plugin-save').click();page.wait_for_function("document.querySelector('#plugin-result').textContent.startsWith('Plugin saved')")
            page.locator('#new-plugin').click();page.locator('#plugin-type').select_option('calendar');page.locator('#plugin-name').fill('Family calendar');page.locator('#plugin-feed-url').fill(source_url+'/calendar.ics?secret=private-calendar');page.locator('#plugin-test').click();page.wait_for_function("document.querySelector('#plugin-result').textContent.startsWith('Connected:')");page.locator('#plugin-save').click();page.wait_for_function("document.querySelector('#plugin-result').textContent.startsWith('Plugin saved')")
            page.get_by_text('Install a community plugin',exact=True).click();page.locator('#definition-html').set_input_files(str(renderer));page.wait_for_function("document.querySelector('#definition-status').textContent.startsWith('Renderer uploaded')");page.locator('#definition-json').set_input_files(str(manifest));page.locator('#definition-install').click();page.wait_for_function("document.querySelector('#definition-status').textContent.startsWith('Definition installed')")
            page.locator('#new-plugin').click();page.locator('#plugin-type').select_option('community.power');page.locator('#plugin-name').fill('Energy usage');page.locator('#plugin-source').fill(source_url);page.locator('#plugin-save').click();page.wait_for_function("document.querySelector('#plugin-result').textContent.startsWith('Plugin saved')")
            public=api('/api/plugins');assert 'private-ha-token' not in json.dumps(public);assert 'private-calendar' not in json.dumps(public)
            page.get_by_role('button',name='Pages & designer',exact=True).click();page.locator('#new').click()
            for label in ['+ Klipper / Moonraker','+ Home Assistant','+ Photos','+ Calendar','+ Power meter']:
                page.get_by_role('button',name=label,exact=True).click()
                page.locator('#x').fill('0');page.locator('#x').dispatch_event('change');page.locator('#y').fill('0');page.locator('#y').dispatch_event('change')
            page.locator('#save').click();page.wait_for_function("document.querySelector('#status').textContent.startsWith('Saved')")
            config=api('/api/config');designed=next(p for p in config['pages'] if p['name']=='My page');blocks=[b for b in designed['design']['blocks'] if b['type']=='plugin'];assert len(blocks)==5
            page.goto(base+'/'+designed['url']);page.wait_for_function('document.querySelectorAll("iframe").length===5')
            frames=page.locator('iframe');frames.nth(0).content_frame.get_by_text('50%',exact=True).wait_for();frames.nth(1).content_frame.get_by_text('Room temperature',exact=True).wait_for();frames.nth(2).content_frame.locator('#photo').wait_for();frames.nth(3).content_frame.get_by_text('Family outing',exact=True).wait_for();frames.nth(4).content_frame.get_by_text('123 W',exact=True).wait_for()
            Source.online=False
            frames.nth(1).content_frame.locator('#title').wait_for(state='hidden')
            assert frames.nth(2).content_frame.locator('#photo').is_visible()
            Source.online=True
            frames.nth(1).content_frame.get_by_text('Room temperature',exact=True).wait_for()
            for plugin in public['plugins']:
                view=api('/api/plugin-view/'+plugin['id']);page.goto(base+'/'+view['url'])
                if view['adapter']=='moonraker':page.locator('#progress').get_by_text('50%',exact=True).wait_for()
                elif view['adapter']=='homeassistant':page.get_by_text('Room temperature',exact=True).wait_for()
                elif view['adapter']=='photos':
                    page.locator('#photo').wait_for();previous_photo=page.locator('#photo').get_attribute('src');page.reload();page.locator('#photo').wait_for();assert page.locator('#photo').get_attribute('src')!=previous_photo
                elif view['adapter']=='calendar':page.get_by_text('Family outing',exact=True).wait_for()
                else:page.get_by_text('123 W',exact=True).wait_for()
            assert not errors,errors;browser.close();print('PASS: HA authentication, local photos, private calendar feed, community manifest installation, five designer blocks and full pages')
    finally:process.terminate();process.wait(timeout=10);source.shutdown()

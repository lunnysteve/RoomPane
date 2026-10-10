"""Browser integration check for design, drag, save, reload and live rendering."""
import json
import base64
import io
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import time
import urllib.request
from playwright.sync_api import sync_playwright
from PIL import Image

root = Path(__file__).resolve().parents[1]
printer_state = {'connected':True}
class PrinterSource(BaseHTTPRequestHandler):
    def log_message(self, *args): pass
    def do_GET(self):
        if self.headers.get('X-Api-Key') != 'test-key-123':
            self.send_response(401); self.end_headers(); return
        if self.path == '/server/info':
            data = {'result':{'klippy_connected':printer_state['connected'],'klippy_state':'ready' if printer_state['connected'] else 'disconnected'}}
        elif self.path.startswith('/printer/objects/query'):
            data = {'result':{'status':{'print_stats':{'state':'printing','filename':'benchy.gcode','print_duration':3600},'virtual_sdcard':{'progress':.42},'extruder':{'temperature':210,'target':215},'heater_bed':{'temperature':60,'target':60}}}}
        else:
            self.send_response(404); self.end_headers(); return
        payload = json.dumps(data).encode()
        self.send_response(200); self.send_header('Content-Type','application/json'); self.send_header('Content-Length',str(len(payload))); self.end_headers(); self.wfile.write(payload)
printer_server = ThreadingHTTPServer(('127.0.0.1',0), PrinterSource)
threading.Thread(target=printer_server.serve_forever,daemon=True).start()
with tempfile.TemporaryDirectory(prefix='display-browser-') as data:
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    base = f'http://127.0.0.1:{port}'
    env = {**os.environ, 'PORT': str(port), 'HOST': '127.0.0.1', 'HOME_DISPLAY_DATA_DIR': data}
    env.pop('HOME_DISPLAY_ADMIN_PASSWORD_HASH', None)
    server = subprocess.Popen([shutil.which('node'), str(root / 'server.js')], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    try:
        for attempt in range(100):
            try:
                urllib.request.urlopen(base + '/api/health')
                break
            except OSError:
                time.sleep(.1)
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={'width': 1440, 'height': 1100})
            errors = []
            page.on('pageerror', lambda err: errors.append(str(err)))
            page.goto(base + '/admin')
            page.wait_for_function("document.getElementById('status').textContent.startsWith('Ready')")
            page.locator('#open-html').click()
            page.wait_for_function("document.getElementById('html-source').value.includes('<html')")
            assert page.locator('#html-file').input_value() == 'display.html'
            page.locator('#html-source').fill('<!doctype html><html><body><h1>HTML edited in Studio</h1></body></html>')
            page.locator('#html-preview').click()
            page.frame_locator('#html-frame').get_by_text('HTML edited in Studio').wait_for()
            assert 'HTML edited in Studio' not in urllib.request.urlopen(base + '/display.html').read().decode()
            page.locator('#html-save').click()
            page.wait_for_function("document.getElementById('html-status').textContent.startsWith('Saved')")
            assert 'HTML edited in Studio' in urllib.request.urlopen(base + '/display.html').read().decode()
            page.reload()
            page.wait_for_function("document.getElementById('status').textContent.startsWith('Ready')")
            page.locator('#open-html').click()
            page.wait_for_function("document.getElementById('html-source').value.includes('HTML edited in Studio')")
            page.locator('#open-html').click()
            # The initial legacy page must have an obvious route into editing.
            page.locator('#make-editable').click()
            assert page.locator('.block').count() == 2
            page.locator('.block').first.click()
            assert page.locator('#prop').is_visible()
            page.locator('#size').fill('80')
            page.locator('#size').dispatch_event('change')
            page.locator('#save').click()
            page.wait_for_function("document.getElementById('status').textContent.startsWith('Saved')")
            initial = json.load(urllib.request.urlopen(base + '/api/config'))['pages'][0]
            assert initial['originalUrl'] == 'display.html'
            assert initial['design']['blocks'][0]['size'] == 80
            page.locator('#new').click()
            page.locator('#name').fill('Kitchen screen')
            page.locator('[data-add=text]').click()
            page.locator('#content').fill('Welcome home')
            page.locator('#x').fill('400')
            page.locator('#x').dispatch_event('change')
            page.locator('#theme').select_option('forest')
            page.locator('.block.selected').scroll_into_view_if_needed()
            box = page.locator('.block.selected').bounding_box()
            page.mouse.move(box['x'] + 30, box['y'] + 30)
            page.mouse.down()
            page.mouse.move(box['x'] + 55, box['y'] + 55, steps=5)
            page.mouse.up()
            page.locator('#block-font').select_option('serif')
            page.locator('#block-weight').select_option('700')
            page.locator('#colour').fill('#ccddff')
            page.locator('#colour').dispatch_event('input')
            page.locator('#block-fill').check()
            page.locator('#block-background').fill('#24354a')
            page.locator('#block-background').dispatch_event('input')
            page.locator('[data-add=icon][data-motion=pulse]').click()
            page.locator('#icon-choice').select_option('home')
            page.locator('#block-animation').select_option('spin')
            page.locator('#block-speed').fill('8')
            page.locator('#block-speed').dispatch_event('change')
            page.locator('#y').fill('290')
            page.locator('#y').dispatch_event('change')
            gif = io.BytesIO()
            Image.new('RGB', (24, 24), 'red').save(gif, format='GIF', save_all=True, append_images=[Image.new('RGB', (24, 24), 'blue')], duration=150, loop=0)
            page.locator('#upload').set_input_files({'name':'own-animation.gif','mimeType':'image/gif','buffer':gif.getvalue()})
            page.wait_for_function("document.getElementById('upload-info').textContent.startsWith('Uploaded:')")
            # Create a real short WebM clip in the browser, then import it.
            encoded = page.evaluate('''async () => {
                const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
                const context = canvas.getContext('2d'); context.fillStyle = 'green'; context.fillRect(0, 0, 32, 32);
                const stream = canvas.captureStream(10), chunks = [];
                const recorder = new MediaRecorder(stream, {mimeType:'video/webm'});
                return await new Promise(resolve => {
                    recorder.ondataavailable = event => chunks.push(event.data);
                    recorder.onstop = async () => {const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer()); stream.getTracks().forEach(track => track.stop()); resolve(btoa(String.fromCharCode(...bytes)));};
                    recorder.start(); setTimeout(() => recorder.stop(), 400);
                });
            }''')
            page.locator('.block').nth(2).click()
            page.locator('#upload').set_input_files({'name':'own-video.webm','mimeType':'video/webm','buffer':base64.b64decode(encoded)})
            page.wait_for_function("document.getElementById('media-library').value.endsWith('.webm')")
            page.locator('#save').click()
            page.wait_for_function("document.getElementById('status').textContent.startsWith('Saved')")
            config = json.load(urllib.request.urlopen(base + '/api/config'))
            designed = config['pages'][-1]
            assert designed['name'] == 'Kitchen screen'
            assert designed['design']['bg'] == '#102820'
            assert designed['design']['blocks'][1]['x'] > 400
            assert designed['design']['blocks'][1]['font'] == 'serif'
            assert designed['design']['blocks'][1]['background'] == '#24354a'
            assert designed['design']['blocks'][2]['type'] == 'icon'
            assert designed['design']['blocks'][2]['animation'] == 'spin'
            assert designed['design']['blocks'][3]['content'].endswith('.gif')
            assert designed['design']['blocks'][4]['type'] == 'video'
            page.reload()
            page.get_by_role('button', name='● Kitchen screen', exact=True).click()
            assert page.locator('#name').input_value() == 'Kitchen screen'
            page.screenshot(path=str(root / 'tests' / 'designer-preview.png'), full_page=True)
            page.goto(base + '/' + designed['url'])
            page.get_by_text('Welcome home', exact=True).wait_for()
            assert page.locator('.widget').count() == 5
            assert 'Studio Serif' in page.locator('.widget').nth(1).evaluate('(el) => getComputedStyle(el).fontFamily')
            assert page.locator('.widget').nth(1).evaluate('(el) => getComputedStyle(el).backgroundColor') == 'rgb(36, 53, 74)'
            assert page.locator('.widget').nth(2).locator('svg').get_attribute('aria-label') == 'Home'
            assert page.locator('.motion-spin').evaluate('(el) => getComputedStyle(el).animationName') == 'design-spin'
            assert page.locator('img').get_attribute('src').endswith('.gif')
            page.wait_for_function('document.querySelector("video").readyState >= 2')
            assert page.locator('video').evaluate('(el) => el.muted && el.loop && el.autoplay')
            page.emulate_media(reduced_motion='reduce')
            assert page.locator('.motion-spin').evaluate('(el) => getComputedStyle(el).animationName') == 'none'
            page.goto(base + '/admin')
            page.wait_for_function("document.getElementById('status').textContent.startsWith('Ready')")
            page.get_by_role('button', name='● Kitchen screen', exact=True).click()
            page.locator('#close-designer').click()
            assert page.locator('#designer').is_hidden()
            page.locator('#close-designer').click()
            assert page.locator('#designer').is_visible()
            page.locator('#name').fill('Cancelled name')
            page.on('dialog',lambda dialog:dialog.accept())
            page.locator('#cancel-designer').click()
            assert page.locator('#name').input_value() == 'Kitchen screen'
            page.locator('#close-designer').click()
            page.locator('#block-layer').select_option(designed['design']['blocks'][0]['id'])
            page.locator('#font-upload').set_input_files(str(root / 'studio-serif.ttf'))
            page.wait_for_function("document.getElementById('font-status').textContent.startsWith('Installed')")
            uploaded_font = page.locator('#block-font').input_value()
            assert uploaded_font.startswith('uploaded:')
            page.locator('#save').click()
            page.wait_for_function("document.getElementById('status').textContent.startsWith('Saved')")
            page.goto(base + '/' + designed['url'])
            page.wait_for_function("document.querySelector('.widget') && getComputedStyle(document.querySelector('.widget')).fontFamily.includes('Custom font-')")
            page.goto(base + '/admin')
            page.wait_for_function("document.getElementById('status').textContent.startsWith('Ready')")
            page.get_by_role('button', name='Plugins', exact=True).click()
            page.locator('#new-plugin').click()
            page.locator('#plugin-type').select_option('mainsail')
            page.locator('#plugin-name').fill('Workshop printer')
            page.locator('#plugin-source').fill('127.0.0.1:' + str(printer_server.server_port))
            page.locator('#plugin-key').fill('test-key-123')
            page.locator('#plugin-test').click()
            page.wait_for_function("document.getElementById('plugin-result').textContent.startsWith('Connected:')")
            page.locator('#plugin-save').click()
            page.wait_for_function("document.getElementById('plugin-result').textContent.startsWith('Plugin saved')")
            plugin_items=json.load(urllib.request.urlopen(base + '/api/plugins'))['plugins']
            plugin_id=plugin_items[0]['id']
            assert 'test-key-123' not in json.dumps(plugin_items)
            assert 'test-key-123' not in urllib.request.urlopen(base + '/api/plugin-status').read().decode()
            page.goto(base + '/plugin-mainsail.html?id=' + plugin_id)
            page.get_by_text('42%',exact=True).wait_for()
            assert page.locator('#filename').inner_text() == 'benchy.gcode'
            page.goto(base + '/')
            page.locator('#iframe_' + plugin_id).wait_for(state='attached')
            printer_state['connected']=False
            time.sleep(6.2)
            page.evaluate('loadPluginStatus()')
            page.wait_for_function('(id) => !document.getElementById("iframe_" + id)',arg=plugin_id)
            printer_state['connected']=True
            time.sleep(6.2)
            page.evaluate('loadPluginStatus()')
            page.locator('#iframe_' + plugin_id).wait_for(state='attached')
            # A user-created single HTML plugin gets the same source data API.
            page.goto(base + '/admin')
            page.wait_for_function("document.getElementById('status').textContent.startsWith('Ready')")
            page.get_by_role('button', name='Plugins', exact=True).click()
            page.locator('#new-plugin').click()
            page.locator('#plugin-type').select_option('custom')
            page.locator('#plugin-name').fill('Custom home page')
            page.locator('#plugin-source').fill('http://127.0.0.1:' + str(printer_server.server_port))
            page.locator('#plugin-key').fill('test-key-123')
            page.locator('#plugin-health').fill('/server/info')
            page.locator('#plugin-html').set_input_files(str(root / 'plugin-example.html'))
            page.wait_for_function("document.getElementById('plugin-file').textContent.startsWith('Uploaded')")
            page.locator('#plugin-test').click()
            page.wait_for_function("document.getElementById('plugin-result').textContent.startsWith('Connected:')")
            page.locator('#plugin-save').click()
            page.wait_for_function("document.getElementById('plugin-result').textContent.startsWith('Plugin saved')")
            custom_status=json.load(urllib.request.urlopen(base + '/api/plugin-status'))
            custom=next(item for item in custom_status['statuses'] if item['name']=='Custom home page')
            assert custom['connected'] and custom['data']['result']['klippy_connected']
            custom_page=next(item for item in custom_status['pages'] if item['id']==custom['id'])
            page.goto(base + '/' + custom_page['url'])
            page.get_by_text('Custom home page',exact=True).wait_for()
            page.wait_for_function("document.getElementById('data').textContent.includes('klippy_connected')")
            page.goto(base + '/admin')
            page.wait_for_function("document.getElementById('status').textContent.startsWith('Ready')")
            page.get_by_role('button', name='Screens', exact=True).click()
            page.locator('#new-screen').click()
            page.locator('#screen-name').fill('Living room')
            page.locator('#screen-all').uncheck()
            for checkbox in page.locator('#screen-pages input').all():
                checkbox.uncheck()
            page.locator('#screen-pages input').first.check()
            page.locator('#save-screen').click()
            page.locator('a[href="/screen/living-room"]').wait_for()
            page.goto(base + '/screen/living-room')
            page.wait_for_function('document.querySelectorAll("#viewportContainer iframe").length===1')
            assert page.locator('#viewportContainer iframe').count()==1
            screen_frame = page.locator('#viewportContainer iframe')
            assert screen_frame.evaluate('(frame) => new URL(frame.src).pathname').startswith('/screen/') is False
            screen_frame.content_frame.locator('body').wait_for()
            assert screen_frame.content_frame.locator('body').inner_text().strip()
            assert not errors, errors
            print('PASS: editor close/cancel, installed fonts, media, Mainsail source/auth, printer display and offline/reconnect rotation')
            browser.close()
    finally:
        server.terminate()
        server.wait(timeout=10)
        printer_server.shutdown()

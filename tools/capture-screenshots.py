import os,json,socket,subprocess,tempfile,time,urllib.request,shutil
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
output=root/'docs/images';output.mkdir(parents=True,exist_ok=True)
with tempfile.TemporaryDirectory() as data:
    config=json.loads((root/'config.example.json').read_text())
    def block(id,type,x,y,w,h,size,content='',colour='#f1f5fb'):
        return dict(id=id,type=type,x=x,y=y,w=w,h=h,size=size,content=content,colour=colour)
    blocks=[block('welcome','text',38,32,650,50,24,'MONDAY AT HOME','#87bfff'),block('clock','clock',30,105,470,155,112),block('greeting','text',38,270,450,50,25,'A little space for your everyday.'),block('weather','weather',520,110,245,200,40),block('note','text',38,400,710,45,21,'YOUR HOME. YOUR SCREENS. YOUR WAY.','#87bfff')]
    config['pages']=[dict(id='home',name='Home overview',url='design-display.html?id=home',time=30,active=True,design=dict(theme='midnight',bg='#0b1324',fg='#f1f5fb',accent='#70b7ff',blocks=blocks)),dict(id='clock',name='Evening clock',url='time.html',time=30,active=True),dict(id='weather',name='Weather forecast',url='weather.html',time=30,active=True)]
    Path(data,'config.json').write_text(json.dumps(config))
    Path(data,'screens.json').write_text(json.dumps([dict(id='kitchen',name='Kitchen display',pageIds=None),dict(id='living-room',name='Living room TV',pageIds=['home','weather'])]))
    with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    env={**os.environ,'HOST':'127.0.0.1','PORT':str(port),'HOME_DISPLAY_DATA_DIR':data};env.pop('HOME_DISPLAY_ADMIN_PASSWORD_HASH',None)
    process=subprocess.Popen([shutil.which('node'),'server.js'],cwd=root,env=env,stdout=subprocess.DEVNULL)
    try:
        base=f'http://127.0.0.1:{port}'
        for _ in range(100):
            try:urllib.request.urlopen(base+'/api/health');break
            except OSError:time.sleep(.1)
        with sync_playwright() as pw:
            browser=pw.chromium.launch();page=browser.new_page(viewport={'width':1440,'height':1000},device_scale_factor=1)
            errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
            # Repeatable preview data; the real renderer and editor remain in use.
            page.route('**/api.open-meteo.com/**',lambda route:route.fulfill(json={'current':{'temperature_2m':18,'relative_humidity_2m':56,'weather_code':2,'wind_speed_10m':9},'daily':{'time':['2026-10-12'],'temperature_2m_max':[20],'temperature_2m_min':[12],'weather_code':[2]}}))
            page.goto(base+'/admin');page.wait_for_function("document.getElementById('status').textContent.startsWith('Ready')")
            page.wait_for_timeout(700);page.screenshot(path=str(output/'studio-designer.png'),full_page=True)
            page.get_by_role('button',name='Screens',exact=True).click();page.get_by_text('Kitchen display',exact=True).wait_for();page.screenshot(path=str(output/'studio-screens.png'),full_page=True)
            page.get_by_role('button',name='Plugins',exact=True).click();page.locator('#new-plugin').click();page.locator('#plugin-name').fill('Workshop printer');page.locator('#plugin-source').fill('http://printer.local:7125');page.screenshot(path=str(output/'studio-plugins.png'),full_page=True)
            page.get_by_role('button',name='Weather & schedule',exact=True).click();assert page.locator('#lat').is_visible() if page.locator('#lat').count() else page.locator('#latitude').is_visible()
            page.get_by_role('button',name='Updates',exact=True).click();assert page.locator('#check-updates').is_visible();assert not page.locator('#github-token').is_visible()
            page.set_viewport_size({'width':390,'height':844});page.get_by_role('button',name='Screens',exact=True).click();page.wait_for_timeout(200);assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            page.goto(base+'/design-display.html?id=home');page.set_viewport_size({'width':1200,'height':720});page.wait_for_timeout(1200);page.screenshot(path=str(output/'display-preview.png'))
            assert not errors,errors
            browser.close();print('Screenshots captured; navigation, mobile width and optional token controls verified.')
    finally:process.terminate();process.wait()

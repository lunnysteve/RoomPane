"""Regenerate docs/images with temporary example data; saved dashboard settings are left untouched."""
import os,json,socket,subprocess,tempfile,time,urllib.request,shutil,datetime
from pathlib import Path
from PIL import Image,ImageDraw
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
output=root/'docs/images';output.mkdir(parents=True,exist_ok=True)
MORNING=datetime.datetime(2026,10,12,10,42);EVENING=datetime.datetime(2026,10,12,21,15)
def weather(day):
    sunrise=int(datetime.datetime(2026,10,12,7,10).timestamp());sunset=int(datetime.datetime(2026,10,12,18,20).timestamp())
    return {'current':{'temperature_2m':17.6,'apparent_temperature':16.4,'relative_humidity_2m':62,'dew_point_2m':10.2,'wind_speed_10m':12,'pressure_msl':1018,'weather_code':2,'is_day':int(day)},
            'daily':{'time':['2026-10-12','2026-10-13'],'weather_code':[2,61],'temperature_2m_max':[19,16],'temperature_2m_min':[11,9],'precipitation_probability_max':[10,70],'sunrise':[sunrise,sunrise+86400],'sunset':[sunset,sunset+86400]}}
def block(id,type,x,y,w,h,size,content='',colour='#f1f5fb',**style):
    return dict(id=id,type=type,x=x,y=y,w=w,h=h,size=size,content=content,colour=colour,**style)
def gallery(shots,target,columns=3,gap=18,scale=.75):
    w,h=int(800*scale),int(480*scale);rows=-(-len(shots)//columns)
    sheet=Image.new('RGB',(columns*w+(columns+1)*gap,rows*h+(rows+1)*gap),'#070b14')
    mask=Image.new('L',(w,h),0);ImageDraw.Draw(mask).rounded_rectangle((0,0,w-1,h-1),radius=14,fill=255)
    for i,shot in enumerate(shots):
        sheet.paste(Image.open(shot).convert('RGB').resize((w,h),Image.LANCZOS),(gap+(i%columns)*(w+gap),gap+(i//columns)*(h+gap)),mask)
    sheet.save(target,optimize=True)
with tempfile.TemporaryDirectory() as data:
    config=json.loads((root/'config.example.json').read_text());config['settings']['locationName']='London'
    blocks=[block('icon','icon',40,34,56,56,44,'home','#70b7ff',animation='float'),
            block('welcome','text',104,38,420,50,24,'GOOD MORNING','#70b7ff',align='left',weight='700'),
            block('clock','clock',30,100,470,170,120,font='heavy'),
            block('weather','weather',520,100,250,170,30),
            block('note','text',40,300,720,60,28,'Bins out tonight · Recycling week',font='serif'),
            block('footer','text',40,400,720,44,18,'HOME DISPLAY · KITCHEN','#70b7ff',weight='600')]
    config['pages']=[dict(id='home',name='Kitchen morning',url='design-display.html?id=home',time=30,active=True,design=dict(theme='midnight',bg='#0b1324',fg='#f1f5fb',accent='#70b7ff',blocks=blocks)),
                     dict(id='overview',name='Time, weather & humidity',url='display.html',time=30,active=True),
                     dict(id='weather',name='Weather',url='weather.html',time=30,active=True),
                     dict(id='sky',name='Sky tonight',url='sky.html',time=30,active=True)]
    Path(data,'config.json').write_text(json.dumps(config))
    Path(data,'screens.json').write_text(json.dumps([dict(id='kitchen',name='Kitchen display',pageIds=None),dict(id='living-room',name='Living room TV',pageIds=['home','weather'])]))
    with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    env={**os.environ,'HOST':'127.0.0.1','PORT':str(port),'HOME_DISPLAY_DATA_DIR':data};env.pop('HOME_DISPLAY_ADMIN_PASSWORD_HASH',None)
    process=subprocess.Popen([shutil.which('node'),'server.js'],cwd=root,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    try:
        base=f'http://127.0.0.1:{port}'
        for _ in range(100):
            try:urllib.request.urlopen(base+'/api/health');break
            except OSError:time.sleep(.1)
        with sync_playwright() as pw:
            browser=pw.chromium.launch();errors=[]
            # Repeatable clock and weather; the real pages, renderer and editor remain in use.
            def open_page(viewport,at,scale=1):
                page=browser.new_page(viewport=viewport,device_scale_factor=scale);page.on('pageerror',lambda e:errors.append(str(e)))
                page.clock.install(time=at);page.route('**/api.open-meteo.com/**',lambda route:route.fulfill(json=weather(at.hour<18)));return page
            with tempfile.TemporaryDirectory() as shots:
                captured=[]
                for name,at in [('design-display.html?id=home',MORNING),('display.html',MORNING),('weather.html',MORNING),('time.html',MORNING),('humidity.html',MORNING),('sky.html',EVENING)]:
                    page=open_page({'width':800,'height':480},at,2);page.goto(base+'/'+name);page.wait_for_timeout(1500)
                    captured.append(Path(shots,f'{len(captured)}.png'));page.screenshot(path=str(captured[-1]));page.close()
                gallery(captured,output/'display-preview.png')
            page=open_page({'width':1440,'height':1000},MORNING)
            page.goto(base+'/admin');page.wait_for_function("document.getElementById('status').textContent.startsWith('Ready')")
            page.wait_for_timeout(700);page.screenshot(path=str(output/'studio-designer.png'),full_page=True)
            page.get_by_role('button',name='Screens',exact=True).click();page.get_by_text('Kitchen display',exact=True).wait_for();page.screenshot(path=str(output/'studio-screens.png'),full_page=True)
            page.get_by_role('button',name='Plugins',exact=True).click();page.locator('#new-plugin').click();page.locator('#plugin-type').select_option('mainsail');page.locator('#plugin-name').fill('Workshop printer');page.locator('#plugin-source').fill('http://printer.local:7125');page.screenshot(path=str(output/'studio-plugins.png'),full_page=True)
            page.get_by_role('button',name='Weather & schedule',exact=True).click();assert page.locator('#lat').is_visible() if page.locator('#lat').count() else page.locator('#latitude').is_visible()
            page.get_by_role('button',name='Updates',exact=True).click();assert page.locator('#check-updates').is_visible();assert not page.locator('#github-token').is_visible()
            page.set_viewport_size({'width':390,'height':844});page.get_by_role('button',name='Screens',exact=True).click();page.wait_for_timeout(200);assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            assert not errors,errors
            browser.close();print('Screenshots captured; navigation, mobile width and optional token controls verified.')
    finally:process.terminate();process.wait()

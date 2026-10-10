"""Browser check for the Studio page list, schedules, save bar, files, screens and display controls."""
import json,os,socket,subprocess,tempfile,time,shutil
from pathlib import Path
from urllib.request import urlopen
from playwright.sync_api import sync_playwright

root=Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix='studio-browser-') as data:
    with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    env={**os.environ,'HOST':'127.0.0.1','PORT':str(port),'HOME_DISPLAY_DATA_DIR':data};env.pop('HOME_DISPLAY_ADMIN_PASSWORD_HASH',None)
    process=subprocess.Popen([shutil.which('node'),'server.js'],cwd=root,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    base='http://127.0.0.1:'+str(port)
    config=lambda:json.load(urlopen(base+'/api/config'))
    try:
        for _ in range(100):
            try:urlopen(base+'/api/health');break
            except OSError:time.sleep(.1)
        with sync_playwright() as pw:
            browser=pw.chromium.launch();page=browser.new_page(viewport={'width':1280,'height':1400});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
            page.on('dialog',lambda dialog:dialog.accept())
            page.goto(base+'/admin');page.wait_for_function("document.getElementById('status').textContent.startsWith('Ready')")
            names=[p['name'] for p in config()['pages']]
            card=lambda name:page.locator('.page-card').filter(has=page.get_by_text(name,exact=True))
            assert page.locator('.page-card').count()==len(names)
            assert page.locator('#save').is_hidden()
            page.locator('#add-page').click();page.locator('#add-page-url').fill('http://');page.locator('#add-page-confirm').click()
            assert page.locator('#add-page-form').is_visible()
            assert page.locator('.page-card').count()==len(names)
            assert 'valid' in page.locator('#status').inner_text()
            page.locator('#add-page-cancel').click()
            # Add a ready-made page that was not in the default rotation.
            page.locator('#add-page').click();page.locator('#add-page-file').select_option('countdown.html');page.locator('#add-page-confirm').click()
            assert page.locator('.page-card').count()==len(names)+1
            assert page.locator('#save').is_visible()
            # Keyboard reorder: move the first page down one place.
            page.locator('.drag-handle').first.focus();page.keyboard.press('ArrowDown')
            assert page.locator('.page-open strong').nth(1).inner_text()==names[0]
            # Pointer drag: move the new last page to the top.
            handle=page.locator('.drag-handle').last.bounding_box();top=page.locator('.page-card').first.bounding_box()
            page.mouse.move(handle['x']+5,handle['y']+5);page.mouse.down();page.mouse.move(handle['x']+5,top['y']+5,steps=12);page.mouse.up()
            assert page.locator('.page-open strong').first.inner_text()=='Countdown',page.locator('.page-open strong').all_inner_texts()
            # Switch a page off from the list.
            card(names[2]).locator('.switch input').uncheck()
            # Weekday schedule from the editor.
            card('Countdown').locator('.page-open').click()
            assert page.locator('#legacy').is_visible() and page.locator('#style-panel').is_hidden()
            page.locator('#schedule-enabled').check();page.locator('#schedule-start').select_option('8');page.locator('#schedule-end').select_option('17')
            for day in ['Sun','Sat']:page.locator('#schedule-days label',has_text=day).click()
            page.locator('#back-to-pages').click()
            assert '08:00–17:59 weekdays' in card('Countdown').inner_text()
            page.locator('#save').click();page.wait_for_function("document.getElementById('status').textContent.startsWith('Saved')")
            saved=config()['pages']
            assert saved[0]['url']=='countdown.html' and saved[0]['schedule']=={'enabled':True,'startHour':8,'endHour':17,'days':[1,2,3,4,5]}
            assert saved[2]['name']==names[0]
            assert next(p for p in saved if p['name']==names[2])['active'] is False
            # Discard restores the saved state.
            page.locator('.page-card').first.locator('.switch input').uncheck();page.locator('#discard').click()
            assert page.locator('.page-card').first.locator('.switch input').is_checked()
            # Settings: weather location change goes through the same save bar; uploaded files can be deleted.
            page.get_by_role('button',name='Settings',exact=True).click()
            page.locator('#latitude').fill('40');page.locator('#save').click();page.wait_for_function("document.getElementById('status').textContent.startsWith('Saved')")
            assert config()['settings']['latitude']==40
            page.get_by_role('button',name='Pages',exact=True).click();page.locator('.page-open').first.click();page.locator('#open-html').click()
            page.wait_for_function("document.getElementById('html-source').value.includes('<html')")
            page.locator('#html-source').fill('<!doctype html><html><body>Edited countdown</body></html>');page.locator('#html-save').click()
            page.wait_for_function("document.getElementById('html-status').textContent.startsWith('Saved')")
            page.get_by_role('button',name='Settings',exact=True).click();page.locator('#file-list a',has_text='countdown.html').wait_for()
            page.locator('#file-list .file',has_text='countdown.html').get_by_role('button',name='Delete').click()
            page.wait_for_function("!document.getElementById('file-list').textContent.includes('countdown.html')")
            assert 'Edited countdown' not in urlopen(base+'/countdown.html').read().decode()
            # Screens: network address with QR code, and manual screen off/on.
            page.get_by_role('button',name='Screens',exact=True).click();page.locator('#endpoint-list a').first.wait_for()
            page.wait_for_function("document.getElementById('qr').naturalWidth>0")
            assert page.locator('#restart-browser').is_disabled()
            page.locator('#sleep-toggle').click();page.wait_for_function("document.getElementById('sleep-toggle').textContent==='Turn screen on'")
            assert config()['manualSleep'] is True
            page.locator('#sleep-toggle').click();page.wait_for_function("document.getElementById('sleep-toggle').textContent==='Turn screen off'")
            assert config()['manualSleep'] is False
            # Phone width: no horizontal overflow in any section.
            page.set_viewport_size({'width':390,'height':844})
            for section in ['Pages','Screens','Plugins','Settings','Updates']:
                page.get_by_role('button',name=section,exact=True).click();page.wait_for_timeout(150)
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),section
            page.get_by_role('button',name='Settings',exact=True).click()
            page.locator('#backup-password').fill('test-backup-password')
            with page.expect_download() as downloading: page.locator('#backup-export').click()
            backup_path=str(Path(data)/'saved.hdbackup');downloading.value.save_as(backup_path)
            page.locator('#latitude').fill('41');page.locator('#save').click()
            page.wait_for_function("document.getElementById('status').textContent.startsWith('Saved')")
            page.locator('#backup-password').fill('test-backup-password');page.locator('#backup-file').set_input_files(backup_path)
            page.locator('#backup-restore').click()
            page.wait_for_function("document.getElementById('status').textContent.startsWith('Ready')")
            assert config()['settings']['latitude']==40
            assert not errors,errors;browser.close()
            print('PASS: add page, drag and keyboard reorder, toggles, schedules, save bar and discard, files, QR address and screen controls')
    finally:process.terminate();process.wait(timeout=10)

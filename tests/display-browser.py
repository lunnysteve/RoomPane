"""Check real rotator frames, schedule boundaries and Studio sleep controls."""
import datetime
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import time
from urllib.request import Request, urlopen
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix='display-playback-') as data:
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    env = {**os.environ, 'HOST': '127.0.0.1', 'PORT': str(port), 'HOME_DISPLAY_DATA_DIR': data}
    env.pop('HOME_DISPLAY_ADMIN_PASSWORD_HASH', None)
    config = {'settings': {'timezone': 'UTC', 'sleepTime': '00:00', 'wakeTime': '00:00', 'transition': 'instant'}, 'pages': [
        {'id': 'morning', 'name': 'Morning', 'url': 'morning.html', 'active': True, 'time': 30,
         'schedule': {'enabled': True, 'days': [1], 'startHour': 8, 'endHour': 8}},
        {'id': 'day', 'name': 'Day', 'url': 'day.html', 'active': True, 'time': 30,
         'schedule': {'enabled': True, 'days': [1], 'startHour': 9, 'endHour': 17}}
    ]}
    Path(data, 'config.json').write_text(json.dumps(config), encoding='utf-8')
    Path(data, 'screens.json').write_text(json.dumps([{'id': 'living-room', 'name': 'Living room', 'pageIds': None}]), encoding='utf-8')
    content = Path(data, 'content')
    content.mkdir()
    for name in ('morning', 'day'):
        (content / (name + '.html')).write_text('<!doctype html><body>' + name + '</body>', encoding='utf-8')
    server = subprocess.Popen([shutil.which('node'), 'server.js'], cwd=root, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    base = 'http://127.0.0.1:' + str(port)
    try:
        for _ in range(100):
            try:
                urlopen(base + '/api/health').close()
                break
            except OSError:
                time.sleep(.1)
        with sync_playwright() as pw:
            browser = pw.chromium.launch()
            page = browser.new_page()
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            moment = datetime.datetime(2026, 10, 12, 8, 59, 0, tzinfo=datetime.timezone.utc)
            page.clock.install(time=moment)
            page.clock.pause_at(moment)
            fail_config = lambda route: route.fulfill(status=503, content_type='application/json', body='{}')
            page.route('**/api/config?screen=living-room', fail_config)
            page.goto(base + '/screen/living-room')
            page.get_by_text('Cannot reach Home Display.', exact=False).wait_for()
            page.unroute('**/api/config?screen=living-room', fail_config)
            page.evaluate('loadServerConfig()')
            page.frame_locator('iframe.active').get_by_text('morning', exact=True).wait_for()
            assert page.locator('#connectionAlert').is_hidden()
            page.route('**/api/config?screen=living-room', fail_config)
            page.evaluate('loadServerConfig()')
            assert page.frame_locator('iframe.active').get_by_text('morning', exact=True).is_visible()
            assert page.locator('#connectionAlert').is_hidden()
            page.unroute('**/api/config?screen=living-room', fail_config)
            assert page.locator('#sleepOverlay').evaluate('(el) => !el.classList.contains("active")')
            # Timers must notice the hour boundary even though config is unchanged.
            page.clock.run_for(61000)
            page.frame_locator('iframe.active').get_by_text('day', exact=True).wait_for()
            assert page.locator('#iframe_morning').count() == 0
            # A full-day schedule does not override manual Studio sleep.
            for sleeping in (True, False):
                request = Request(base + '/api/display/sleep', data=json.dumps({'screen':'living-room','sleep': sleeping}).encode(), headers={'Content-Type': 'application/json'})
                urlopen(request).close()
                page.evaluate('loadServerConfig()')
                assert page.locator('#sleepOverlay').evaluate('(el) => el.classList.contains("active")') == sleeping
                if sleeping:
                    page.evaluate('wakeScreen()')
                    assert page.locator('#sleepOverlay').evaluate('(el) => el.classList.contains("active")')
            # Scheduled overnight sleep still works, including waking next morning.
            config['settings'].update(sleepTime='23:00', wakeTime='07:00')
            Path(data, 'config.json').write_text(json.dumps(config), encoding='utf-8')
            page.evaluate('loadServerConfig()')
            page.clock.set_system_time(datetime.datetime(2026, 10, 12, 23, 1, tzinfo=datetime.timezone.utc))
            page.evaluate('checkSleepCycle()')
            assert page.locator('#sleepOverlay').evaluate('(el) => el.classList.contains("active")')
            page.clock.set_system_time(datetime.datetime(2026, 10, 13, 7, 1, tzinfo=datetime.timezone.utc))
            page.evaluate('checkSleepCycle()')
            assert page.locator('#sleepOverlay').evaluate('(el) => !el.classList.contains("active")')
            # Turning off the default display must not affect a named screen.
            urlopen(Request(base + '/api/display/sleep', data=b'{"sleep":true}', headers={'Content-Type':'application/json'})).close()
            page.evaluate('loadServerConfig()')
            assert not page.locator('#sleepOverlay').evaluate('(el) => el.classList.contains("active")')
            assert json.load(urlopen(base + '/api/config'))['manualSleep'] is True
            # Override only the named screen's inherited schedule.
            profile={'id':'living-room','name':'Living room','pageIds':None,'schedule':{'sleepTime':'00:00','wakeTime':'00:00'}}
            urlopen(Request(base + '/api/screens',data=json.dumps(profile).encode(),headers={'Content-Type':'application/json'})).close()
            page.clock.set_system_time(datetime.datetime(2026,10,13,23,1,tzinfo=datetime.timezone.utc))
            page.evaluate('loadServerConfig()')
            assert not page.locator('#sleepOverlay').evaluate('(el) => el.classList.contains("active")')
            assert not errors, errors
            browser.close()
        print('PASS: named frame content, live schedules, manual sleep, all-day and overnight schedules')
    finally:
        server.terminate()
        server.wait(timeout=10)

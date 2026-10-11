const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const createUpdates = require('../updates');

test('public release checks compare versions and cache results', async () => {
  assert.equal(createUpdates.compare('1.10.0', '1.9.9'), 1);
  assert.equal(createUpdates.compare('1.1.0', '2.0.0'), -1);
  assert.equal(createUpdates.compare('1.1.0', '1.1.0'), 0);
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'display-update-'));
  const original = global.fetch;
  const next = String(Number(require('../package.json').version.split('.')[0]) + 1) + '.0.0';
  let calls = 0;
  global.fetch = async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.github.com/repos/lunnysteve/home-display/releases/latest');
    assert.equal(options.headers.Authorization, undefined);
    return {ok: true, status: 200, json: async () => ({tag_name: 'v' + next, assets: [{name: 'home-display-v' + next + '.tar.gz'}, {name: 'SHA256SUMS'}]})};
  };
  try {
    const updates = createUpdates(data);
    const result = await updates.check();
    assert.equal(result.available, true);
    assert.equal(result.installable, true);
    assert.equal(result.releaseUrl, 'https://github.com/lunnysteve/home-display/releases/tag/v' + next);
    await updates.check();
    assert.equal(calls, 1);
    await updates.check(true);
    assert.equal(calls, 2);
  } finally { global.fetch = original; fs.rmSync(data, {recursive: true, force: true}); }
});

test('same version and missing release are reported clearly', async () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'display-update-'));
  const original = global.fetch;
  try {
    global.fetch = async () => ({ok: true, status: 200, json: async () => ({tag_name: 'v' + require('../package.json').version, assets: []})});
    assert.equal((await createUpdates(data).check()).message, 'You are up to date.');
    global.fetch = async () => ({ok: false, status: 404});
    assert.equal((await createUpdates(data).check()).message, 'No published release was found.');
  } finally { global.fetch = original; fs.rmSync(data, {recursive: true, force: true}); }
});

'use strict';
const fs = require('fs'), path = require('path');
const version = require('./package.json').version;
function compare(a, b) {
  const left = a.split('.').map(Number), right = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1;
  return 0;
}
module.exports = function createUpdates(dataDir) {
  let cached = null, checked = 0, pending = null;
  const repo = process.env.HOME_DISPLAY_UPDATE_REPO || 'lunnysteve/home-display';
  async function check(force = false) {
    if (cached && !force && Date.now() - checked < 3600000) return cached;
    if (pending) return pending;
    pending = (async () => {
      const result = {version, repo, available: false, latest: null, releaseUrl: null, checkedAt: new Date().toISOString(), message: ''};
      try {
        if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repo)) throw Error('Invalid update repository.');
        const response = await fetch('https://api.github.com/repos/' + repo + '/releases/latest', {
          headers: {Accept: 'application/vnd.github+json', 'User-Agent': 'home-display/' + version},
          signal: AbortSignal.timeout(10000)
        });
        if (response.status === 404) result.message = 'No published release was found.';
        else {
          if (!response.ok) throw Error('GitHub returned HTTP ' + response.status);
          const release = await response.json();
          if (!/^v\d+\.\d+\.\d+$/.test(release.tag_name) || release.draft || release.prerelease) throw Error('Latest release does not use a stable version tag.');
          result.latest = release.tag_name.slice(1);
          result.releaseUrl = 'https://github.com/' + repo + '/releases/tag/' + release.tag_name;
          result.available = compare(result.latest, version) > 0;
          result.installable = release.assets?.some(a => a.name === 'home-display-' + release.tag_name + '.tar.gz') && release.assets?.some(a => a.name === 'SHA256SUMS');
          result.message = result.available ? 'Update available: ' + result.latest : 'You are up to date.';
        }
      } catch (error) {
        result.message = /^(GitHub|Latest|Invalid)/.test(error.message) ? error.message : 'Unable to reach GitHub. Try again when online.';
      }
      cached = result; checked = Date.now(); return result;
    })();
    try { return await pending; } finally { pending = null; }
  }
  return {version, check, state() {
    try { return JSON.parse(fs.readFileSync(path.join(dataDir, 'update-status.json'), 'utf8')); }
    catch { return null; }
  }};
};
module.exports.compare = compare;

'use strict';
const fs = require('fs'), path = require('path');
const clockTime = value => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
module.exports = function createScreens(dataDir) {
  const file = path.join(dataDir, 'screens.json'), stateFile = path.join(dataDir, 'display-state.json');
  const read = () => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
  const write = (target, value) => { fs.writeFileSync(target + '.tmp', JSON.stringify(value, null, 2), {mode:0o600}); fs.renameSync(target + '.tmp', target); };
  const find = id => read().find(s => s.id === id);
  return {
    read, find,
    save(input) {
      if (!input || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 100) throw Error('Enter a screen name.');
      const id = input.id || input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) throw Error('Screen ID must use letters, numbers and hyphens.');
      if (input.pageIds !== null && (!Array.isArray(input.pageIds) || input.pageIds.some(id => typeof id !== 'string') || input.pageIds.length > 100)) throw Error('Choose pages for this screen.');
      const screens = read(), old = screens.find(s => s.id === id);
      if (!input.id && old) throw Error('A screen with this address already exists. Choose another name or edit the existing screen.');
      if (!old && screens.length >= 20) throw Error('Maximum 20 screens.');
      const schedule = input.schedule === undefined ? old?.schedule || null : input.schedule;
      if (schedule !== null && (!schedule || !clockTime(schedule.sleepTime) || !clockTime(schedule.wakeTime))) throw Error('Choose valid screen off and on times.');
      const screen = {id, name:input.name.trim(), pageIds:input.pageIds, schedule:schedule && {sleepTime:schedule.sleepTime, wakeTime:schedule.wakeTime}, manualSleep:old?.manualSleep === true};
      write(file, [...screens.filter(s => s.id !== id), screen]); return screen;
    },
    sleep(id) {
      if (id) return find(id)?.manualSleep === true;
      return fs.existsSync(stateFile) && JSON.parse(fs.readFileSync(stateFile, 'utf8')).manualSleep === true;
    },
    setSleep(id, sleeping) {
      if (typeof sleeping !== 'boolean') throw Error('Choose screen on or off.');
      if (id) {
        const screens = read(), screen = screens.find(s => s.id === id);
        if (!screen) throw Error('Screen not found.');
        screen.manualSleep = sleeping; write(file, screens);
      } else write(stateFile, {manualSleep:sleeping});
      return sleeping;
    },
    remove(id) { write(file, read().filter(s => s.id !== id)); }
  };
};

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Path to configuration file
const CONFIG_FILE = path.join(__dirname, 'config.json');

// Global manual sleep override state
let manualSleepState = false; // false = normal schedule, true = forced sleep

// Initialize default configuration if it doesn't exist
function initConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    const defaultData = {
      settings: {
        sleepTime: '23:00',
        wakeTime: '07:00',
        transition: 'fade'
      },
      pages: [
        {
          id: 'p1',
          name: 'School Countdown',
          url: 'countdown.html',
          time: 30,
          active: true
        }
      ]
    };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(defaultData, null, 2), 'utf-8');
  }
}

initConfig();

// Setup Multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, __dirname);
  },
  filename: function (req, file, cb) {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    cb(null, safeName);
  }
});
const upload = multer({ storage: storage });

// API: Get entire configuration & live state
app.get('/api/config', (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    data.manualSleep = manualSleepState;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read configuration file.' });
  }
});

// API: Update configuration
app.post('/api/config', (req, res) => {
  try {
    const { settings, pages } = req.body;
    const currentConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    
    if (settings) currentConfig.settings = settings;
    if (pages) currentConfig.pages = pages;

    fs.writeFileSync(CONFIG_FILE, JSON.stringify(currentConfig, null, 2), 'utf-8');
    res.json({ success: true, config: currentConfig });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save configuration.' });
  }
});

// API: Manual Sleep/Wake Override
app.post('/api/display/sleep', (req, res) => {
  const { sleep } = req.body;
  manualSleepState = Boolean(sleep);
  res.json({ success: true, manualSleep: manualSleepState });
});

// API: Remote Control Raspberry Pi Display (Restart Browser or Reboot Pi)
app.post('/api/pi/control', (req, res) => {
  const { action } = req.body; // 'restart_browser' or 'reboot_pi'
  const PI_IP = '192.168.0.202';

  let command = '';
  if (action === 'restart_browser') {
    command = `ssh -o BatchMode=yes -o StrictHostKeyChecking=no pi@${PI_IP} "pkill -f chromium"`;
  } else if (action === 'reboot_pi') {
    command = `ssh -o BatchMode=yes -o StrictHostKeyChecking=no pi@${PI_IP} "sudo /sbin/reboot"`;
  } else {
    return res.status(400).json({ error: 'Invalid action.' });
  }

  exec(command, (err, stdout, stderr) => {
    if (err && action !== 'restart_browser') { // pkill returns code 1 if no process found
      return res.status(500).json({ error: stderr || err.message });
    }
    res.json({ success: true, action, message: `Executed ${action} on Pi.` });
  });
});

// API: Upload a new file
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }
  res.json({ success: true, filename: req.file.filename });
});

// API: Get list of all local files
app.get('/api/files', (req, res) => {
  fs.readdir(__dirname, (err, files) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to read directory.' });
    }
    
    const filtered = files.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return (
        ['.html', '.css', '.js', '.json', '.jpg', '.jpeg', '.png', '.gif', '.svg'].includes(ext) &&
        file !== 'package.json' &&
        file !== 'package-lock.json' &&
        file !== 'config.json'
      );
    });

    res.json({ files: filtered });
  });
});

// API: Get file content for editing
app.get('/api/file-content', (req, res) => {
  const filename = req.query.filename;
  if (!filename) {
    return res.status(400).json({ error: 'Filename is required.' });
  }
  
  const safePath = path.join(__dirname, path.basename(filename));
  if (!fs.existsSync(safePath)) {
    return res.status(404).json({ error: 'File not found.' });
  }

  try {
    const content = fs.readFileSync(safePath, 'utf-8');
    res.json({ filename, content });
  } catch (err) {
    res.status(500).json({ error: 'Failed to read file.' });
  }
});

// API: Edit/Write file content
app.post('/api/edit', (req, res) => {
  const { filename, content } = req.body;
  if (!filename || content === undefined) {
    return res.status(400).json({ error: 'Filename and content are required.' });
  }

  const safePath = path.join(__dirname, path.basename(filename));
  try {
    fs.writeFileSync(safePath, content, 'utf-8');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to write file.' });
  }
});

// API: Delete file
app.delete('/api/files/:filename', (req, res) => {
  const filename = req.params.filename;
  const safePath = path.join(__dirname, path.basename(filename));
  
  if (path.basename(filename) === 'index.html' || path.basename(filename) === 'admin.html') {
    return res.status(400).json({ error: 'Cannot delete core system files.' });
  }

  if (!fs.existsSync(safePath)) {
    return res.status(404).json({ error: 'File not found.' });
  }

  try {
    fs.unlinkSync(safePath);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete file.' });
  }
});

// Serve static files
app.use(express.static(__dirname));

// Serve index.html at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Serve admin dashboard
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Smart Display Controller listening on port ${PORT}`);
});

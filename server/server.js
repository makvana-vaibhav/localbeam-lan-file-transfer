const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const cors = require('cors');
const qrcode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 8080;
const UPLOAD_DIR = path.join(__dirname, 'uploads');

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Multer storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const unique = Date.now() + '-' + safeName;
    cb(null, unique);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 } // 2GB limit
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Helper: get local IP ─────────────────────────────────────────────────────
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return '127.0.0.1';
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ─── API Routes ───────────────────────────────────────────────────────────────

// Server info (IP, port, QR code)
app.get('/api/info', async (req, res) => {
  const ip = getLocalIP();
  const url = `http://${ip}:${PORT}`;
  try {
    const qr = await qrcode.toDataURL(url);
    res.json({ ip, port: PORT, url, qr });
  } catch {
    res.json({ ip, port: PORT, url, qr: null });
  }
});

// List files
app.get('/api/files', (req, res) => {
  try {
    const files = fs.readdirSync(UPLOAD_DIR).map(name => {
      const stat = fs.statSync(path.join(UPLOAD_DIR, name));
      return {
        name,
        originalName: name.replace(/^\d+-/, ''),
        size: stat.size,
        sizeFormatted: formatBytes(stat.size),
        modified: stat.mtime,
        modifiedFormatted: new Date(stat.mtime).toLocaleString()
      };
    }).sort((a, b) => new Date(b.modified) - new Date(a.modified));
    res.json({ files, count: files.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upload file(s)
app.post('/api/upload', upload.array('files', 20), (req, res) => {
  if (!req.files || req.files.length === 0)
    return res.status(400).json({ error: 'No files uploaded' });
  const uploaded = req.files.map(f => ({
    name: f.filename,
    originalName: f.originalname,
    size: f.size,
    sizeFormatted: formatBytes(f.size)
  }));
  res.json({ success: true, files: uploaded });
});

// Download file
app.get('/api/download/:filename', (req, res) => {
  const filename = req.params.filename;
  const filepath = path.join(UPLOAD_DIR, filename);
  if (!fs.existsSync(filepath))
    return res.status(404).json({ error: 'File not found' });
  const originalName = filename.replace(/^\d+-/, '');
  res.download(filepath, originalName);
});

// Delete file
app.delete('/api/files/:filename', (req, res) => {
  const filepath = path.join(UPLOAD_DIR, req.params.filename);
  if (!fs.existsSync(filepath))
    return res.status(404).json({ error: 'File not found' });
  fs.unlinkSync(filepath);
  res.json({ success: true });
});

// Storage stats
app.get('/api/stats', (req, res) => {
  try {
    const files = fs.readdirSync(UPLOAD_DIR);
    const totalSize = files.reduce((acc, name) => {
      const stat = fs.statSync(path.join(UPLOAD_DIR, name));
      return acc + stat.size;
    }, 0);
    res.json({
      fileCount: files.length,
      totalSize,
      totalSizeFormatted: formatBytes(totalSize)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fallback: serve dashboard
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIP();
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║         LocalBeam Server Ready        ║');
  console.log('╠══════════════════════════════════════╣');
  console.log(`║  Local:   http://localhost:${PORT}        ║`);
  console.log(`║  Network: http://${ip}:${PORT}   ║`);
  console.log('║  Connect Android using Network URL    ║');
  console.log('╚══════════════════════════════════════╝\n');
});

const { app, BrowserWindow, shell, Tray, Menu, nativeImage, ipcMain } = require('electron');
const path = require('path');
const fs   = require('fs');
const http = require('http');
const net  = require('net');

// ─── Constants ────────────────────────────────────────────────────────────────
const DEV        = process.env.NODE_ENV === 'development';
const PORT_START = 8080;
const PORT_END   = 8120;
const LOG_FILE   = path.join(app.getPath('userData'), 'localbeam.log');

try { fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true }); } catch {}

// ─── Logging ──────────────────────────────────────────────────────────────────
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch {}
}

// ─── State ────────────────────────────────────────────────────────────────────
let mainWindow   = null;
let splashWindow = null;
let tray         = null;
let serverPort   = null;
let isQuitting   = false;

// ─── Find a free port ─────────────────────────────────────────────────────────
function findFreePort(start, end) {
  return new Promise((resolve, reject) => {
    let port = start;
    const tryPort = () => {
      if (port > end) return reject(new Error('No free port available in range'));
      const s = net.createServer();
      s.once('error', () => { port++; tryPort(); });
      s.once('listening', () => s.close(() => resolve(port)));
      s.listen(port, '127.0.0.1');
    };
    tryPort();
  });
}

// ─── Resolve server directory ─────────────────────────────────────────────────
function getServerDir() {
  if (DEV) {
    // Dev: electron/electron/main.js → up 3 levels to localbeam/ → server/
    return path.join(__dirname, '..', '..', '..', 'server');
  }
  // Packaged: extraResources lands at process.resourcesPath/server
  return path.join(process.resourcesPath, 'server');
}

// ─── Start Express server IN-PROCESS ─────────────────────────────────────────
// We require() the server code directly inside Electron's built-in Node.js.
// No external node binary needed — Electron IS the Node runtime.
async function startServer() {
  serverPort = await findFreePort(PORT_START, PORT_END);
  log(`Starting in-process server on port ${serverPort}`);

  const serverDir    = getServerDir();
  const serverScript = path.join(serverDir, 'server.js');
  log(`Server script: ${serverScript}`);

  if (!fs.existsSync(serverScript)) {
    throw new Error(`Server script not found: ${serverScript}`);
  }

  // Set env vars before requiring
  process.env.PORT     = String(serverPort);
  process.env.NODE_ENV = 'production';

  // Clear require cache for clean load
  Object.keys(require.cache).forEach(k => {
    if (k.startsWith(serverDir)) delete require.cache[k];
  });

  try {
    require(serverScript);
    log('Server module loaded successfully');
  } catch (err) {
    throw new Error(`Failed to load server module: ${err.message}`);
  }

  // Poll until Express is actually accepting connections
  await waitForServer(serverPort);
  log(`Server ready on port ${serverPort}`);
}

// ─── Poll until server responds ───────────────────────────────────────────────
function waitForServer(port, maxMs = 20000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + maxMs;
    const attempt  = () => {
      const req = http.get(`http://127.0.0.1:${port}/api/info`, (res) => {
        if (res.statusCode === 200) return resolve();
        retry();
      });
      req.on('error', retry);
      req.setTimeout(1000, () => { req.destroy(); retry(); });
    };
    const retry = () => {
      if (Date.now() > deadline)
        return reject(new Error(`Server did not respond within ${maxMs / 1000}s`));
      setTimeout(attempt, 400);
    };
    attempt();
  });
}

// ─── Splash window ────────────────────────────────────────────────────────────
function createSplash() {
  splashWindow = new BrowserWindow({
    width: 420,
    height: 280,
    frame: false,
    resizable: false,
    center: true,
    alwaysOnTop: true,
    show: false,
    backgroundColor: '#FDFBF7',
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
  splashWindow.once('ready-to-show', () => splashWindow.show());
}

// ─── Main window ──────────────────────────────────────────────────────────────
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'LocalBeam',
    backgroundColor: '#FDFBF7',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      sandbox: false,
    },
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
  });

  mainWindow.loadURL(`http://127.0.0.1:${serverPort}`);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('close', (e) => {
    if (!isQuitting && process.platform !== 'darwin') {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ─── System tray ──────────────────────────────────────────────────────────────
function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'tray-icon.png');
  let icon;
  try {
    icon = fs.existsSync(iconPath)
      ? nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
      : nativeImage.createEmpty();
  } catch {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip(`LocalBeam — port ${serverPort}`);
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: 'Open LocalBeam',
      click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } }
    },
    { label: `Running on port ${serverPort}`, enabled: false },
    { type: 'separator' },
    {
      label: 'Open in Browser',
      click: () => shell.openExternal(`http://localhost:${serverPort}`),
    },
    {
      label: 'Open Log File',
      click: () => shell.openPath(LOG_FILE),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => { isQuitting = true; app.quit(); }
    },
  ]));

  tray.on('double-click', () => {
    if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
  });
}

// ─── IPC ──────────────────────────────────────────────────────────────────────
ipcMain.handle('get-port',     () => serverPort);
ipcMain.handle('get-log-path', () => LOG_FILE);
ipcMain.handle('open-log',     () => shell.openPath(LOG_FILE));

// ─── Sandbox flags for Linux AppImage ─────────────────────────────────────────
// Required on Linux systems where SUID sandbox is not configured
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu-sandbox');

// ─── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  log(`App starting — DEV=${DEV} platform=${process.platform}`);
  createSplash();

  try {
    await startServer();
    createMainWindow();
    createTray();

    mainWindow.once('ready-to-show', () => {
      if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.close();
        splashWindow = null;
      }
      mainWindow.show();
      mainWindow.focus();
    });

  } catch (err) {
    log(`FATAL: ${err.message}`);
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.webContents.executeJavaScript(`
        document.getElementById('status').textContent = 'Startup failed — see log file';
        document.querySelector('.spinner').style.display = 'none';
      `).catch(() => {});
    }
    setTimeout(() => {
      const { dialog } = require('electron');
      dialog.showErrorBox(
        'LocalBeam — Startup Failed',
        `Could not start:\n\n${err.message}\n\nLog:\n${LOG_FILE}`
      );
      app.quit();
    }, 600);
  }
});

app.on('window-all-closed', () => {
  if (process.platform === 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
});

app.on('before-quit', () => { isQuitting = true; });

process.on('uncaughtException', (err) => {
  log(`Uncaught exception: ${err.message}\n${err.stack}`);
});

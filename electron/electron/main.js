const { app, BrowserWindow, shell, Tray, Menu, nativeImage, ipcMain } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');

// ─── Constants ────────────────────────────────────────────────────────────────
const DEV = process.env.NODE_ENV === 'development';
const PORT_START = 8080;
const PORT_END   = 8120;
const LOG_FILE   = path.join(app.getPath('userData'), 'localbeam.log');

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
let serverProcess = null;
let serverPort   = null;
let isQuitting   = false;

// ─── Find a free port ─────────────────────────────────────────────────────────
function findFreePort(start, end) {
  return new Promise((resolve, reject) => {
    let port = start;
    const tryPort = () => {
      if (port > end) return reject(new Error('No free port found'));
      const server = require('net').createServer();
      server.once('error', () => { port++; tryPort(); });
      server.once('listening', () => {
        server.close(() => resolve(port));
      });
      server.listen(port, '0.0.0.0');
    };
    tryPort();
  });
}

// ─── Poll until server responds ───────────────────────────────────────────────
function waitForServer(port, maxMs = 15000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + maxMs;
    const attempt = () => {
      http.get(`http://127.0.0.1:${port}/api/info`, (res) => {
        if (res.statusCode === 200) return resolve();
        retry();
      }).on('error', retry);
    };
    const retry = () => {
      if (Date.now() > deadline) return reject(new Error('Server did not start in time'));
      setTimeout(attempt, 300);
    };
    attempt();
  });
}

// ─── Resolve bundled server path ──────────────────────────────────────────────
function getServerPath() {
  if (DEV) {
    return path.join(__dirname, '..', '..', 'server', 'server.js');
  }
  // In packaged app, extraResources are at process.resourcesPath/server
  return path.join(process.resourcesPath, 'server', 'server.js');
}

function getNodePath() {
  if (DEV) return process.execPath; // use system node in dev
  // In packaged app we bundle node binary
  const plat = process.platform;
  if (plat === 'win32') return path.join(process.resourcesPath, 'node', 'node.exe');
  return path.join(process.resourcesPath, 'node', 'node');
}

// ─── Start the Express server ─────────────────────────────────────────────────
async function startServer() {
  serverPort = await findFreePort(PORT_START, PORT_END);
  log(`Starting server on port ${serverPort}`);

  const serverScript = getServerPath();
  log(`Server script: ${serverScript}`);

  if (!fs.existsSync(serverScript)) {
    throw new Error(`Server script not found: ${serverScript}`);
  }

  const nodeBin = DEV ? process.execPath : getNodePath();

  serverProcess = spawn(nodeBin, [serverScript], {
    env: {
      ...process.env,
      PORT: String(serverPort),
      NODE_ENV: 'production',
      ELECTRON_RUN_AS_NODE: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });

  serverProcess.stdout.on('data', (d) => log(`[server] ${d.toString().trim()}`));
  serverProcess.stderr.on('data', (d) => log(`[server:err] ${d.toString().trim()}`));

  serverProcess.on('exit', (code, signal) => {
    log(`Server exited — code: ${code}, signal: ${signal}`);
    if (!isQuitting && mainWindow) {
      mainWindow.webContents.executeJavaScript(
        `document.body.innerHTML = '<div style="font-family:sans-serif;padding:40px;color:#333"><h2>Server stopped unexpectedly</h2><p>Please restart LocalBeam.</p></div>'`
      ).catch(() => {});
    }
  });

  serverProcess.on('error', (err) => {
    log(`Failed to start server: ${err.message}`);
  });

  await waitForServer(serverPort);
  log(`Server ready on port ${serverPort}`);
}

// ─── Splash window ────────────────────────────────────────────────────────────
function createSplash() {
  splashWindow = new BrowserWindow({
    width: 420,
    height: 280,
    frame: false,
    resizable: false,
    center: true,
    transparent: false,
    alwaysOnTop: true,
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
    backgroundColor: '#FDFBF7',
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
    },
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
  });

  mainWindow.loadURL(`http://127.0.0.1:${serverPort}`);

  // Open external links in system browser, not Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Hide to tray on close (Windows/Linux), quit on macOS
  mainWindow.on('close', (e) => {
    if (!isQuitting && process.platform !== 'darwin') {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ─── System tray ─────────────────────────────────────────────────────────────
function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'tray-icon.png');
  const icon = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
    : nativeImage.createEmpty();

  tray = new Tray(icon);
  tray.setToolTip(`LocalBeam — running on port ${serverPort}`);

  const menu = Menu.buildFromTemplate([
    {
      label: 'Open LocalBeam',
      click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } }
    },
    {
      label: `Server: http://localhost:${serverPort}`,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Open in Browser',
      click: () => shell.openExternal(`http://localhost:${serverPort}`),
    },
    {
      label: `Open Log File`,
      click: () => shell.openPath(LOG_FILE),
    },
    { type: 'separator' },
    {
      label: 'Quit LocalBeam',
      click: () => { isQuitting = true; app.quit(); }
    },
  ]);

  tray.setContextMenu(menu);
  tray.on('double-click', () => {
    if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
  });
}

// ─── IPC handlers ────────────────────────────────────────────────────────────
ipcMain.handle('get-port', () => serverPort);
ipcMain.handle('get-log-path', () => LOG_FILE);
ipcMain.handle('open-log', () => shell.openPath(LOG_FILE));

// ─── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  log('App ready — starting LocalBeam');
  createSplash();

  try {
    await startServer();
    createMainWindow();
    createTray();

    // Close splash, show main
    mainWindow.once('ready-to-show', () => {
      if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.close();
        splashWindow = null;
      }
      mainWindow.show();
      mainWindow.focus();
    });

  } catch (err) {
    log(`Fatal startup error: ${err.message}`);
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.webContents.executeJavaScript(
        `document.getElementById('status').textContent = 'Failed to start: ${err.message.replace(/'/g, '')}'`
      ).catch(() => {});
    }
    // Show error dialog after short delay
    setTimeout(() => {
      const { dialog } = require('electron');
      dialog.showErrorBox(
        'LocalBeam — Startup Failed',
        `Could not start the server:\n\n${err.message}\n\nCheck the log file:\n${LOG_FILE}`
      );
      app.quit();
    }, 500);
  }
});

app.on('window-all-closed', () => {
  // Keep running in tray on Windows/Linux
  if (process.platform === 'darwin') app.quit();
});

app.on('activate', () => {
  // macOS: re-open window when dock icon is clicked
  if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('will-quit', (e) => {
  if (serverProcess && !serverProcess.killed) {
    log('Stopping server...');
    e.preventDefault();
    serverProcess.kill('SIGTERM');
    serverProcess.once('exit', () => {
      log('Server stopped. Quitting app.');
      app.exit(0);
    });
    // Force quit after 3 seconds if server doesn't stop
    setTimeout(() => {
      log('Force quitting...');
      app.exit(0);
    }, 3000);
  }
});

// Catch unhandled errors
process.on('uncaughtException', (err) => {
  log(`Uncaught exception: ${err.message}\n${err.stack}`);
});

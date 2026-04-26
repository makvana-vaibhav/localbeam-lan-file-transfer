const { app, BrowserWindow, dialog } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
let serverProcess = null;
let resolvedPort = null;
let isQuitting = false;

function logDesktop(message) {
  try {
    const logPath = path.join(app.getPath('userData'), 'localbeam-desktop.log');
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${message}\n`);
  } catch (_) {}
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 980,
    minHeight: 640,
    autoHideMenuBar: true,
    title: 'LocalBeam',
    show: true,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'loading.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function waitForServerReady(timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();

    const timer = setInterval(() => {
      if (resolvedPort) {
        clearInterval(timer);
        clearTimeout(timeout);
        resolve(resolvedPort);
      }

      if (Date.now() - startedAt > timeoutMs) {
        clearInterval(timer);
      }
    }, 100);

    const timeout = setTimeout(() => {
      clearInterval(timer);
      reject(new Error('Backend start timeout.'));
    }, timeoutMs);
  });
}

function startBackend() {
  return new Promise((resolve, reject) => {
    const backendPath = path.join(__dirname, '..', 'server', 'server.js');
    const preferredPort = process.env.LOCALBEAM_PORT || '8080';

    serverProcess = spawn(process.execPath, [backendPath], {
      env: {
        ...process.env,
        PORT: preferredPort,
        ELECTRON_RUN_AS_NODE: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    serverProcess.stdout.setEncoding('utf8');
    serverProcess.stderr.setEncoding('utf8');

    serverProcess.stdout.on('data', (chunk) => {
      const lines = chunk.split(/\r?\n/).filter(Boolean);
      lines.forEach((line) => {
        logDesktop(`[server] ${line}`);
        const marker = 'LOCALBEAM_SERVER_READY:';
        if (line.includes(marker)) {
          const portText = line.split(marker)[1]?.trim();
          const port = Number(portText);
          if (Number.isFinite(port) && port > 0) {
            resolvedPort = port;
            resolve(port);
          }
        }
      });
    });

    serverProcess.stderr.on('data', (chunk) => {
      logDesktop(`[server:err] ${chunk.trim()}`);
    });

    serverProcess.on('error', (err) => {
      logDesktop(`Server process error: ${err.message}`);
      reject(err);
    });

    serverProcess.on('exit', (code) => {
      logDesktop(`Server process exited with code ${code}`);
      if (!isQuitting && !resolvedPort) {
        reject(new Error('Server exited before becoming ready.'));
      }
    });
  });
}

async function stopBackend() {
  if (!serverProcess || serverProcess.killed) return;

  await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      if (serverProcess && !serverProcess.killed) {
        serverProcess.kill('SIGKILL');
      }
      resolve();
    }, 4000);

    serverProcess.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });

    serverProcess.kill('SIGTERM');
  });
}

app.on('window-all-closed', async () => {
  isQuitting = true;
  await stopBackend();
  app.quit();
});

app.on('before-quit', async () => {
  isQuitting = true;
  await stopBackend();
});

app.whenReady().then(async () => {
  createWindow();

  try {
    await startBackend();
    const port = await waitForServerReady();

    if (!mainWindow) return;
    await mainWindow.loadURL(`http://127.0.0.1:${port}`);
  } catch (err) {
    logDesktop(`Startup failed: ${err.message}`);
    dialog.showErrorBox(
      'LocalBeam failed to start',
      `Could not start backend server.\n\n${err.message}`
    );
    app.quit();
  }
});

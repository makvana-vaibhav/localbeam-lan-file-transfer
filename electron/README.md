# LocalBeam — Electron Desktop App

Wraps the LocalBeam Node.js server into a one-click desktop application for Windows, Linux, and macOS.

---

## Final Project Structure

```
localbeam/
├── server/                  ← your existing Express server (unchanged)
│   ├── server.js
│   ├── package.json
│   ├── public/
│   └── uploads/
├── android-app/             ← your existing Android app (unchanged)
└── electron/                ← this folder — put it inside localbeam/
    ├── package.json
    ├── generate-icon.js
    ├── electron/
    │   ├── main.js          ← Electron main process
    │   ├── preload.js       ← secure IPC bridge
    │   ├── splash.html      ← loading screen
    │   └── assets/
    │       ├── icon.png     ← app icon (you provide this)
    │       ├── icon.ico     ← Windows icon
    │       └── icon.icns    ← macOS icon
    └── dist/                ← built installers go here (auto-created)
```

---

## Setup (one time)

### Step 1 — Place this folder correctly

```bash
# The electron folder should sit next to your server/ folder
cp -r localbeam-electron/ ~/coding/Projects/localbeam/electron/
cd ~/coding/Projects/localbeam/electron
```

### Step 2 — Install dependencies

```bash
npm install
```

### Step 3 — Create app icons

You need three icon files in `electron/assets/`:
- `icon.png` — 512x512 or 1024x1024 PNG (Linux)
- `icon.ico` — Windows icon
- `icon.icns` — macOS icon

**Quickest way** — use ImageMagick to make a placeholder:
```bash
sudo apt install imagemagick -y

# Create a simple 512x512 icon
convert -size 512x512 xc:'#8B5E34' \
  -fill white -font DejaVu-Sans-Bold -pointsize 300 \
  -gravity center -annotate 0 'LB' \
  electron/assets/icon.png

# Copy for Linux (also used as fallback)
cp electron/assets/icon.png electron/assets/tray-icon.png
```

**For proper multi-size icons** (needed for Windows .ico and macOS .icns):
```bash
npm install -g electron-icon-builder
electron-icon-builder --input=electron/assets/icon.png --output=electron/assets/
```
This auto-generates `icon.ico` and `icon.icns` from your PNG.

---

## Run in Development

```bash
cd ~/coding/Projects/localbeam/electron
npm run dev
```

This starts Electron in dev mode — uses your local system Node.js and your `../server/server.js` directly.

---

## Build Installers

### Linux (AppImage + .deb)
```bash
npm run dist:linux
```
Output:
- `dist/LocalBeam-1.0.0.AppImage` — portable, no install needed
- `dist/localbeam_1.0.0_amd64.deb` — Debian/Ubuntu installer

### Windows (.exe installer)
```bash
npm run dist:win
```
Output:
- `dist/LocalBeam Setup 1.0.0.exe` — NSIS installer

### macOS (.dmg)
```bash
npm run dist:mac
```
Output:
- `dist/LocalBeam-1.0.0.dmg` — drag to Applications

### All platforms at once (from macOS only)
```bash
npm run dist:all
```

---

## How it works

```
User double-clicks LocalBeam
         │
         ▼
  splash.html shown
         │
         ▼
  main.js finds a free port (8080–8120)
         │
         ▼
  Spawns node server/server.js as child process
         │
         ▼
  Polls http://127.0.0.1:PORT/api/info every 300ms
         │
         ▼
  Server responds → close splash → show main window
         │
         ▼
  BrowserWindow loads http://127.0.0.1:PORT
         │
         ▼
  System tray icon appears
         │
         ▼
  User closes window → app minimizes to tray (Windows/Linux)
  User quits from tray → server killed → app exits
```

---

## What's bundled inside the app

When built, electron-builder packages:
- The Electron runtime
- `electron/main.js`, `preload.js`, `splash.html`
- Your entire `server/` folder (as `extraResources`)
  - `server.js`
  - `public/index.html`
  - `node_modules/` (express, multer, cors, qrcode)

The `uploads/` folder is NOT bundled — files are stored in the user's app data directory at runtime.

---

## Port handling

The app automatically tries ports 8080 through 8120.
- If 8080 is busy, it uses 8081, then 8082, etc.
- The tray tooltip always shows the actual port in use.
- No configuration needed by the user.

---

## Log file location

Logs are written to:
- Linux: `~/.config/LocalBeam/localbeam.log`
- Windows: `%APPDATA%\LocalBeam\localbeam.log`
- macOS: `~/Library/Application Support/LocalBeam/localbeam.log`

Access via: Tray icon → Open Log File

---

## Distributing to users

For GitHub Releases, upload:
| File | For |
|------|-----|
| `LocalBeam-1.0.0.AppImage` | Linux users (universal) |
| `localbeam_1.0.0_amd64.deb` | Ubuntu/Debian users |
| `LocalBeam Setup 1.0.0.exe` | Windows users |
| `LocalBeam-1.0.0.dmg` | macOS users |
| `app-debug.apk` | Android users |

Linux users run AppImage like this:
```bash
chmod +x LocalBeam-1.0.0.AppImage
./LocalBeam-1.0.0.AppImage
```

---

## Troubleshooting

**App opens but shows blank screen**
- Server didn't start in time. Check the log file.
- Make sure `../server/node_modules/` exists (run `npm install` inside `server/`)

**Port conflict on startup**
- The app auto-finds a free port. If all ports 8080–8120 are busy, it will show an error dialog.

**"Server script not found" error**
- In dev: make sure the `server/` folder is one level up: `../server/server.js`
- In packaged: this means `extraResources` didn't bundle correctly. Re-run `npm run dist`.

**macOS: "app is damaged" message**
- Run: `xattr -cr /Applications/LocalBeam.app`
- This happens because the app is not code-signed (requires Apple Developer account).

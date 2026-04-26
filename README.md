# ⚡ LocalBeam — Offline Cross-Platform File Transfer

> Transfer files between Android and Linux over local WiFi. No internet. No cables. No cloud.

---

## 📁 Project Structure

```
localbeam/
├── server/                    ← Node.js Linux server
│   ├── server.js              ← Main server entry point
│   ├── package.json           ← Dependencies
│   ├── uploads/               ← Received files stored here
│   └── public/
│       └── index.html         ← Web dashboard (browser UI)
│
└── android-app/               ← Kotlin Android app
    ├── build.gradle           ← Project build config
    ├── settings.gradle
    └── app/
        ├── build.gradle       ← App dependencies
        └── src/main/
            ├── AndroidManifest.xml
            ├── java/com/localbeam/
            │   ├── api/
            │   │   ├── LocalBeamApi.kt     ← Retrofit interface
            │   │   └── ApiClient.kt        ← OkHttp + Retrofit setup
            │   ├── models/
            │   │   └── Models.kt           ← Data classes
            │   ├── ui/
            │   │   ├── MainActivity.kt     ← Main screen
            │   │   ├── MainViewModel.kt    ← ViewModel
            │   │   └── FileListAdapter.kt  ← RecyclerView adapter
            │   └── utils/
            │       ├── FileRepository.kt   ← File operations
            │       └── PrefsHelper.kt      ← SharedPreferences
            └── res/
                ├── layout/
                │   ├── activity_main.xml
                │   └── item_file.xml
                ├── values/
                │   ├── colors.xml
                │   └── themes.xml
                ├── drawable/
                │   └── bg_file_icon.xml
                └── xml/
                    └── file_paths.xml
```

---

## 🚀 Getting Started

### Prerequisites

| Tool | Version |
|------|---------|
| Node.js | ≥ 18.x |
| npm | ≥ 9.x |
| Android Studio | Hedgehog or newer |
| Android device | API 24+ (Android 7.0+) |

---

## 🖥️ Linux Server Setup

### Step 1 — Install dependencies

```bash
cd localbeam/server
npm install
```

### Step 2 — Start the server

```bash
npm start
```

You'll see output like:

```
╔══════════════════════════════════════╗
║         LocalBeam Server Ready        ║
╠══════════════════════════════════════╣
║  Local:   http://localhost:8080        ║
║  Network: http://192.168.1.42:8080    ║
║  Connect Android using Network URL    ║
╚══════════════════════════════════════╝
```

### Step 3 — Open the web dashboard

Navigate to **http://localhost:8080** in your browser.

You'll see:
- Your server's **IP address and QR code** for Android connection
- **Drag-and-drop upload** zone
- **File browser** with download and delete
- **Storage stats**

### Custom port

```bash
PORT=9000 npm start
```

### Run in background (optional)

```bash
# Install pm2 globally
npm install -g pm2
pm2 start server.js --name localbeam
pm2 startup   # auto-start on boot
```

---

## 📱 Android App Setup

### Step 1 — Open in Android Studio

Open the `localbeam/android-app` folder in Android Studio.

### Step 2 — Sync Gradle

Click **Sync Now** when prompted, or go to **File → Sync Project with Gradle Files**.

### Step 3 — Connect your device

Enable **Developer Options** and **USB Debugging** on your Android device, then connect via USB. After first install you can disconnect the cable.

### Step 4 — Build and Run

Press the **▶ Run** button or use `Shift+F10`.

---

## 📲 Using the Android App

### Connect to the server

1. Open LocalBeam on your Android device
2. Make sure both devices are on the **same WiFi network**
3. Enter the server URL shown in the terminal: `http://192.168.x.x:8080`
   - **OR** tap **Scan QR** and scan the QR code shown on the web dashboard
4. Tap **Connect**

### Upload files (Android → Linux)

1. Tap the **⬆ Upload** FAB button
2. Select any file from your device
3. The file appears in the server's file list instantly

### Download files (Linux → Android)

1. Files uploaded to the server appear in the Android app list
2. Tap **⬇** on any file
3. File is saved to `Downloads/LocalBeam/` on your phone

### Upload from the web dashboard (Linux → Linux or browser)

- Open **http://localhost:8080** in your browser
- Drag and drop files or click the upload zone
- Files are immediately available for Android download

---

## 🔌 REST API Reference

The server exposes a simple REST API. You can call it from any HTTP client.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/info` | Server IP, port, QR code |
| `GET` | `/api/files` | List all files |
| `GET` | `/api/stats` | File count and total size |
| `POST` | `/api/upload` | Upload files (multipart/form-data, field: `files`) |
| `GET` | `/api/download/:filename` | Download a file |
| `DELETE` | `/api/files/:filename` | Delete a file |

### Example: upload via curl

```bash
curl -F "files=@/path/to/photo.jpg" http://192.168.1.42:8080/api/upload
```

### Example: list files via curl

```bash
curl http://192.168.1.42:8080/api/files
```

---

## ⚙️ Configuration

### Change upload directory

Edit `server.js`:
```js
const UPLOAD_DIR = '/your/custom/path';
```

### Change file size limit

Edit `server.js`:
```js
limits: { fileSize: 5 * 1024 * 1024 * 1024 } // 5 GB
```

### Android: change default server URL

Edit `PrefsHelper.kt` or let the user enter it in the app.

---

## 🧱 Architecture

```
┌─────────────────────┐         WiFi / LAN         ┌──────────────────────┐
│   Android App       │◄──────────────────────────►│   Linux Server       │
│                     │                             │                      │
│  MainViewModel      │   HTTP REST (port 8080)     │  Express.js          │
│  FileRepository     │──── POST /api/upload ──────►│  Multer (storage)    │
│  ApiClient          │◄─── GET  /api/files ────────│  Local filesystem    │
│  (Retrofit+OkHttp)  │──── GET  /api/download ────►│  QR code generation  │
└─────────────────────┘                             └──────────────────────┘
                                                            │
                                                            ▼
                                                    ┌──────────────────────┐
                                                    │  Web Dashboard       │
                                                    │  (browser at :8080)  │
                                                    │  Drag & drop upload  │
                                                    │  File browser        │
                                                    └──────────────────────┘
```

---

## 🔐 Security Notes

- The server binds to `0.0.0.0` (all interfaces) — **only use on trusted networks**
- No authentication is implemented (MVP design)
- For production/shared networks, add basic auth:

```js
// Add to server.js
const basicAuth = require('express-basic-auth');
app.use(basicAuth({ users: { 'admin': 'yourpassword' } }));
```

---

## 🛠️ Troubleshooting

**Android can't connect to server**
- Ensure both devices are on the **same WiFi network**
- Check the server IP in the terminal output
- Make sure your Linux firewall allows port 8080: `sudo ufw allow 8080`
- Try pinging from Android: some routers block device-to-device traffic

**File not saving on Android**
- Grant **Storage** permission when prompted
- Check `Downloads/LocalBeam/` folder

**Large file upload times out**
- The server supports up to 2 GB files
- OkHttp timeout is set to 5 minutes — increase in `ApiClient.kt` for very slow networks

**Port already in use**
```bash
PORT=9000 npm start
```

---

## 🗺️ Roadmap

- [ ] Multiple file upload progress (per-file bars)
- [ ] Transfer speed display
- [ ] Folder upload/download
- [ ] Password protection (Basic Auth)
- [ ] HTTPS / self-signed cert support
- [ ] Persistent server as Linux systemd service
- [ ] Android notification for completed transfers
- [ ] File preview (images, text)

---

## 📄 License

MIT — free to use, modify, and distribute.

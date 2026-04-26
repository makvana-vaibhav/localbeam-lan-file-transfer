# LocalBeam — GitHub CI/CD Setup Guide

---

## What these workflows do

### `ci.yml` — runs on every push to `main`
- Tests all server API endpoints (upload, download, list, stats)
- Validates Android project compiles
- Validates Electron config syntax
- Takes ~3 minutes

### `release.yml` — runs when you push a version tag
- Builds Android APK on Ubuntu
- Builds Linux AppImage + .deb on Ubuntu
- Builds Windows .exe on Windows runner
- Builds macOS .dmg on macOS runner
- Creates a GitHub Release with all files attached
- Auto-generates changelog from commit messages
- Takes ~15-20 minutes

---

## One-time setup

### Step 1 — Initialize git repo (if not done)

```bash
cd ~/coding/Projects/localbeam
git init
git branch -M main
```

### Step 2 — Copy workflow files into your project

```bash
# Copy the .github folder to your project root
cp -r /path/to/localbeam-ci/.github ~/coding/Projects/localbeam/
cp /path/to/localbeam-ci/.gitignore ~/coding/Projects/localbeam/

# Make sure uploads dir is tracked but empty
mkdir -p server/uploads
touch server/uploads/.gitkeep
```

### Step 3 — Create repo on GitHub

1. Go to https://github.com/new
2. Name it `localbeam`
3. Set to **Public** (required for free Actions minutes)
4. Do NOT initialize with README (you have files already)

### Step 4 — Push your code

```bash
cd ~/coding/Projects/localbeam
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/localbeam.git
git push -u origin main
```

### Step 5 — No secrets needed

The workflows use `secrets.GITHUB_TOKEN` which GitHub provides automatically. You don't need to configure anything.

---

## How to make a release

Every time you want to release a new version:

```bash
cd ~/coding/Projects/localbeam

# Make your changes, commit them
git add .
git commit -m "Add feature X"
git push

# Tag the release — this triggers the build
git tag v1.0.0
git push origin v1.0.0
```

That's it. GitHub Actions will:
1. Build all 4 platforms in parallel (~15 min)
2. Create a release at: `github.com/YOUR_USERNAME/localbeam/releases/tag/v1.0.0`
3. Attach all files automatically

---

## Release naming convention

```
v1.0.0   — first public release
v1.0.1   — bug fix
v1.1.0   — new feature
v2.0.0   — breaking change
```

---

## What users see on the Releases page

```
LocalBeam v1.0.0

Downloads:
  LocalBeam-v1.0.0-android.apk       ← Android
  LocalBeam-v1.0.0-linux.AppImage    ← Linux portable
  localbeam_1.0.0_amd64.deb          ← Linux Debian/Ubuntu
  LocalBeam-Setup-1.0.0.exe          ← Windows
  LocalBeam-1.0.0.dmg                ← macOS
```

---

## Workflow triggers summary

| Event | Workflow | What happens |
|-------|----------|------|
| Push to `main` | ci.yml | Tests run, validates everything compiles |
| Push a `v*` tag | release.yml | Full build + GitHub Release created |
| Manual trigger | release.yml | Same as tag, from GitHub UI |

---

## Manual trigger (without a tag)

You can trigger a release manually from GitHub:
1. Go to your repo → Actions → Build & Release
2. Click "Run workflow"
3. Enter version (e.g. `v1.0.0`)
4. Click "Run workflow"

---

## Checking build status

Add this badge to your README.md:

```markdown
![CI](https://github.com/YOUR_USERNAME/localbeam/actions/workflows/ci.yml/badge.svg)
![Release](https://github.com/YOUR_USERNAME/localbeam/actions/workflows/release.yml/badge.svg)
```

---

## If a build fails

1. Go to repo → Actions tab
2. Click the failed run
3. Expand the failed step to see the error
4. Fix, commit, push — CI runs again automatically

Common issues:
- Android: `gradlew` not executable → `chmod +x android-app/gradlew` and commit
- Electron: missing `package-lock.json` → run `npm install` inside `electron/` and commit the lock file
- Server: `node_modules` missing → make sure `server/package-lock.json` is committed (not the modules themselves)
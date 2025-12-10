# Auto-Update System Setup

This document explains how to set up and use the auto-update system for DrawStack.

## Overview

DrawStack uses Tauri's built-in updater to provide automatic updates. When you create a new release on GitHub, users will automatically be notified and can update with one click.

## Initial Setup (One-Time)

### 1. Generate Signing Keys

The updater requires cryptographic signing to ensure update authenticity. Generate keys using Tauri CLI:

```bash
npm run tauri signer generate
```

This will output:
- A **public key** (starts with `dW50cnVzdGVk...`)
- A **private key** (keep this secret!)
- An optional password

**Important:** Save the private key and password securely - you'll need them for GitHub Actions.

### 2. Update tauri.conf.json

Open `src-tauri/tauri.conf.json` and replace the placeholder public key:

```json
"plugins": {
  "updater": {
    "pubkey": "YOUR_ACTUAL_PUBLIC_KEY_HERE"
  }
}
```

### 3. Configure GitHub Secrets

Go to your repository settings → Secrets and variables → Actions, and add:

1. **TAURI_SIGNING_PRIVATE_KEY**: Your private key (the long string)
2. **TAURI_SIGNING_PRIVATE_KEY_PASSWORD**: Your password (if you set one, otherwise leave empty)

To add secrets:
1. Go to https://github.com/darrenk196/draw-stack-app/settings/secrets/actions
2. Click "New repository secret"
3. Add both secrets above

## Releasing Updates

### Creating a Release

1. Update version numbers:
   - `src-tauri/tauri.conf.json` → `"version": "0.2.0"`
   - `package.json` → `"version": "0.2.0"`
   - `src/routes/settings/+page.svelte` → `APP_VERSION = "0.2.0"`

2. Commit your changes:
   ```bash
   git add -A
   git commit -m "chore: bump version to 0.2.0"
   ```

3. Create and push a git tag:
   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```

4. GitHub Actions will automatically:
   - Build installers for Windows, macOS, and Linux
   - Sign the installers with your private key
   - Create a GitHub Release with all the files
   - Generate a `latest.json` file for the updater

### What Users See

1. **On App Launch**: The app silently checks for updates in the background (after 5 seconds)
2. **If Update Available**: A dialog appears: "Update available: [version]. Would you like to download and install it now?"
3. **User Clicks Yes**: Update downloads and installs automatically
4. **After Installation**: Asks if they want to restart now or later

Users can also manually check for updates:
- Go to Settings → About → "Check for Updates" button

## Testing Updates

### Testing Locally

You can test the update UI without creating a real release:

1. Temporarily modify `src/lib/updater.ts` to simulate an update
2. Run the app: `npm run tauri dev`
3. Go to Settings and click "Check for Updates"

### Testing with Real Release

1. Create a test release (e.g., `v0.1.1-test`)
2. Install the current version on your machine
3. Check for updates - you should see the new version

## Update Flow

```
App Starts → Wait 5s → Check GitHub for latest.json
                                ↓
                         Compare versions
                                ↓
           ┌────────────────────┴────────────────────┐
           ↓                                         ↓
    No Update Available                     Update Available
           ↓                                         ↓
    Silent (no UI)                          Show Dialog
                                                     ↓
                                           User Accepts?
                                                     ↓
                                            Download & Install
                                                     ↓
                                            Restart Prompt
```

## User Data Preservation

The updater automatically preserves all user data:
- **IndexedDB**: Stored in app data directory (persists across updates)
- **localStorage**: Browser storage (persists across updates)
- **Library Files**: Stored in user-selected location (never touched by updater)
- **Settings**: All settings persist

## Troubleshooting

### "Failed to verify signature"
- Ensure public key in `tauri.conf.json` matches your private key
- Verify GitHub secrets are set correctly

### "No update available" when one exists
- Check that `endpoints` URL in `tauri.conf.json` is correct
- Verify GitHub release has `latest.json` file
- Ensure version in `tauri.conf.json` is lower than release version

### Updates not working on Windows
- Ensure `installMode` is set to `"passive"` in updater config
- Check Windows Defender isn't blocking the installer

## Configuration Reference

### tauri.conf.json

```json
{
  "plugins": {
    "updater": {
      "active": true,  // Enable/disable updater
      "endpoints": [   // Where to check for updates
        "https://github.com/USER/REPO/releases/latest/download/latest.json"
      ],
      "dialog": true,  // Use built-in dialogs (we override with custom UI)
      "pubkey": "...", // Your public key
      "windows": {
        "installMode": "passive"  // Silent install on Windows
      }
    }
  }
}
```

## Manual Download Page

For users who prefer manual installation, create a simple webpage:

**index.html**:
```html
<!DOCTYPE html>
<html>
<head>
  <title>Download DrawStack</title>
</head>
<body>
  <h1>Download DrawStack</h1>
  <p>Latest version: <a href="https://github.com/darrenk196/draw-stack-app/releases/latest">View on GitHub</a></p>
  
  <h2>Windows</h2>
  <a href="https://github.com/darrenk196/draw-stack-app/releases/latest/download/DrawStack_x64-setup.exe">
    Download for Windows
  </a>
  
  <h2>macOS</h2>
  <a href="https://github.com/darrenk196/draw-stack-app/releases/latest/download/DrawStack_universal.dmg">
    Download for macOS
  </a>
  
  <h2>Linux</h2>
  <a href="https://github.com/darrenk196/draw-stack-app/releases/latest/download/DrawStack_amd64.AppImage">
    Download for Linux
  </a>
</body>
</html>
```

Host this on GitHub Pages, Netlify, or any static hosting service.

## Security Notes

1. **Never commit private keys**: They're in `.gitignore`, but double-check
2. **Use GitHub Secrets**: Don't hardcode keys anywhere
3. **HTTPS Only**: The updater only works over HTTPS (GitHub releases are HTTPS)
4. **Signature Verification**: Every update is cryptographically verified before installation

## Next Steps

1. Generate your signing keys
2. Update `tauri.conf.json` with your public key
3. Add GitHub secrets
4. Test with a `v0.1.1` release
5. Set up a download page for manual installations

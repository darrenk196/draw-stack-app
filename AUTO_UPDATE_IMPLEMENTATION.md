# Auto-Update Implementation Summary

## What Was Added

### Frontend Code

1. **src/lib/updater.ts** - New updater library

   - `checkForUpdates(silent)` - Check and optionally install updates
   - `checkForUpdatesOnStartup()` - Background check on app launch
   - User-friendly dialogs for update notifications and progress

2. **src/routes/+layout.svelte** - Startup integration

   - Calls `checkForUpdatesOnStartup()` on app launch
   - Waits 5 seconds after startup to avoid blocking initial load
   - Silent check (only shows UI if update available)

3. **src/routes/settings/+page.svelte** - Manual update check
   - Added "Check for Updates" button in About section
   - User can manually trigger update check anytime

### Backend Code

4. **src-tauri/Cargo.toml** - Rust dependencies

   - Added `tauri-plugin-updater = "2"`
   - Added `tauri-plugin-process = "2"`

5. **src-tauri/src/lib.rs** - Plugin registration

   - Registered updater plugin
   - Registered process plugin (for app restart)

6. **src-tauri/tauri.conf.json** - Updater configuration
   - Enabled updater with GitHub endpoint
   - Configured Windows passive installation
   - Added placeholder for public key (needs replacement)

### Build & Deploy

7. **.github/workflows/release.yml** - CI/CD pipeline
   - Builds for Windows, macOS, Linux
   - Signs installers with private key
   - Creates GitHub releases automatically
   - Triggered by version tags (e.g., `v0.2.0`)

### Documentation

8. **AUTO_UPDATE_SETUP.md** - Complete setup guide
   - Key generation instructions
   - GitHub secrets configuration
   - Release workflow
   - Troubleshooting tips

## Next Steps (Required Before First Release)

### 1. Generate Signing Keys (One-Time)

```bash
npm run tauri signer generate
```

Save the output:

- Public key → update `src-tauri/tauri.conf.json`
- Private key → add to GitHub secrets as `TAURI_SIGNING_PRIVATE_KEY`
- Password → add to GitHub secrets as `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

### 2. Update Configuration

Edit `src-tauri/tauri.conf.json`:

```json
"pubkey": "YOUR_ACTUAL_PUBLIC_KEY_HERE"
```

### 3. Add GitHub Secrets

Go to: https://github.com/darrenk196/draw-stack-app/settings/secrets/actions

Add:

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

### 4. Test the System

Create a test release:

```bash
# Bump version to 0.1.1 in:
# - src-tauri/tauri.conf.json
# - package.json
# - src/routes/settings/+page.svelte (APP_VERSION)

git add -A
git commit -m "chore: bump version to 0.1.1"
git tag v0.1.1
git push origin v0.1.1
```

GitHub Actions will build and release automatically.

## How It Works

### For Users

1. **Automatic**: App checks for updates 5 seconds after launch
2. **Non-Intrusive**: Only shows dialog if update is available
3. **One-Click**: User clicks "Yes" to download and install
4. **Seamless**: Data persists across updates (IndexedDB, localStorage, library files)

### For Developers

1. **Simple Releases**: Just create a git tag with version number
2. **Automated Builds**: GitHub Actions builds all platforms
3. **Signed Installers**: Cryptographic signatures ensure authenticity
4. **GitHub Hosting**: Releases hosted on GitHub (free, reliable)

## User Data Safety

All user data is preserved during updates:

- ✅ **IndexedDB** (images, tags, packs) - Stored in app data directory
- ✅ **localStorage** (settings, preferences) - Browser storage
- ✅ **Library Files** - User-selected location (never modified)
- ✅ **Custom Categories** - Stored in localStorage

The updater only replaces the application executable, not user data.

## Architecture

```
User Machine                    GitHub
┌─────────────┐                ┌──────────────┐
│  DrawStack  │                │   Releases   │
│    v0.1.0   │───Check────────▶│              │
│             │                │ latest.json  │
│             │◀──Response─────│ v0.2.0 info  │
│             │                │              │
│  [Dialog]   │                │              │
│  Update to  │                │              │
│  v0.2.0?    │                │              │
│  [Yes] [No] │                │              │
│             │                │              │
│             │───Download─────▶│ installer    │
│             │                │ + signature  │
│             │◀──Package──────│              │
│             │                └──────────────┘
│  Verify     │
│  Signature  │
│             │
│  Install    │
│  v0.2.0     │
│             │
│  [Restart?] │
└─────────────┘
```

## Testing

### Development Testing

You can test the update UI without real releases by mocking the check:

```typescript
// Temporarily in updater.ts for testing
export async function checkForUpdates(silent: boolean = false) {
  // Force show dialog for testing
  const shouldUpdate = await ask(
    `Update available: 0.2.0\n\nCurrent version: 0.1.0\n\n...`,
    { title: "Update Available", kind: "info" }
  );
  // ... rest of mock logic
}
```

### Production Testing

1. Install v0.1.0 on a test machine
2. Create v0.1.1 release
3. Launch app, wait 5 seconds
4. Should see update dialog

## Comparison to Other Systems

### Blender-Style (Requested)

- ✅ Users download installer from website
- ✅ Installer detects and updates existing version
- ✅ User data preserved automatically
- ✅ Simple version bumps for releases

### Electron Auto-Update

- Similar concept, but Tauri is more lightweight
- Both use GitHub releases
- Both require code signing

### Manual Updates Only

- ❌ Users must check website manually
- ❌ More friction to update
- ❌ Lower adoption of new versions

## Files Modified

- `src/lib/updater.ts` (new)
- `src/routes/+layout.svelte`
- `src/routes/settings/+page.svelte`
- `src-tauri/Cargo.toml`
- `src-tauri/src/lib.rs`
- `src-tauri/tauri.conf.json`
- `package.json`
- `.github/workflows/release.yml` (new)
- `AUTO_UPDATE_SETUP.md` (new)

## Security Considerations

1. **Code Signing**: All updates are cryptographically signed
2. **HTTPS Only**: GitHub releases use HTTPS
3. **Signature Verification**: App verifies signature before installing
4. **Private Key Security**: Stored only in GitHub secrets
5. **No Telemetry**: Update checks don't send user data

## Maintenance

### Regular Releases

```bash
# 1. Bump versions
# 2. Commit changes
git add -A
git commit -m "chore: bump version to X.Y.Z"

# 3. Create tag
git tag vX.Y.Z

# 4. Push tag (triggers build)
git push origin vX.Y.Z
```

### Emergency Fixes

If a release has issues:

1. Fix the code
2. Bump to next patch version (e.g., 0.1.1 → 0.1.2)
3. Create new release
4. Users will auto-update to fixed version

### Rollback

Not directly supported, but you can:

1. Create a new release with previous version's code
2. Bump version higher (e.g., 0.1.3 with 0.1.1 code)
3. Users update to "new" (reverted) version

## Future Enhancements

Potential improvements:

- [ ] Update size display in dialog
- [ ] Detailed changelog in update dialog
- [ ] Beta/stable channel support
- [ ] Download progress bar
- [ ] Scheduled update checks (daily, weekly)
- [ ] "Skip this version" option
- [ ] Offline installer availability

## Support

For issues or questions:

1. Check `AUTO_UPDATE_SETUP.md` troubleshooting section
2. Verify GitHub Actions logs: https://github.com/darrenk196/draw-stack-app/actions
3. Check Tauri updater docs: https://v2.tauri.app/plugin/updater/

---

**Status**: ✅ Implementation complete, ready for key generation and first release

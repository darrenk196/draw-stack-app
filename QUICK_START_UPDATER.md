# Quick Start: Auto-Update System

## You're All Set! 🎉

The auto-updater has been fully implemented. Here's what you need to do next:

## Step 1: Generate Signing Keys (Do This Once)

Open a terminal and run:

```bash
npm run tauri signer generate
```

You'll see output like this:

```
Private Key: dW50cnVzdGVkIGNvbW1lbnQ6...
Public Key: dW50cnVzdGVkIGNvbW1lbnQ6...
Password: (your optional password)
```

**IMPORTANT**: Save both keys somewhere safe!

## Step 2: Update Config File

1. Copy the **Public Key** from above
2. Open `src-tauri/tauri.conf.json`
3. Find this line:
   ```json
   "pubkey": "YOUR_PUBLIC_KEY_WILL_GO_HERE",
   ```
4. Replace with your actual public key:
   ```json
   "pubkey": "dW50cnVzdGVkIGNvbW1lbnQ6...",
   ```
5. Save the file

## Step 3: Add GitHub Secrets

1. Go to: https://github.com/darrenk196/draw-stack-app/settings/secrets/actions
2. Click "New repository secret"
3. Add two secrets:
   - Name: `TAURI_SIGNING_PRIVATE_KEY`
     Value: Your private key (the long string)
   - Name: `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
     Value: Your password (if you set one, otherwise leave this empty)

## Step 4: Create Your First Release

When you're ready to release:

```bash
# 1. Update version numbers in these 3 files:
#    - src-tauri/tauri.conf.json → "version": "0.1.1"
#    - package.json → "version": "0.1.1"
#    - src/routes/settings/+page.svelte → APP_VERSION = "0.1.1"

# 2. Commit the version changes
git add -A
git commit -m "chore: bump version to 0.1.1"

# 3. Create and push a version tag
git tag v0.1.1
git push origin v0.1.1
```

That's it! GitHub Actions will automatically:

- Build installers for Windows, macOS, and Linux
- Sign them with your private key
- Create a release on GitHub
- Users will be notified of the update

## How Users Will Experience It

1. **On App Launch**: After 5 seconds, app silently checks for updates
2. **If Update Available**: Dialog appears: "Update available: X.Y.Z. Would you like to install?"
3. **User Clicks Yes**: Update downloads and installs automatically
4. **After Install**: "Update complete! Restart now?"

Users can also manually check: Settings → About → "Check for Updates"

## Testing the System

Before your first real release, test with a minor version bump:

1. Change version to `0.1.1` (from `0.1.0`)
2. Commit and tag as shown above
3. Wait for GitHub Actions to complete (~10 minutes)
4. Check the Releases page: https://github.com/darrenk196/draw-stack-app/releases
5. Install the current version, then check for updates

## Where to Get Help

- **Detailed Setup**: See `AUTO_UPDATE_SETUP.md`
- **How It Works**: See `AUTO_UPDATE_IMPLEMENTATION.md`
- **Build Logs**: https://github.com/darrenk196/draw-stack-app/actions
- **Tauri Docs**: https://v2.tauri.app/plugin/updater/

## What's Already Done

✅ Frontend update checker with dialogs  
✅ Background update checks on startup  
✅ Manual "Check for Updates" button  
✅ GitHub Actions workflow for builds  
✅ Multi-platform support (Windows, macOS, Linux)  
✅ Automatic code signing  
✅ User data preservation  
✅ Complete documentation

## What You Need to Do

1. ⏳ Generate signing keys
2. ⏳ Update tauri.conf.json with public key
3. ⏳ Add GitHub secrets
4. ⏳ Test with v0.1.1 release

That's it! Once you complete these 4 steps, your app will have professional auto-updates just like Blender.

---

**Current Version**: 0.1.0  
**Next Version**: 0.1.1 (for testing)  
**Status**: Ready to generate keys and test

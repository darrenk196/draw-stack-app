import { check } from '@tauri-apps/plugin-updater';
import { ask, message } from '@tauri-apps/plugin-dialog';
import { relaunch } from '@tauri-apps/plugin-process';

export interface UpdateCheckResult {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion?: string;
  error?: string;
}

/**
 * Check for application updates and optionally install them
 * @param silent - If true, only show UI when an update is available
 * @returns Promise with update check result
 */
export async function checkForUpdates(silent: boolean = false): Promise<UpdateCheckResult> {
  try {
    const update = await check();
    
    if (update === null) {
      // No update available
      if (!silent) {
        await message('You are already running the latest version!', {
          title: 'No Update Available',
          kind: 'info'
        });
      }
      
      return {
        updateAvailable: false,
        currentVersion: 'unknown'
      };
    }

    // Update is available
    const shouldUpdate = await ask(
      `Update available: ${update.version}\n\nCurrent version: ${update.currentVersion}\n\nWould you like to download and install it now?\n\nThe app will restart after the update completes.`,
      {
        title: 'Update Available',
        kind: 'info'
      }
    );

    if (shouldUpdate) {
      // Show download progress (this will block until download completes)
      await message('Downloading update...', {
        title: 'Updating',
        kind: 'info'
      });

      // Download and install the update
      await update.downloadAndInstall();

      // Ask user if they want to restart now
      const shouldRestart = await ask(
        'Update installed successfully!\n\nWould you like to restart the app now?',
        {
          title: 'Update Complete',
          kind: 'info'
        }
      );

      if (shouldRestart) {
        await relaunch();
      }

      return {
        updateAvailable: true,
        currentVersion: update.currentVersion,
        latestVersion: update.version
      };
    }

    return {
      updateAvailable: true,
      currentVersion: update.currentVersion,
      latestVersion: update.version
    };

  } catch (error) {
    console.error('Update check failed:', error);
    
    if (!silent) {
      await message(`Failed to check for updates: ${error}`, {
        title: 'Update Error',
        kind: 'error'
      });
    }

    return {
      updateAvailable: false,
      currentVersion: 'unknown',
      error: String(error)
    };
  }
}

/**
 * Check for updates automatically on app start (silent)
 */
export async function checkForUpdatesOnStartup(): Promise<void> {
  // Wait a few seconds after startup to avoid blocking initial load
  setTimeout(async () => {
    await checkForUpdates(true);
  }, 5000);
}

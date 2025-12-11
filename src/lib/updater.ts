/**
 * Auto-updater utilities for Tauri application.
 * Checks for new versions, downloads updates, and handles relaunch.
 * Uses Tauri's plugin-updater for seamless app updates.
 * 
 * @module updater
 */

import { check } from '@tauri-apps/plugin-updater';
import { ask, message } from '@tauri-apps/plugin-dialog';
import { relaunch } from '@tauri-apps/plugin-process';

/**
 * Result of an update check operation.
 */
export interface UpdateCheckResult {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion?: string;
  error?: string;
}

/**
 * Checks for application updates and prompts user to install if available.
 * Downloads and installs the update if user confirms, then offers to relaunch.
 * 
 * @param silent - If true, only show UI when an update is available (default: false)
 * @returns Promise resolving to update check result with version info
 * 
 * @example
 * ```typescript
 * // Manual check with UI
 * await checkForUpdates(false);
 * 
 * // Silent check (only show if update available)
 * await checkForUpdates(true);
 * ```
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
 * Checks for updates automatically on app start in silent mode.
 * Waits 5 seconds after startup to avoid blocking initial load.
 * Only shows UI if an update is available.
 * 
 * @example
 * ```typescript
 * // Call this in app initialization
 * checkForUpdatesOnStartup();
 * ```
 */
export async function checkForUpdatesOnStartup(): Promise<void> {
  // Wait a few seconds after startup to avoid blocking initial load
  setTimeout(async () => {
    await checkForUpdates(true);
  }, 5000);
}

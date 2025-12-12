/**
 * Auto-updater utilities for Tauri application.
 * Provides a streamlined update flow: check → prompt → download → install → restart
 * Displays real-time progress for downloads and installation across all platforms.
 * 
 * @module updater
 */

import { check } from '@tauri-apps/plugin-updater';
import { ask } from '@tauri-apps/plugin-dialog';
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
 * Progress events emitted during the update process.
 * These events provide real-time feedback for UI updates.
 */
export type UpdateProgressEvent =
  | { stage: 'checking'; message: string }
  | { stage: 'available'; message: string; currentVersion: string; latestVersion: string }
  | { stage: 'downloading'; message: string; bytesDownloaded: number; totalBytes: number; percent: number }
  | { stage: 'installing'; message: string }
  | { stage: 'done'; message: string; latestVersion: string }
  | { stage: 'no-update'; message: string }
  | { stage: 'error'; message: string; error: string };

interface CheckForUpdatesOptions {
  silent?: boolean;
  onProgress?: (event: UpdateProgressEvent) => void;
  autoRestart?: boolean; // Automatically restart after successful update
}

/**
 * Legacy update check function - deprecated in favor of checkForUpdatesWithProgress.
 * Kept for backward compatibility.
 * 
 * @deprecated Use checkForUpdatesWithProgress for better UX with progress feedback
 * @param silent - If true, only show UI when an update is available (default: false)
 */
export async function checkForUpdates(
  silent: boolean = false
): Promise<UpdateCheckResult> {
  return checkForUpdatesWithProgress({ silent, autoRestart: false });
}

/**
 * Checks for updates automatically on app start in silent mode.
 * Waits 3 seconds after startup to avoid blocking initial load.
 * Only shows UI if an update is available.
 * 
 * @example
 * ```typescript
 * // Call this in app initialization
 * checkForUpdatesOnStartup();
 * ```
 */
export async function checkForUpdatesOnStartup(): Promise<void> {
  // Wait after startup to avoid blocking initial load
  setTimeout(async () => {
    await checkForUpdatesWithProgress({ silent: true, autoRestart: false });
  }, 3000);
}

/**
 * Check for updates with comprehensive progress tracking and optimal UX.
 * 
 * This is the recommended function for all update checks.
 * Provides real-time feedback during download and installation phases.
 * 
 * Flow:
 * 1. Check GitHub for latest release
 * 2. If update available, prompt user with version info
 * 3. Download with progress callbacks (percent, bytes)
 * 4. Install update automatically
 * 5. Restart app immediately (or prompt based on autoRestart setting)
 * 
 * @param options - Configuration options
 * @param options.silent - If true, only show UI when update is available
 * @param options.onProgress - Callback for progress updates (for custom UI)
 * @param options.autoRestart - If true, restart immediately after install (default: true for manual checks)
 * 
 * @example
 * ```typescript
 * // Manual check from settings with progress UI
 * await checkForUpdatesWithProgress({
 *   silent: false,
 *   onProgress: (event) => {
 *     // Update your UI based on event.stage and event.percent
 *   },
 *   autoRestart: false // Let user choose when to restart
 * });
 * 
 * // Silent background check on startup
 * await checkForUpdatesWithProgress({ silent: true, autoRestart: true });
 * ```
 */
export async function checkForUpdatesWithProgress(
  options: CheckForUpdatesOptions = {}
): Promise<UpdateCheckResult> {
  const { silent = false, onProgress, autoRestart = true } = options;

  // Helper to safely emit progress events
  const emit = (event: UpdateProgressEvent) => {
    try {
      onProgress?.(event);
    } catch (err) {
      console.error('Progress callback error:', err);
    }
  };

  try {
    // Stage 1: Checking for updates
    emit({ stage: 'checking', message: 'Checking for updates…' });
    const update = await check();

    // No update available
    if (update === null) {
      emit({ stage: 'no-update', message: 'You are already on the latest version.' });
      return {
        updateAvailable: false,
        currentVersion: 'unknown'
      };
    }

    // Stage 2: Update available - notify user
    const versionInfo = {
      current: update.currentVersion,
      latest: update.version
    };
    
    emit({
      stage: 'available',
      message: `Update ${update.version} is available`,
      currentVersion: versionInfo.current,
      latestVersion: versionInfo.latest
    });

    // Prompt user to confirm update
    const shouldUpdate = await ask(
      `A new version is available!\n\n` +
      `Current version: ${versionInfo.current}\n` +
      `Latest version: ${versionInfo.latest}\n\n` +
      `Would you like to download and install it now?\n\n` +
      `The app will automatically restart after the update completes.`,
      {
        title: 'Update Available',
        kind: 'info',
        okLabel: 'Yes, Update Now',
        cancelLabel: 'Not Now'
      }
    );

    if (!shouldUpdate) {
      return {
        updateAvailable: true,
        currentVersion: versionInfo.current,
        latestVersion: versionInfo.latest
      };
    }

    // Stage 3: Download with progress tracking
    let downloaded = 0;
    let total = 0;
    
    emit({ 
      stage: 'downloading', 
      message: 'Starting download…', 
      bytesDownloaded: 0, 
      totalBytes: 0, 
      percent: 0 
    });

    await update.downloadAndInstall((event) => {
      switch (event.event) {
        case 'Started': {
          downloaded = 0;
          total = event.data?.contentLength ?? 0;
          emit({
            stage: 'downloading',
            message: `Downloading update (${formatBytes(total)})…`,
            bytesDownloaded: downloaded,
            totalBytes: total,
            percent: 0
          });
          break;
        }
        case 'Progress': {
          const chunk = event.data?.chunkLength ?? 0;
          downloaded += chunk;
          const percent = total > 0 ? (downloaded / total) * 100 : 0;
          emit({
            stage: 'downloading',
            message: `Downloading update (${formatBytes(downloaded)} / ${formatBytes(total)})…`,
            bytesDownloaded: downloaded,
            totalBytes: total,
            percent
          });
          break;
        }
        case 'Finished': {
          // Stage 4: Installing
          emit({
            stage: 'installing',
            message: 'Installing update… This may take a moment.'
          });
          break;
        }
      }
    });

    // Stage 5: Done - update installed
    emit({ 
      stage: 'done', 
      message: 'Update installed successfully!', 
      latestVersion: versionInfo.latest 
    });

    // Restart the app
    if (autoRestart) {
      // Small delay to let user see completion message
      setTimeout(async () => {
        await relaunch();
      }, 1500);
    } else {
      // Ask user if they want to restart now
      const shouldRestart = await ask(
        'Update installed successfully!\n\nWould you like to restart the app now to use the new version?',
        {
          title: 'Update Complete',
          kind: 'info',
          okLabel: 'Restart Now',
          cancelLabel: 'Restart Later'
        }
      );

      if (shouldRestart) {
        await relaunch();
      }
    }

    return {
      updateAvailable: true,
      currentVersion: versionInfo.current,
      latestVersion: versionInfo.latest
    };

  } catch (error) {
    console.error('Update check failed:', error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    
    emit({ 
      stage: 'error', 
      message: 'Failed to check for updates.', 
      error: errorMsg 
    });

    return {
      updateAvailable: false,
      currentVersion: 'unknown',
      error: errorMsg
    };
  }
}

/**
 * Format bytes to human-readable string (KB, MB, GB)
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

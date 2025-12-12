/**
 * Manual update checker for DrawStack.
 * Fetches latest release info from GitHub API and provides download links.
 * No auto-download or signing—user manually downloads and installs.
 * 
 * @module updater
 */

import { getVersion } from '@tauri-apps/api/app';
import { invoke } from '@tauri-apps/api/core';

const GITHUB_REPO = 'darrenk196/draw-stack-app';
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

export interface UpdateCheckResult {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion?: string;
  releaseUrl?: string;
  downloadLinks?: DownloadLinks;
  releaseNotes?: string;
  error?: string;
}

export interface DownloadLinks {
  windows?: string;
  macosIntel?: string;
  macosArm?: string;
  linux?: string;
}

interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string;
  assets: GitHubAsset[];
  html_url: string;
}

interface GitHubAsset {
  name: string;
  browser_download_url: string;
}

/**
 * Compare semantic versions (e.g., "1.0.3" vs "1.0.4")
 * Returns: 1 if v1 > v2, -1 if v1 < v2, 0 if equal
 */
function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);
  
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  return 0;
}

/**
 * Extract download links from GitHub release assets
 */
function extractDownloadLinks(assets: GitHubAsset[], tagName: string): DownloadLinks {
  const links: DownloadLinks = {};
  
  assets.forEach(asset => {
    if (asset.name.includes('x64_en-US.msi') && !asset.name.endsWith('.sig')) {
      links.windows = asset.browser_download_url;
    } else if (asset.name.includes('x64.dmg') && !asset.name.endsWith('.sig')) {
      links.macosIntel = asset.browser_download_url;
    } else if (asset.name.includes('aarch64.dmg') && !asset.name.endsWith('.sig')) {
      links.macosArm = asset.browser_download_url;
    } else if (asset.name.includes('amd64.AppImage') && !asset.name.endsWith('.sig')) {
      links.linux = asset.browser_download_url;
    }
  });
  
  return links;
}

/**
 * Check for updates by fetching the latest release from GitHub
 * Returns version info and download links (no auto-download)
 */
export async function checkForUpdatesManual(): Promise<UpdateCheckResult> {
  try {
    // Get current app version
    let currentVersion = 'unknown';
    try {
      currentVersion = await getVersion();
    } catch (err) {
      console.error('Failed to get current version:', err);
    }

    // Fetch latest release from GitHub API
    const response = await fetch(GITHUB_API_URL);
    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    const release: GitHubRelease = await response.json();
    const latestVersion = release.tag_name.replace(/^v/, ''); // Remove 'v' prefix if present

    // Compare versions
    const isNewer = compareVersions(latestVersion, currentVersion) > 0;

    if (!isNewer) {
      return {
        updateAvailable: false,
        currentVersion,
        latestVersion,
      };
    }

    // Extract download links from assets
    const downloadLinks = extractDownloadLinks(release.assets, release.tag_name);

    return {
      updateAvailable: true,
      currentVersion,
      latestVersion,
      releaseUrl: release.html_url,
      downloadLinks,
      releaseNotes: release.body,
      error: undefined,
    };
  } catch (error) {
    console.error('Failed to check for updates:', error);
    return {
      updateAvailable: false,
      currentVersion: 'unknown',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Open a download link in the default browser
 */
export async function openDownloadLink(url: string): Promise<void> {
  try {
    // Try using the opener plugin via invoke (Tauri v2)
    await invoke('plugin:opener|open', { path: url });
  } catch (_) {
    // Fallback to browser open for dev/HMR or if plugin not available
    try {
      window.open(url, '_blank');
    } catch (error) {
      console.error('Failed to open download link:', error);
      throw error;
    }
  }
}

/**
 * Open the release page in the default browser
 */
export async function openReleaseNotes(releaseUrl: string): Promise<void> {
  try {
    await invoke('plugin:opener|open', { path: releaseUrl });
  } catch (_) {
    try {
      window.open(releaseUrl, '_blank');
    } catch (error) {
      console.error('Failed to open release page:', error);
      throw error;
    }
  }
}

/**
 * Check for updates on app startup (silent mode)
 * Can optionally call a callback if an update is available
 */
export async function checkForUpdatesOnStartup(onUpdateAvailable?: (result: UpdateCheckResult) => void): Promise<void> {
  // Wait after startup to avoid blocking initial load
  setTimeout(async () => {
    try {
      const result = await checkForUpdatesManual();
      if (result.updateAvailable && onUpdateAvailable) {
        onUpdateAvailable(result);
      }
    } catch (error) {
      console.error('Background update check failed:', error);
    }
  }, 3000);
}

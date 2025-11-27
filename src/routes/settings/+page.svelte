<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { open, save } from "@tauri-apps/plugin-dialog";
  import { toast } from "$lib/toast";
  import { getLibraryImages, getAllTags, clearAllData } from "$lib/db";
  import { onMount } from "svelte";

  let libraryPath = $state("");
  let defaultLibraryPath = $state("");
  let imageCount = $state(0);
  let tagCount = $state(0);
  let isLoading = $state(true);

  const APP_VERSION = "0.1.0-beta";

  onMount(async () => {
    await loadSettings();
    await loadStats();
    isLoading = false;
  });

  async function loadSettings() {
    try {
      libraryPath = await invoke<string>("get_library_path");
      defaultLibraryPath = await invoke<string>("get_default_library_path");
    } catch (error) {
      console.error("Failed to load settings:", error);
      toast.error("Failed to load settings");
    }
  }

  async function loadStats() {
    try {
      const images = await getLibraryImages();
      const tags = await getAllTags();
      imageCount = images.length;
      tagCount = tags.length;
    } catch (error) {
      console.error("Failed to load stats:", error);
    }
  }

  async function browseLibraryPath() {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Select Library Location",
    });

    if (selected && typeof selected === "string") {
      try {
        await invoke("set_library_path", { path: selected });
        libraryPath = selected;
        toast.success("Library path updated");
      } catch (error) {
        console.error("Failed to set library path:", error);
        toast.error(`Failed to set library path: ${error}`);
      }
    }
  }

  async function resetToDefault() {
    if (
      !confirm(
        "Reset library path to default? This will not delete your existing images."
      )
    ) {
      return;
    }

    try {
      await invoke("set_library_path", { path: defaultLibraryPath });
      libraryPath = defaultLibraryPath;
      toast.success("Library path reset to default");
    } catch (error) {
      console.error("Failed to reset library path:", error);
      toast.error("Failed to reset library path");
    }
  }

  async function clearLibrary() {
    if (
      !confirm(
        `Delete all ${imageCount} images and ${tagCount} tags from your library? This cannot be undone!`
      )
    ) {
      return;
    }

    const confirmation = prompt(
      'Type "DELETE" to confirm clearing your entire library:'
    );
    if (confirmation !== "DELETE") {
      toast.info("Library clear cancelled");
      return;
    }

    try {
      await clearAllData();
      await loadStats();
      window.dispatchEvent(new CustomEvent("library-updated"));
      toast.success("Library cleared successfully");
    } catch (error) {
      console.error("Failed to clear library:", error);
      toast.error("Failed to clear library");
    }
  }

  async function exportLibrary() {
    try {
      const images = await getLibraryImages();
      const tags = await getAllTags();

      const exportData = {
        version: APP_VERSION,
        exportDate: new Date().toISOString(),
        images,
        tags,
      };

      const filePath = await save({
        defaultPath: `library-backup-${Date.now()}.json`,
        filters: [
          {
            name: "JSON",
            extensions: ["json"],
          },
        ],
      });

      if (filePath) {
        await invoke("write_file", {
          path: filePath,
          contents: JSON.stringify(exportData, null, 2),
        });
        toast.success("Library exported successfully");
      }
    } catch (error) {
      console.error("Failed to export library:", error);
      toast.error("Failed to export library");
    }
  }
</script>

<div class="h-full overflow-auto bg-base-100">
  <div class="max-w-4xl mx-auto p-8">
    <div class="mb-8">
      <h1 class="text-3xl font-bold mb-2">Settings</h1>
      <p class="text-base-content/70">Configure your Draw Stack preferences</p>
    </div>

    {#if isLoading}
      <div class="flex items-center justify-center py-12">
        <span class="loading loading-spinner loading-lg"></span>
      </div>
    {:else}
      <!-- Library Location -->
      <div class="card bg-base-200 mb-6">
        <div class="card-body">
          <h2 class="card-title text-xl mb-4">Library Location</h2>

          <div class="form-control mb-4">
            <label class="label" for="library-path-input">
              <span class="label-text">Current Library Path</span>
            </label>
            <div class="flex gap-2">
              <input
                id="library-path-input"
                type="text"
                class="input input-bordered flex-1"
                value={libraryPath}
                readonly
              />
              <button class="btn btn-primary" onclick={browseLibraryPath}>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                  />
                </svg>
                Browse
              </button>
            </div>
            <div class="label">
              <span class="label-text-alt text-base-content/60">
                Images are stored in this folder. Changing this will not move
                existing images.
              </span>
            </div>
          </div>

          <button class="btn btn-ghost btn-sm" onclick={resetToDefault}>
            Reset to Default Location
          </button>
        </div>
      </div>

      <!-- Library Statistics -->
      <div class="card bg-base-200 mb-6">
        <div class="card-body">
          <h2 class="card-title text-xl mb-4">Library Statistics</h2>

          <div class="stats shadow bg-base-300">
            <div class="stat">
              <div class="stat-title">Total Images</div>
              <div class="stat-value text-primary">{imageCount}</div>
            </div>

            <div class="stat">
              <div class="stat-title">Total Tags</div>
              <div class="stat-value text-secondary">{tagCount}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Library Management -->
      <div class="card bg-base-200 mb-6">
        <div class="card-body">
          <h2 class="card-title text-xl mb-4">Library Management</h2>

          <div class="flex flex-col gap-3">
            <button class="btn btn-outline gap-2" onclick={exportLibrary}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              Export Library Backup
            </button>

            <div class="divider"></div>

            <div class="alert alert-warning">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-6 w-6 shrink-0 stroke-current"
                fill="none"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <span>
                Clearing your library will permanently delete all images and
                tags. This cannot be undone!
              </span>
            </div>

            <button
              class="btn btn-error gap-2"
              onclick={clearLibrary}
              disabled={imageCount === 0}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
              Clear Library
            </button>
          </div>
        </div>
      </div>

      <!-- About -->
      <div class="card bg-base-200">
        <div class="card-body">
          <h2 class="card-title text-xl mb-4">About</h2>

          <div class="space-y-3">
            <div>
              <p class="font-semibold">Draw Stack</p>
              <p class="text-sm text-base-content/70">
                Version {APP_VERSION}
              </p>
            </div>

            <div class="divider"></div>

            <div>
              <p class="text-sm text-base-content/70">
                A practice timer and reference image manager for artists.
              </p>
            </div>

            <div class="flex gap-2">
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                class="btn btn-sm btn-outline gap-2"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"
                  />
                </svg>
                GitHub
              </a>
            </div>
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>

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

  onMount(() => {
    loadSettings();
    loadStats();
    isLoading = false;

    // Listen for library updates from other pages
    const handleLibraryUpdate = () => {
      loadStats();
    };
    window.addEventListener("library-updated", handleLibraryUpdate);

    return () => {
      window.removeEventListener("library-updated", handleLibraryUpdate);
    };
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

  function restoreDefaultCategories() {
    if (
      !confirm(
        "Restore default tag categories? This will unhide all default categories (Gender, Pose, View Angle, etc.)."
      )
    ) {
      return;
    }

    try {
      // Clear hidden categories to restore defaults
      if (typeof localStorage !== "undefined") {
        localStorage.removeItem("hiddenCategories");
        toast.success(
          "Default categories restored! Refresh the page to see changes."
        );
        // Dispatch event to notify other pages
        window.dispatchEvent(new CustomEvent("categories-restored"));
      }
    } catch (error) {
      console.error("Failed to restore categories:", error);
      toast.error("Failed to restore categories");
    }
  }

  function replayOnboarding() {
    // Dispatch event to show onboarding modal
    window.dispatchEvent(new CustomEvent("replay-onboarding"));
    toast.success("Starting onboarding tutorial...");
  }
</script>

<div class="h-full overflow-auto bg-base-100">
  <div class="max-w-4xl mx-auto p-8">
    <div class="mb-8 flex items-center gap-3">
      <div class="flex-1">
        <h1 class="text-3xl font-bold mb-2">Settings</h1>
        <p class="text-base-content/70">
          Configure your Draw Stack preferences
        </p>
      </div>
      <div class="tooltip tooltip-left" data-tip="Settings help">
        <button class="btn btn-circle btn-ghost" aria-label="Help">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </button>
      </div>
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

            <button
              class="btn btn-outline gap-2"
              onclick={restoreDefaultCategories}
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
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              Restore Default Categories
            </button>

            <button class="btn btn-outline gap-2" onclick={replayOnboarding}>
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
                  d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                />
              </svg>
              Replay Onboarding Tutorial
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

            <div class="divider"></div>

            <div class="alert alert-info">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-5 w-5 shrink-0 stroke-current"
                fill="none"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div class="text-sm">
                <p class="font-semibold mb-1">Beta Version</p>
                <p>
                  This is a beta release intended for testing purposes. Features
                  may change and bugs may be present.
                </p>
              </div>
            </div>

            <div>
              <p class="text-sm text-base-content/70 mb-1">
                Report issues or feedback:
              </p>
              <p class="text-sm font-mono select-all">
                darrenkelly196@gmail.com
              </p>
            </div>
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>

<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { open, save } from "@tauri-apps/plugin-dialog";
  import { toast } from "$lib/toast";
  import {
    getLibraryImages,
    getAllTags,
    clearAllData,
    resetDatabase,
    addImages,
    addTag,
    type Image,
    type Tag,
  } from "$lib/db";
  import {
    ERROR_MESSAGES,
    SUCCESS_MESSAGES,
    validateBackupData,
    validateImage,
    validateTag,
  } from "$lib/errors";
  import { onMount } from "svelte";
  import { checkForUpdates } from "$lib/updater";

  let libraryPath = $state("");
  let defaultLibraryPath = $state("");
  let imageCount = $state(0);
  let tagCount = $state(0);
  let isLoading = $state(true);

  // Progress tracking
  let importProgress = $state({ current: 0, total: 0, label: "" });
  let showImportProgress = $state(false);

  const APP_VERSION = "0.1.2-beta";

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
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("Failed to load settings:", error);
      toast.error(`${ERROR_MESSAGES.SETTINGS_LOAD_FAILED}: ${errorMsg}`);
    }
  }

  async function loadStats() {
    try {
      const images = await getLibraryImages();
      const tags = await getAllTags();
      imageCount = images.length;
      tagCount = tags.length;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("Failed to load stats:", error);
      toast.error(`${ERROR_MESSAGES.DB_QUERY_FAILED}: ${errorMsg}`);
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
        toast.success(SUCCESS_MESSAGES.LIBRARY_PATH_UPDATED);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error("Failed to set library path:", error);
        toast.error(`${ERROR_MESSAGES.SETTINGS_SAVE_FAILED}: ${errorMsg}`);
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
      toast.success(SUCCESS_MESSAGES.LIBRARY_PATH_UPDATED);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("Failed to reset library path:", error);
      toast.error(`${ERROR_MESSAGES.SETTINGS_SAVE_FAILED}: ${errorMsg}`);
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
      toast.info(ERROR_MESSAGES.OPERATION_CANCELLED);
      return;
    }

    try {
      await clearAllData();
      await loadStats();
      window.dispatchEvent(new CustomEvent("library-updated"));
      toast.success(SUCCESS_MESSAGES.LIBRARY_CLEARED);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("Failed to clear library:", error);
      toast.error(`${ERROR_MESSAGES.DB_DELETE_FAILED}: ${errorMsg}`);
    }
  }

  async function handleResetApp() {
    if (
      !confirm(
        "Reset the app to factory defaults? This will delete ALL data including library images, tags, settings, and cached data. The app will reload. This cannot be undone!"
      )
    ) {
      return;
    }

    const confirmation = prompt(
      'Type "RESET" to confirm resetting the entire app:'
    );
    if (confirmation !== "RESET") {
      toast.info(ERROR_MESSAGES.OPERATION_CANCELLED);
      return;
    }

    try {
      await resetDatabase();
      toast.success(SUCCESS_MESSAGES.APP_RESET);
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("Failed to reset app:", error);
      toast.error(`${ERROR_MESSAGES.DB_DELETE_FAILED}: ${errorMsg}`);
    }
  }

  async function handleCheckForUpdates() {
    try {
      await checkForUpdates(false);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("Update check failed:", error);
      toast.error(`Failed to check for updates: ${errorMsg}`);
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
        try {
          await invoke("write_file", {
            path: filePath,
            contents: JSON.stringify(exportData, null, 2),
          });
          toast.success(SUCCESS_MESSAGES.LIBRARY_EXPORTED);
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : String(error);
          console.error("Failed to write export file:", error);
          toast.error(`${ERROR_MESSAGES.FILE_WRITE_FAILED}: ${errorMsg}`);
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("Failed to export library:", error);
      toast.error(`${ERROR_MESSAGES.EXPORT_FAILED}: ${errorMsg}`);
    }
  }

  async function importLibrary() {
    const filePath = await open({
      multiple: false,
      filters: [
        {
          name: "JSON",
          extensions: ["json"],
        },
      ],
    });

    if (!filePath || typeof filePath !== "string") return;

    try {
      // Step 1: Read the file
      let contents: string;
      try {
        contents = await invoke<string>("read_file_contents", {
          path: filePath,
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error("Failed to read file:", error);
        toast.error(`${ERROR_MESSAGES.FILE_READ_FAILED}: ${errorMsg}`);
        return;
      }

      // Step 2: Parse the file
      let importData: any;
      try {
        importData = JSON.parse(contents);
      } catch (error) {
        console.error("Failed to parse JSON:", error);
        toast.error(ERROR_MESSAGES.IMPORT_PARSE_ERROR);
        return;
      }

      // Step 3: Validate the data structure
      const validation = validateBackupData(importData);
      if (!validation.isValid) {
        const errorDetails = validation.errors
          .slice(0, 3)
          .map((e) => `${e.field}: ${e.message}`)
          .join("; ");
        console.error("Validation errors:", validation.errors);
        toast.error(
          `${ERROR_MESSAGES.IMPORT_INVALID_FORMAT}\n${errorDetails}${validation.errors.length > 3 ? `... and ${validation.errors.length - 3} more` : ""}`
        );
        return;
      }

      // Step 4: Confirm with user (with actual count)
      const imageCount = Array.isArray(importData.images)
        ? importData.images.length
        : 0;
      const tagCount = Array.isArray(importData.tags)
        ? importData.tags.length
        : 0;

      const confirm = window.confirm(
        `Import ${imageCount} images and ${tagCount} tags?\n\nThis will add to your existing library. To replace your library completely, clear it first.`
      );

      if (!confirm) {
        toast.info(ERROR_MESSAGES.OPERATION_CANCELLED);
        return;
      }

      // Step 5: Import tags with error handling
      showImportProgress = true;
      const totalItems = importData.tags.length + importData.images.length;
      let processedItems = 0;
      
      let tagsImported = 0;
      let tagsFailed = 0;
      const tagErrors: string[] = [];

      importProgress = {
        current: 0,
        total: totalItems,
        label: "Importing tags",
      };

      for (const tag of importData.tags) {
        try {
          const tagValidation = validateTag(tag);
          if (!tagValidation.isValid) {
            tagsFailed++;
            tagErrors.push(
              `Tag "${tag.name}": ${tagValidation.getErrorMessage()}`
            );
            continue;
          }
          await addTag(tag as Tag);
          tagsImported++;
        } catch (err) {
          tagsFailed++;
          const errorMsg = err instanceof Error ? err.message : String(err);
          if (errorMsg.includes("ConstraintError")) {
            // Tag might already exist, count as duplicate
            tagsImported++;
          } else {
            tagErrors.push(`Tag "${tag.name}": ${errorMsg}`);
          }
          console.warn("Failed to import tag:", tag.name, err);
        }
        processedItems++;
        importProgress = { ...importProgress, current: processedItems };
      }

      // Step 6: Import images with error handling and validation
      importProgress = {
        ...importProgress,
        label: "Importing images",
      };
      
      const validImages: Image[] = [];
      const imageErrors: string[] = [];

      for (const img of importData.images) {
        const imgValidation = validateImage(img);
        if (!imgValidation.isValid) {
          imageErrors.push(
            `Image "${img.filename}": ${imgValidation.getErrorMessage()}`
          );
          continue;
        }
        validImages.push(img as Image);
      }

      let imagesImported = 0;
      let imagesFailed = 0;

      if (validImages.length > 0) {
        try {
          const result = await addImages(validImages);
          imagesImported = result.success + result.duplicates;
          imagesFailed = result.failed;

          // Add any errors from transaction to our list
          if (result.errors.length > 0) {
            result.errors.forEach((err) => {
              imageErrors.push(`Image ${err.itemId}: ${err.error}`);
            });
          }
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : String(error);
          console.error("Failed to import images:", error);
          toast.error(`${ERROR_MESSAGES.IMPORT_PARTIAL_SUCCESS}\n${errorMsg}`);
          imagesFailed = validImages.length;
        }
      }

      // Step 7: Reload stats and notify user
      showImportProgress = false;
      await loadStats();
      window.dispatchEvent(new CustomEvent("library-updated"));

      // Provide detailed feedback
      if (imagesFailed === 0 && tagsFailed === 0) {
        toast.success(
          `${SUCCESS_MESSAGES.LIBRARY_IMPORTED}\n${imagesImported} images and ${tagsImported} tags added`
        );
      } else {
        const details = [];
        if (imagesImported > 0)
          details.push(`${imagesImported} images imported`);
        if (tagsImported > 0) details.push(`${tagsImported} tags imported`);
        if (imagesFailed > 0) details.push(`${imagesFailed} images failed`);
        if (tagsFailed > 0) details.push(`${tagsFailed} tags failed`);

        const message =
          imagesFailed > 0 || tagsFailed > 0
            ? `${ERROR_MESSAGES.IMPORT_PARTIAL_SUCCESS}\n${details.join(", ")}`
            : `${SUCCESS_MESSAGES.LIBRARY_IMPORTED}\n${details.join(", ")}`;

        toast.success(message);

        // Log errors for debugging
        if (imageErrors.length > 0 || tagErrors.length > 0) {
          console.warn("Import errors:", { imageErrors, tagErrors });
        }
      }
    } catch (error) {
      showImportProgress = false;
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("Failed to import library:", error);
      toast.error(`${ERROR_MESSAGES.IMPORT_FAILED}\n${errorMsg}`);
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

<div
  class="h-full overflow-auto bg-gradient-to-b from-cream via-white to-warm-beige/30"
>
  <div class="max-w-4xl mx-auto p-8 space-y-6">
    <div class="mb-4 flex items-center gap-3">
      <div class="flex-1">
        <h1 class="text-3xl font-bold text-warm-charcoal mb-2">Settings</h1>
        <p class="text-warm-gray">Configure your Draw Stack preferences</p>
      </div>
      <div class="tooltip tooltip-left" data-tip="Settings help">
        <button
          class="btn btn-circle action-ghost text-warm-gray"
          aria-label="Help"
        >
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
      <div class="glass-card card mb-6">
        <div class="card-body space-y-4">
          <h2 class="card-title text-xl text-warm-charcoal mb-4">
            Library Location
          </h2>

          <div class="form-control mb-4">
            <label class="label" for="library-path-input">
              <span class="label-text">Current Library Path</span>
            </label>
            <div class="flex gap-2">
              <input
                id="library-path-input"
                type="text"
                class="input-soft flex-1"
                value={libraryPath}
                readonly
              />
              <button class="action-primary gap-2" onclick={browseLibraryPath}>
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
              <span class="label-text-alt text-warm-gray">
                Images are stored in this folder. Changing this will not move
                existing images.
              </span>
            </div>
          </div>

          <button class="action-secondary btn-sm" onclick={resetToDefault}>
            Reset to Default Location
          </button>
        </div>
      </div>

      <!-- Library Statistics -->
      <div class="glass-card card mb-6">
        <div class="card-body space-y-4">
          <h2 class="card-title text-xl text-warm-charcoal mb-4">
            Library Statistics
          </h2>

          <div class="stat-card p-4 grid grid-cols-2 gap-4">
            <div class="stat">
              <div class="stat-title text-warm-gray">Total Images</div>
              <div class="stat-value text-terracotta">{imageCount}</div>
            </div>

            <div class="stat">
              <div class="stat-title text-warm-gray">Total Tags</div>
              <div class="stat-value text-terracotta">{tagCount}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Library Management -->
      <div class="glass-card card mb-6">
        <div class="card-body space-y-4">
          <div class="flex items-center justify-between">
            <h2 class="card-title text-xl">Library Management</h2>
            <span class="section-label">Library</span>
          </div>

          <div class="flex flex-col gap-3">
            <button class="action-secondary gap-2" onclick={exportLibrary}>
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

            <button class="action-secondary gap-2" onclick={importLibrary}>
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
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                />
              </svg>
              Import Library Backup
            </button>

            <button
              class="action-secondary gap-2"
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

            <button class="action-secondary gap-2" onclick={replayOnboarding}>
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

            <div
              class="alert bg-warm-beige/60 border border-warm-beige text-warm-charcoal"
            >
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
              class="action-error disabled:!bg-warm-beige disabled:!border-warm-beige disabled:!text-warm-charcoal disabled:!shadow-none"
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

          <div class="divider"></div>

          <div>
            <h3 class="font-semibold text-warm-charcoal mb-2">
              Reset App to Factory Defaults
            </h3>
            <p class="text-sm text-warm-gray mb-3">
              Reset the entire app including all data, settings, and cache. Use
              this for a fresh start or to troubleshoot issues.
            </p>
            <button
              class="action-error disabled:!bg-warm-beige disabled:!border-warm-beige disabled:!text-warm-charcoal disabled:!shadow-none"
              onclick={handleResetApp}
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
              Reset App
            </button>
          </div>
        </div>
      </div>

      <!-- About -->
      <div class="glass-card card">
        <div class="card-body space-y-4">
          <div class="flex items-center justify-between">
            <h2 class="card-title text-xl text-warm-charcoal">About</h2>
            <span class="section-label">Build</span>
          </div>

          <div class="space-y-3">
            <div>
              <p class="font-semibold text-warm-charcoal">Draw Stack</p>
              <p class="text-sm text-warm-gray">
                Version {APP_VERSION}
              </p>
              <p class="text-xs text-warm-gray">Auto-update test build 0.1.2</p>
            </div>

            <div class="divider"></div>

            <button
              onclick={handleCheckForUpdates}
              class="action-primary w-full"
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
              Check for Updates
            </button>

            <div class="divider"></div>

            <div>
              <p class="text-sm text-warm-gray">
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
              <p class="text-sm text-warm-gray mb-1">
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

<!-- Import Progress Modal -->
{#if showImportProgress}
  <div
    class="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-8"
    role="status"
    aria-live="polite"
  >
    <div class="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
      <div class="mb-4">
        <h3 class="text-lg font-bold mb-2 text-warm-charcoal">
          {importProgress.label}
        </h3>
        <p class="text-warm-gray text-sm">
          Processing {importProgress.current} of {importProgress.total}
        </p>
      </div>
      
      <!-- Progress Bar -->
      <div class="w-full bg-warm-beige/30 rounded-full h-3 overflow-hidden">
        <div
          class="bg-terracotta h-full transition-all duration-300 rounded-full"
          style="width: {importProgress.total > 0
            ? (importProgress.current / importProgress.total) * 100
            : 0}%"
        ></div>
      </div>
      
      <div class="mt-3 text-right text-sm text-warm-gray">
        {Math.round(
          (importProgress.current / importProgress.total) * 100
        )}% complete
      </div>
    </div>
  </div>
{/if}

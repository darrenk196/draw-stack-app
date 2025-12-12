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
    getSettings,
    updateSettings,
    DEFAULT_SETTINGS,
    findDuplicateTags,
    mergeTags,
    type Image,
    type Tag,
    type AppSettings,
    type DuplicateTagGroup,
  } from "$lib/db";
  import {
    ERROR_MESSAGES,
    SUCCESS_MESSAGES,
    validateBackupData,
    validateImage,
    validateTag,
  } from "$lib/errors";
  import { onMount } from "svelte";
  import {
    checkForUpdatesWithProgress,
    type UpdateProgressEvent,
  } from "$lib/updater";

  let libraryPath = $state("");
  let defaultLibraryPath = $state("");
  let imageCount = $state(0);
  let tagCount = $state(0);
  let isLoading = $state(true);

  // Progress tracking
  let importProgress = $state({ current: 0, total: 0, label: "" });
  let showImportProgress = $state(false);

  // App preferences
  let appSettings = $state<AppSettings>({ ...DEFAULT_SETTINGS });

  // Updater progress UI
  type UpdateStage =
    | "idle"
    | "checking"
    | "available"
    | "downloading"
    | "installing"
    | "no-update"
    | "done"
    | "error";

  let showUpdateProgress = $state(false);
  let updateStage = $state<UpdateStage>("idle");
  let updateMessage = $state(" ");
  let updatePercent = $state(0);
  let updateBytes = $state({ downloaded: 0, total: 0 });
  let updateVersion = $state<{ current?: string; latest?: string }>({});
  let updateError = $state<string | null>(null);

  // Tag consolidation
  let duplicateTagGroups = $state<DuplicateTagGroup[]>([]);
  let isCheckingDuplicates = $state(false);
  let isMergingTags = $state(false);
  let selectedMergeTarget = $state<Record<string, string>>({}); // normalizedName -> targetTagId

  function shouldConfirm() {
    return appSettings.confirmationDialogStrictness === "always";
  }

  // Storage usage
  interface StorageInfo {
    used_bytes: number;
    used_formatted: string;
    total_bytes: number | null;
    total_formatted: string | null;
    usage_percentage: number | null;
  }
  let storageInfo = $state<StorageInfo | null>(null);

  const APP_VERSION = "1.0.0";

  onMount(() => {
    loadSettings();
    loadStats();
    loadAppSettings();
    loadStorageUsage();
    isLoading = false;

    // Listen for library updates from other pages
    const handleLibraryUpdate = () => {
      loadStats();
      loadStorageUsage();
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

  async function loadAppSettings() {
    try {
      appSettings = await getSettings();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("Failed to load app settings:", error);
      toast.error(`${ERROR_MESSAGES.SETTINGS_LOAD_FAILED}: ${errorMsg}`);
    }
  }

  async function loadStorageUsage() {
    try {
      storageInfo = await invoke<StorageInfo>("get_storage_usage");
    } catch (error) {
      console.error("Failed to load storage usage:", error);
      // Don't show error toast - storage info is optional
    }
  }

  async function saveAppSettings() {
    try {
      await updateSettings(appSettings);
      toast.success("Preferences saved successfully");
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("Failed to save settings:", error);
      toast.error(`${ERROR_MESSAGES.SETTINGS_SAVE_FAILED}: ${errorMsg}`);
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
    if (shouldConfirm()) {
      if (
        !confirm(
          "Reset library path to default? This will not delete your existing images."
        )
      ) {
        return;
      }
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
    if (shouldConfirm()) {
      if (
        !confirm(
          `Delete all ${imageCount} images and ${tagCount} tags from your library? This cannot be undone!`
        )
      ) {
        return;
      }
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
    if (shouldConfirm()) {
      if (
        !confirm(
          "Reset the app to factory defaults? This will delete ALL data including library images, tags, settings, and cached data. The app will reload. This cannot be undone!"
        )
      ) {
        return;
      }
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

  function formatBytes(num: number) {
    if (!num) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    let n = num;
    let i = 0;
    while (n >= 1024 && i < units.length - 1) {
      n /= 1024;
      i++;
    }
    return `${n.toFixed(1)} ${units[i]}`;
  }

  function handleUpdateProgress(event: UpdateProgressEvent) {
    switch (event.stage) {
      case "checking":
        updateStage = "checking";
        updateMessage = event.message;
        updatePercent = 0;
        updateBytes = { downloaded: 0, total: 0 };
        updateError = null;
        break;
      case "available":
        updateStage = "available";
        updateMessage = event.message;
        updateVersion = {
          current: event.currentVersion,
          latest: event.latestVersion,
        };
        break;
      case "downloading":
        updateStage = "downloading";
        updateMessage = event.message;
        updatePercent = event.percent;
        updateBytes = {
          downloaded: event.bytesDownloaded,
          total: event.totalBytes,
        };
        break;
      case "installing":
        updateStage = "installing";
        updateMessage = event.message;
        updatePercent = 100;
        break;
      case "done":
        updateStage = "done";
        updateMessage = event.message;
        updateVersion = { latest: event.latestVersion };
        break;
      case "no-update":
        updateStage = "no-update";
        updateMessage = event.message;
        updatePercent = 0;
        break;
      case "error":
        updateStage = "error";
        updateMessage = event.message;
        updateError = event.error;
        break;
    }
  }

  async function handleCheckForUpdates() {
    showUpdateProgress = true;
    updateStage = "checking";
    updateMessage = "Checking for updates…";
    updateError = null;
    updatePercent = 0;
    updateBytes = { downloaded: 0, total: 0 };

    try {
      await checkForUpdatesWithProgress({
        silent: false,
        onProgress: handleUpdateProgress,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("Update check failed:", error);
      updateStage = "error";
      updateMessage = "Failed to check for updates.";
      updateError = errorMsg;
      toast.error(`Failed to check for updates: ${errorMsg}`);
    }
  }

  async function checkDuplicateTags() {
    isCheckingDuplicates = true;
    try {
      duplicateTagGroups = await findDuplicateTags();
      if (duplicateTagGroups.length === 0) {
        toast.success("No duplicate tags found!");
      } else {
        toast.info(
          `Found ${duplicateTagGroups.length} duplicate tag ${duplicateTagGroups.length === 1 ? "group" : "groups"}`
        );
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("Failed to check for duplicates:", error);
      toast.error(`Failed to check for duplicates: ${errorMsg}`);
    } finally {
      isCheckingDuplicates = false;
    }
  }

  function closeUpdateModal() {
    if (updateStage === "downloading" || updateStage === "installing") {
      return; // prevent closing mid-update to avoid confusion
    }
    showUpdateProgress = false;
  }

  async function mergeSelectedTags(group: DuplicateTagGroup) {
    console.log("mergeSelectedTags called for group:", group);
    console.log("selectedMergeTarget object:", selectedMergeTarget);
    console.log("Looking for normalized name:", group.normalizedName);

    const targetTagId = selectedMergeTarget[group.normalizedName];
    console.log("Target tag ID:", targetTagId);

    if (!targetTagId) {
      console.error("No target tag selected");
      toast.error("Please select a tag to keep");
      return;
    }

    const sourceTagIds = group.tags
      .filter((tag) => tag.id !== targetTagId)
      .map((tag) => tag.id);

    console.log("Source tag IDs to merge:", sourceTagIds);

    if (sourceTagIds.length === 0) {
      console.error("No source tags to merge");
      toast.error("No tags to merge");
      return;
    }

    const targetTag = group.tags.find((tag) => tag.id === targetTagId);
    console.log("Target tag:", targetTag);

    if (!targetTag) {
      console.error("Target tag not found in group");
      toast.error("Target tag not found");
      return;
    }

    if (shouldConfirm()) {
      const tagNames = group.tags
        .filter((tag) => tag.id !== targetTagId)
        .map((tag) => `"${tag.name}"`)
        .join(", ");
      if (
        !confirm(
          `Merge ${tagNames} into "${targetTag.name}"? This will transfer all image associations and cannot be undone.`
        )
      ) {
        return;
      }
    }

    isMergingTags = true;
    console.log("Starting merge operation...");
    try {
      console.log("Calling mergeTags with:", { targetTagId, sourceTagIds });
      await mergeTags(targetTagId, sourceTagIds);
      console.log("Merge completed successfully");
      toast.success(`Successfully merged tags into "${targetTag.name}"`);

      // Refresh duplicate list and stats
      console.log("Refreshing duplicate list and stats...");
      await checkDuplicateTags();
      await loadStats();

      // Dispatch event for other pages
      console.log("Dispatching library-updated event");
      window.dispatchEvent(new CustomEvent("library-updated"));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("Failed to merge tags:", error);
      toast.error(`Failed to merge tags: ${errorMsg}`);
    } finally {
      isMergingTags = false;
      console.log("Merge operation finished");
    }
  }

  async function mergeAllDuplicates() {
    if (duplicateTagGroups.length === 0) {
      toast.error("No duplicates to merge");
      return;
    }

    // Check that all groups have a target selected
    const missingTargets = duplicateTagGroups.filter(
      (group) => !selectedMergeTarget[group.normalizedName]
    );

    if (missingTargets.length > 0) {
      toast.error(
        `Please select a target tag for all ${missingTargets.length} duplicate ${missingTargets.length === 1 ? "group" : "groups"}`
      );
      return;
    }

    if (shouldConfirm()) {
      if (
        !confirm(
          `Merge all ${duplicateTagGroups.length} duplicate tag groups? This cannot be undone.`
        )
      ) {
        return;
      }
    }

    isMergingTags = true;
    let successCount = 0;
    let failCount = 0;

    try {
      for (const group of duplicateTagGroups) {
        try {
          const targetTagId = selectedMergeTarget[group.normalizedName];
          if (!targetTagId) continue;

          const sourceTagIds = group.tags
            .filter((tag) => tag.id !== targetTagId)
            .map((tag) => tag.id);

          if (sourceTagIds.length > 0) {
            await mergeTags(targetTagId, sourceTagIds);
            successCount++;
          }
        } catch (error) {
          console.error(
            `Failed to merge group ${group.normalizedName}:`,
            error
          );
          failCount++;
        }
      }

      if (failCount === 0) {
        toast.success(`Successfully merged all ${successCount} tag groups`);
      } else {
        toast.warning(`Merged ${successCount} groups, ${failCount} failed`);
      }

      // Refresh duplicate list and stats
      await checkDuplicateTags();
      await loadStats();

      // Dispatch event for other pages
      window.dispatchEvent(new CustomEvent("library-updated"));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("Failed to merge duplicates:", error);
      toast.error(`Failed to merge duplicates: ${errorMsg}`);
    } finally {
      isMergingTags = false;
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
    if (shouldConfirm()) {
      if (
        !confirm(
          "Restore default tag categories? This will unhide all default categories (Gender, Pose, View Angle, etc.)."
        )
      ) {
        return;
      }
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
      <div class="settings-card card mb-6">
        <div class="card-body space-y-5">
          <div class="settings-card__header">
            <div class="settings-card__icon" aria-hidden="true">
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
            </div>
            <div class="flex-1 space-y-1">
              <div class="settings-chip">Library</div>
              <h2 class="card-title text-xl text-warm-charcoal">
                Library Location
              </h2>
              <p class="settings-muted">
                Choose where your reference library lives.
              </p>
            </div>
            <span class="settings-chip hidden sm:inline-flex">Path</span>
          </div>

          <div class="settings-section space-y-4">
            <div class="form-control">
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
                <button
                  class="action-primary gap-2"
                  onclick={browseLibraryPath}
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
          </div>

          <div class="flex flex-wrap items-center justify-between gap-3">
            <p class="settings-muted">
              Switch back to the default location if you move files later.
            </p>
            <button class="action-secondary btn-sm" onclick={resetToDefault}>
              Reset to Default Location
            </button>
          </div>
        </div>
      </div>

      <!-- Application Preferences -->
      <div class="settings-card card mb-6">
        <div class="card-body space-y-5">
          <div class="settings-card__header">
            <div class="settings-card__icon" aria-hidden="true">
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
                  d="M12 6v6l4 2"
                />
              </svg>
            </div>
            <div class="flex-1 space-y-1">
              <div class="settings-chip">Experience</div>
              <h2 class="card-title text-xl text-warm-charcoal">
                Application Preferences
              </h2>
              <p class="settings-muted">
                Tune timers, search limits, and confirmation prompts.
              </p>
            </div>
          </div>

          <div class="settings-section space-y-6">
            <!-- Default Timer Duration -->
            <div class="form-control">
              <label class="label" for="timer-duration">
                <span class="label-text font-medium"
                  >Default Timer Duration</span
                >
              </label>
              <div class="flex items-center gap-3">
                <input
                  id="timer-duration"
                  type="number"
                  class="input-soft w-32"
                  min="10"
                  max="3600"
                  step="10"
                  bind:value={appSettings.defaultTimerDuration}
                />
                <span class="text-warm-gray">seconds</span>
              </div>
              <div class="label">
                <span class="label-text-alt text-warm-gray">
                  Default duration for drawing timer sessions (10-3600 seconds)
                </span>
              </div>
            </div>

            <!-- Auto-play Next Image -->
            <div class="form-control">
              <label class="label cursor-pointer justify-start gap-3">
                <input
                  type="checkbox"
                  class="checkbox checkbox-lg border-2 border-black bg-white checked:border-black checked:bg-terracotta [--chkbg:#d46a4e] [--chkfg:#ffffff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
                  bind:checked={appSettings.autoPlayNextImage}
                />
                <div>
                  <span class="label-text font-medium"
                    >Auto-play Next Image</span
                  >
                  <div class="label-text-alt text-warm-gray mt-1">
                    Automatically advance to next image when timer ends
                  </div>
                </div>
              </label>
            </div>

            <!-- Search Result Limit -->
            <div class="form-control">
              <label class="label" for="search-limit">
                <span class="label-text font-medium">Search Result Limit</span>
              </label>
              <select
                id="search-limit"
                class="select-soft w-full max-w-xs"
                bind:value={appSettings.searchResultLimit}
              >
                <option value={50}>50 results</option>
                <option value={100}>100 results</option>
                <option value={200}>200 results</option>
                <option value={500}>500 results</option>
                <option value={1000}>1000 results</option>
              </select>
              <div class="label">
                <span class="label-text-alt text-warm-gray">
                  Maximum number of search results to display
                </span>
              </div>
            </div>

            <!-- Confirmation Dialog Strictness -->
            <div class="form-control">
              <div class="label">
                <span class="label-text font-medium">Confirmation Dialogs</span>
              </div>
              <div class="space-y-2">
                <label class="label cursor-pointer justify-start gap-3">
                  <input
                    type="radio"
                    name="dialog-strictness"
                    class="radio radio-lg border-2 border-black bg-white checked:border-black checked:bg-terracotta [--chkbg:#d46a4e] [--chkfg:#ffffff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
                    value="always"
                    bind:group={appSettings.confirmationDialogStrictness}
                  />
                  <div>
                    <span class="label-text">Always Ask</span>
                    <div class="label-text-alt text-warm-gray">
                      Confirm all actions including minor deletions
                    </div>
                  </div>
                </label>
                <label class="label cursor-pointer justify-start gap-3">
                  <input
                    type="radio"
                    name="dialog-strictness"
                    class="radio radio-lg border-2 border-black bg-white checked:border-black checked:bg-terracotta [--chkbg:#d46a4e] [--chkfg:#ffffff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
                    value="normal"
                    bind:group={appSettings.confirmationDialogStrictness}
                  />
                  <div>
                    <span class="label-text">Normal (Recommended)</span>
                    <div class="label-text-alt text-warm-gray">
                      Confirm important actions only
                    </div>
                  </div>
                </label>
                <label class="label cursor-pointer justify-start gap-3">
                  <input
                    type="radio"
                    name="dialog-strictness"
                    class="radio radio-lg border-2 border-black bg-white checked:border-black checked:bg-terracotta [--chkbg:#d46a4e] [--chkfg:#ffffff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
                    value="minimal"
                    bind:group={appSettings.confirmationDialogStrictness}
                  />
                  <div>
                    <span class="label-text">Minimal</span>
                    <div class="label-text-alt text-warm-gray">
                      Only confirm destructive actions
                    </div>
                  </div>
                </label>
              </div>
            </div>
          </div>

          <div class="settings-divider"></div>

          <div class="flex justify-end">
            <button class="action-primary gap-2" onclick={saveAppSettings}>
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
                  d="M5 13l4 4L19 7"
                />
              </svg>
              Save Preferences
            </button>
          </div>
        </div>
      </div>

      <!-- Library Statistics -->
      <div class="settings-card card mb-6">
        <div class="card-body space-y-5">
          <div class="settings-card__header">
            <div class="settings-card__icon" aria-hidden="true">
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
                  d="M11 11V3a1 1 0 012 0v8m0 0a4 4 0 11-8 0 4 4 0 018 0zm0 0v10a4 4 0 108 0 4 4 0 00-8 0z"
                />
              </svg>
            </div>
            <div class="flex-1 space-y-1">
              <div class="settings-chip">Library Health</div>
              <h2 class="card-title text-xl text-warm-charcoal">
                Library Statistics
              </h2>
              <p class="settings-muted">
                Quick snapshot of your images, tags, and disk usage.
              </p>
            </div>
          </div>

          <div class="settings-section space-y-4">
            <div class="grid grid-cols-2 gap-4">
              <div class="stat-card p-4">
                <div class="stat">
                  <div class="stat-title text-warm-gray">Total Images</div>
                  <div class="stat-value text-terracotta">{imageCount}</div>
                </div>
              </div>
              <div class="stat-card p-4">
                <div class="stat">
                  <div class="stat-title text-warm-gray">Total Tags</div>
                  <div class="stat-value text-terracotta">{tagCount}</div>
                </div>
              </div>
            </div>

            {#if storageInfo}
              <div class="settings-divider"></div>
              <div class="space-y-2">
                <div class="flex items-center justify-between">
                  <span class="text-sm font-medium text-warm-gray">
                    Storage Usage
                  </span>
                  <span class="text-sm text-warm-charcoal">
                    {storageInfo.used_formatted}
                    {#if storageInfo.total_formatted}
                      <span class="text-warm-gray">
                        of {storageInfo.total_formatted}
                      </span>
                    {/if}
                  </span>
                </div>
                {#if storageInfo.usage_percentage !== null}
                  <progress
                    class="progress progress-primary w-full"
                    value={storageInfo.usage_percentage}
                    max="100"
                  ></progress>
                  <div class="text-xs text-warm-gray mt-1 text-right">
                    {storageInfo.usage_percentage.toFixed(1)}% used
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        </div>
      </div>

      <!-- Tag Consolidation -->
      <div class="settings-card card mb-6">
        <div class="card-body space-y-5">
          <div class="settings-card__header">
            <div class="settings-card__icon" aria-hidden="true">
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
                  d="M17 9V7a2 2 0 00-2-2H9a2 2 0 00-2 2v2m0 0H5m2 0h2m6 0h2m0 0h2m-2 0v2m0 0h-2m2 0h2m-2 0v2m0 0h-2m2 0h2"
                />
              </svg>
            </div>
            <div class="flex-1 space-y-1">
              <div class="settings-chip">Tags</div>
              <h2 class="card-title text-xl">Tag Consolidation</h2>
              <p class="settings-muted">
                Find and merge duplicate tags to keep your taxonomy tidy.
              </p>
            </div>
          </div>

          <div class="settings-section space-y-4">
            <p class="text-sm text-warm-gray">
              Case-insensitive scanning for duplicates (e.g., "Female" and
              "female").
            </p>

            <div class="flex flex-wrap gap-3">
              <button
                class="action-secondary gap-2"
                onclick={checkDuplicateTags}
                disabled={isCheckingDuplicates}
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
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                {isCheckingDuplicates ? "Checking..." : "Find Duplicate Tags"}
              </button>

              {#if duplicateTagGroups.length > 0}
                <button
                  class="action-primary text-sm px-4 py-2"
                  onclick={mergeAllDuplicates}
                  disabled={isMergingTags ||
                    Object.keys(selectedMergeTarget).length !==
                      duplicateTagGroups.length}
                >
                  {isMergingTags ? "Merging..." : "Merge All"}
                </button>
              {/if}
            </div>

            {#if duplicateTagGroups.length > 0}
              <div class="settings-divider"></div>
              <div class="space-y-4">
                <div class="flex items-center justify-between">
                  <p class="text-sm font-semibold text-warm-charcoal">
                    Found {duplicateTagGroups.length} duplicate {duplicateTagGroups.length ===
                    1
                      ? "group"
                      : "groups"}
                  </p>
                </div>

                <div class="space-y-3 max-h-96 overflow-y-auto">
                  {#each duplicateTagGroups as group}
                    <div
                      class="p-4 bg-warm-sand rounded-lg border border-warm-beige space-y-3 shadow-[0_10px_28px_rgba(62,57,51,0.06)]"
                    >
                      <div class="flex items-start justify-between">
                        <div class="flex-1">
                          <p class="font-semibold text-warm-charcoal mb-1">
                            "{group.normalizedName}"
                          </p>
                          <p class="text-xs text-warm-gray">
                            {group.imageCount} image{group.imageCount === 1
                              ? ""
                              : "s"} • {group.tags.length} duplicate{group.tags
                              .length === 1
                              ? ""
                              : "s"}
                          </p>
                        </div>
                        <button
                          class="action-secondary text-sm px-3 py-1"
                          onclick={() => {
                            console.log("Merge button clicked!");
                            console.log(
                              "Button state - isMergingTags:",
                              isMergingTags
                            );
                            console.log(
                              "Button state - has target:",
                              !!selectedMergeTarget[group.normalizedName]
                            );
                            mergeSelectedTags(group);
                          }}
                          disabled={isMergingTags ||
                            !selectedMergeTarget[group.normalizedName]}
                        >
                          Merge
                        </button>
                      </div>

                      <div class="space-y-2">
                        <p
                          class="text-xs font-semibold text-warm-gray uppercase"
                        >
                          Select tag to keep:
                        </p>
                        <div class="space-y-2">
                          {#each group.tags as tag}
                            <label
                              class="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-warm-beige/50 transition-colors"
                            >
                              <input
                                type="radio"
                                name={`merge-target-${group.normalizedName}`}
                                value={tag.id}
                                checked={selectedMergeTarget[
                                  group.normalizedName
                                ] === tag.id}
                                onchange={() => {
                                  console.log("Radio button selected:", {
                                    normalizedName: group.normalizedName,
                                    tagId: tag.id,
                                    tagName: tag.name,
                                  });
                                  selectedMergeTarget[group.normalizedName] =
                                    tag.id;
                                  console.log(
                                    "Updated selectedMergeTarget:",
                                    selectedMergeTarget
                                  );
                                }}
                                class="radio radio-lg border-2 border-black bg-white checked:border-black checked:bg-terracotta [--chkbg:#d46a4e] [--chkfg:#ffffff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
                              />
                              <span class="text-sm">
                                "{tag.name}"
                                {#if tag.parentId}
                                  <span class="text-xs text-warm-gray">
                                    (in {tag.parentId})
                                  </span>
                                {/if}
                              </span>
                            </label>
                          {/each}
                        </div>
                      </div>
                    </div>
                  {/each}
                </div>
              </div>
            {:else if !isCheckingDuplicates}
              <div class="text-center py-8 text-warm-gray">
                <p class="text-sm">
                  Click "Find Duplicate Tags" to scan your library for tags with
                  the same name.
                </p>
              </div>
            {/if}
          </div>
        </div>
      </div>

      <!-- Library Management -->
      <div class="settings-card card mb-6">
        <div class="card-body space-y-5">
          <div class="settings-card__header">
            <div class="settings-card__icon" aria-hidden="true">
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
                  d="M4 6h16M4 10h16M4 14h10"
                />
              </svg>
            </div>
            <div class="flex-1 space-y-1">
              <div class="settings-chip">Library</div>
              <h2 class="card-title text-xl">Library Management</h2>
              <p class="settings-muted">
                Export, import, and maintenance tools to keep your library safe.
              </p>
            </div>
          </div>

          <div class="settings-section space-y-4">
            <div class="grid gap-3 md:grid-cols-2">
              <button
                class="action-secondary gap-2 justify-start"
                onclick={exportLibrary}
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
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
                <div class="text-left">
                  <div class="font-semibold text-warm-charcoal">
                    Export Library Backup
                  </div>
                  <div class="text-xs text-warm-gray">
                    Save images, tags, and settings to JSON
                  </div>
                </div>
              </button>

              <button
                class="action-secondary gap-2 justify-start"
                onclick={importLibrary}
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
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                  />
                </svg>
                <div class="text-left">
                  <div class="font-semibold text-warm-charcoal">
                    Import Library Backup
                  </div>
                  <div class="text-xs text-warm-gray">
                    Merge a saved backup into your library
                  </div>
                </div>
              </button>

              <button
                class="action-secondary gap-2 justify-start"
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
                <div class="text-left">
                  <div class="font-semibold text-warm-charcoal">
                    Restore Default Categories
                  </div>
                  <div class="text-xs text-warm-gray">
                    Unhide the built-in tag categories
                  </div>
                </div>
              </button>

              <button
                class="action-secondary gap-2 justify-start"
                onclick={replayOnboarding}
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
                    d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                  />
                </svg>
                <div class="text-left">
                  <div class="font-semibold text-warm-charcoal">
                    Replay Onboarding Tutorial
                  </div>
                  <div class="text-xs text-warm-gray">
                    Revisit the quick start walkthrough
                  </div>
                </div>
              </button>
            </div>

            <div class="settings-divider"></div>

            <div class="space-y-3">
              <div class="flex items-start justify-between gap-3">
                <div class="flex-1">
                  <p class="font-semibold text-warm-charcoal">Clear Library</p>
                  <p class="text-sm text-warm-gray">
                    Permanently delete all images and tags. This cannot be
                    undone.
                  </p>
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
                  Clear
                </button>
              </div>

              <div class="settings-divider"></div>

              <div class="flex items-start justify-between gap-3">
                <div class="flex-1">
                  <p class="font-semibold text-warm-charcoal">
                    Reset App to Factory Defaults
                  </p>
                  <p class="text-sm text-warm-gray">
                    Removes all data, settings, and cache, then restarts the
                    app.
                  </p>
                </div>
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
                  Reset
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- About -->
      <div class="settings-card card">
        <div class="card-body space-y-5">
          <div class="settings-card__header">
            <div class="settings-card__icon" aria-hidden="true">
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
                  d="M12 8c-1.657 0-3 1.343-3 3 0 1.306.835 2.417 2 2.83V17h2v-3.17A3.001 3.001 0 0012 8z"
                />
              </svg>
            </div>
            <div class="flex-1 space-y-1">
              <div class="settings-chip">About</div>
              <h2 class="card-title text-xl text-warm-charcoal">Draw Stack</h2>
              <p class="settings-muted">
                Reference manager and practice timer designed for artists.
              </p>
            </div>
            <span class="settings-chip hidden sm:inline-flex">Build</span>
          </div>

          <div class="settings-section space-y-4">
            <div
              class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
            >
              <div>
                <p class="font-semibold text-warm-charcoal">
                  Version {APP_VERSION}
                </p>
                <p class="text-sm text-warm-gray">Stable release</p>
              </div>
              <button
                onclick={handleCheckForUpdates}
                class="action-primary gap-2"
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
            </div>

            <div class="settings-divider"></div>

            <div class="space-y-2">
              <p class="text-sm text-warm-gray">
                Built for focused study sessions: manage references, run timed
                drills, and keep your library organized.
              </p>
              <p class="text-xs text-warm-gray">
                Need help or want to share feedback? We’d love to hear from you.
              </p>
            </div>

            <div class="settings-divider"></div>

            <div class="flex flex-wrap items-center gap-3">
              <div>
                <p class="text-sm text-warm-gray mb-1">Support / feedback</p>
                <p class="text-sm font-mono select-all">
                  darrenkelly196@gmail.com
                </p>
              </div>
              <div
                class="settings-divider hidden sm:block w-px h-6 !my-0"
              ></div>
              <div class="text-sm text-warm-gray">
                <span class="font-semibold text-warm-charcoal">Channel</span> · Stable
              </div>
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
        {Math.round((importProgress.current / importProgress.total) * 100)}%
        complete
      </div>
    </div>
  </div>
{/if}

<!-- Update Progress Modal -->
{#if showUpdateProgress}
  <div
    class="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-8"
    role="status"
    aria-live="polite"
  >
    <div class="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-4">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h3 class="text-xl font-bold text-warm-charcoal">
            Updating Draw Stack
          </h3>
          <p class="text-sm text-warm-gray">{updateMessage}</p>
        </div>
        <button
          class="btn btn-circle btn-ghost btn-sm text-warm-gray hover:bg-warm-beige/30"
          onclick={closeUpdateModal}
          aria-label="Close update status"
          disabled={updateStage === "downloading" ||
            updateStage === "installing"}
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
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <div class="space-y-2">
        <div class="text-sm font-semibold text-warm-charcoal capitalize">
          {updateStage.replace("-", " ")}
        </div>
        {#if updateStage === "downloading"}
          <div class="w-full bg-warm-beige/30 rounded-full h-3 overflow-hidden">
            <div
              class="bg-terracotta h-full transition-all duration-200 rounded-full"
              style={`width: ${Math.min(updatePercent, 100).toFixed(1)}%`}
            ></div>
          </div>
          <div class="text-xs text-warm-gray flex items-center justify-between">
            <span>{updatePercent.toFixed(1)}%</span>
            <span>
              {formatBytes(updateBytes.downloaded)}
              {updateBytes.total ? ` / ${formatBytes(updateBytes.total)}` : ""}
            </span>
          </div>
        {:else if updateStage === "installing"}
          <div class="w-full bg-warm-beige/30 rounded-full h-3 overflow-hidden">
            <div class="bg-terracotta h-full w-full animate-pulse"></div>
          </div>
          <div class="text-xs text-warm-gray">Finishing installation…</div>
        {:else if updateStage === "available"}
          <div class="text-sm text-warm-gray">
            Current: {updateVersion.current ?? ""} · Latest: {updateVersion.latest ??
              ""}
          </div>
        {:else if updateStage === "done"}
          <div class="text-sm text-emerald-700">
            Update installed. You may be prompted to restart.
          </div>
        {:else if updateStage === "no-update"}
          <div class="text-sm text-warm-gray">No update available.</div>
        {:else if updateStage === "error"}
          <div class="text-sm text-error">{updateError}</div>
        {/if}
      </div>

      <div class="flex justify-end gap-2">
        <button
          class="btn btn-ghost"
          onclick={closeUpdateModal}
          disabled={updateStage === "downloading" ||
            updateStage === "installing"}
        >
          Close
        </button>
      </div>
    </div>
  </div>
{/if}

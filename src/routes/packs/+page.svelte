<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { open } from "@tauri-apps/plugin-dialog";
  import { convertFileSrc } from "@tauri-apps/api/core";
  import {
    addImages,
    addTag,
    addImageTag,
    getAllTags,
    generateId,
    type Image,
    type Tag,
  } from "$lib/db";

  interface FolderInfo {
    path: string;
    name: string;
    image_count: number;
  }

  interface ImageInfo {
    path: string;
    filename: string;
  }

  interface FolderContents {
    folders: FolderInfo[];
    images: ImageInfo[];
    path: string;
  }

  interface HistoryEntry {
    path: string;
    name: string;
    lastVisited: number;
  }

  let currentPath = $state<string | null>(null);
  let rootPath = $state<string | null>(null);
  let folders = $state<FolderInfo[]>([]);
  let images = $state<ImageInfo[]>([]);
  let displayedImages = $state<ImageInfo[]>([]);
  let selectedImages = $state<Set<string>>(new Set());
  let scrollContainer = $state<HTMLDivElement | undefined>();
  let folderCountCache = new Map<string, number>();
  let expandedFolders = $state<Set<string>>(new Set());
  let packHistory = $state<HistoryEntry[]>([]);
  let showHistory = $state(false);
  let viewingImage = $state<ImageInfo | null>(null);
  let viewingIndex = $state<number>(-1);
  let isRightDragging = $state(false);
  let dragStartSelection = new Set<string>();
  let draggedImages = new Set<string>(); // Track images we've dragged over
  let showHelp = $state(false);

  // Pagination state
  const PAGINATION_STORAGE_KEY = "packs-items-per-page";

  function loadItemsPerPage(): number | "all" {
    if (typeof localStorage === "undefined") return 50;
    const stored = localStorage.getItem(PAGINATION_STORAGE_KEY);
    if (!stored) return 50;
    if (stored === "all") return "all";
    const parsed = parseInt(stored);
    return isNaN(parsed) ? 50 : parsed;
  }

  let itemsPerPage = $state<number | "all">(loadItemsPerPage());
  let currentPage = $state(1);

  const MAX_HISTORY = 10;
  const HISTORY_STORAGE_KEY = "pack-history";
  const SESSION_STATE_KEY = "pack-session-state";
  const EAGER_LOAD_COUNT = 20; // First 20 images load immediately

  // Load history from localStorage on mount
  function loadHistory() {
    try {
      const stored = localStorage.getItem(HISTORY_STORAGE_KEY);
      if (stored) {
        packHistory = JSON.parse(stored);
      }
    } catch (error) {
      console.error("Failed to load pack history:", error);
    }
  }

  // Save history to localStorage
  function saveHistory() {
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(packHistory));
    } catch (error) {
      console.error("Failed to save pack history:", error);
    }
  }

  // Add pack to history
  function addToHistory(folderPath: string) {
    const name = folderPath.split(/[/\\]/).pop() || folderPath;

    // Remove if already exists
    packHistory = packHistory.filter((entry) => entry.path !== folderPath);

    // Add to beginning
    packHistory = [
      { path: folderPath, name, lastVisited: Date.now() },
      ...packHistory,
    ].slice(0, MAX_HISTORY);

    saveHistory();
  }

  // Remove from history
  function removeFromHistory(folderPath: string) {
    packHistory = packHistory.filter((entry) => entry.path !== folderPath);
    saveHistory();
  }

  // Clear all history
  function clearHistory() {
    packHistory = [];
    saveHistory();
  }

  // Save current session state
  function saveSessionState() {
    try {
      const state = {
        currentPath,
        rootPath,
        selectedImages: Array.from(selectedImages),
        expandedFolders: Array.from(expandedFolders),
        displayedCount: displayedImages.length,
      };
      sessionStorage.setItem(SESSION_STATE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error("Failed to save session state:", error);
    }
  }

  // Restore session state
  async function restoreSessionState() {
    try {
      const stored = sessionStorage.getItem(SESSION_STATE_KEY);
      if (stored) {
        const state = JSON.parse(stored);
        if (state.currentPath && state.rootPath) {
          rootPath = state.rootPath;
          expandedFolders = new Set(state.expandedFolders || []);

          // Restore the folder contents with saved state
          await browseFolder(state.currentPath, true);

          // Restore selections after browsing
          selectedImages = new Set(state.selectedImages || []);
          // Pagination will be applied automatically by updateDisplayedImages()
        }
      }
    } catch (error) {
      console.error("Failed to restore session state:", error);
    }
  }

  // Load history on mount
  loadHistory();
  restoreSessionState();

  function handleItemsPerPageChange() {
    if (images.length > 0) {
      currentPage = 1;
      updateDisplayedImages();
    }
    // Save to localStorage
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(PAGINATION_STORAGE_KEY, String(itemsPerPage));
    }
  }

  // Build hierarchical folder tree from current path
  function getFolderTree(): Array<{
    name: string;
    path: string;
    depth: number;
    isCurrentPath: boolean;
  }> {
    if (!currentPath || !rootPath) return [];

    const tree = [];

    // Add root
    tree.push({
      name: rootPath.split(/[/\\]/).pop() || "Root",
      path: rootPath,
      depth: 0,
      isCurrentPath: currentPath === rootPath,
    });

    // Add path to current folder
    if (currentPath !== rootPath) {
      const relative = currentPath.substring(rootPath.length);
      const segments = relative.split(/[/\\]/).filter(Boolean);

      let accumulatedPath = rootPath;
      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        accumulatedPath +=
          (accumulatedPath.endsWith("\\") || accumulatedPath.endsWith("/")
            ? ""
            : "\\") + segment;

        expandedFolders.add(accumulatedPath);

        tree.push({
          name: segment,
          path: accumulatedPath,
          depth: i + 1,
          isCurrentPath: currentPath === accumulatedPath,
        });
      }
    }

    return tree;
  }

  function toggleFolder(folderPath: string) {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folderPath)) {
      newExpanded.delete(folderPath);
    } else {
      newExpanded.add(folderPath);
    }
    expandedFolders = newExpanded;
    saveSessionState();
  }

  async function browseFolder(folderPath: string, isRestoring = false) {
    // Instant UI update - clear old data immediately
    currentPath = folderPath;
    folders = [];
    images = [];
    displayedImages = [];

    // Only clear selections if not restoring from session
    if (!isRestoring) {
      selectedImages = new Set();
    }

    if (scrollContainer) {
      scrollContainer.scrollTop = 0;
    }

    try {
      const contents = await invoke<FolderContents>("browse_folder", {
        folderPath,
      });

      // Update with real data
      folders = contents.folders;
      
      // Ensure image paths are properly decoded (not URL-encoded)
      images = contents.images.map(img => ({
        ...img,
        path: img.path.includes('%') ? decodeURIComponent(img.path) : img.path
      }));

      // Debug: Check if paths need decoding
      if (images.length > 0) {
        console.log("Sample image path:", images[0].path);
        console.log("Converted path:", convertFileSrc(images[0].path));
      }

      // Apply pagination
      currentPage = 1;
      updateDisplayedImages();

      // Lazy load folder counts in background (don't wait)
      setTimeout(() => loadFolderCounts(), 0);

      // Only save session state if not currently restoring
      if (!isRestoring) {
        saveSessionState();
      }
    } catch (error) {
      console.error("Failed to browse folder:", error);
      alert(`Failed to browse folder: ${error}`);
      currentPath = null;
    }
  }

  async function loadFolderCounts() {
    // Batch process: load all counts, then update once
    const countPromises = folders.map(async (folder) => {
      if (folderCountCache.has(folder.path)) {
        return { folder, count: folderCountCache.get(folder.path)! };
      } else {
        try {
          const count = await invoke<number>("count_folder_images", {
            folderPath: folder.path,
          });
          folderCountCache.set(folder.path, count);
          return { folder, count };
        } catch {
          return { folder, count: 0 };
        }
      }
    });

    // Update all at once when done
    const results = await Promise.all(countPromises);
    results.forEach(({ folder, count }) => {
      folder.image_count = count;
    });
    folders = [...folders]; // Single reactivity trigger
  }

  async function selectFolder() {
    const folderPath = await open({
      directory: true,
      multiple: false,
      title: "Select Folder to Browse",
    });

    if (folderPath && typeof folderPath === "string") {
      rootPath = folderPath; // Set the root folder
      await browseFolder(folderPath);
      addToHistory(folderPath);
    }
  }

  // Browse from history
  async function browseFromHistory(historyEntry: HistoryEntry) {
    rootPath = historyEntry.path;
    currentPath = historyEntry.path; // Set immediately to show loading state

    try {
      await browseFolder(historyEntry.path);
      addToHistory(historyEntry.path); // Update last visited time
    } catch (error) {
      console.error("Failed to browse from history:", error);
    }

    showHistory = false;
  }

  function updateDisplayedImages() {
    if (itemsPerPage === "all") {
      displayedImages = [...images];
    } else {
      const startIndex = (currentPage - 1) * itemsPerPage;
      const endIndex = startIndex + itemsPerPage;
      displayedImages = images.slice(startIndex, endIndex);
    }

    if (scrollContainer) {
      scrollContainer.scrollTop = 0;
    }

    saveSessionState();
  }

  function goToPage(page: number) {
    const totalPages = Math.ceil(
      images.length / (itemsPerPage === "all" ? images.length : itemsPerPage)
    );
    currentPage = Math.max(1, Math.min(page, totalPages));
    updateDisplayedImages();
  }

  function nextPage() {
    const totalPages = Math.ceil(
      images.length / (itemsPerPage === "all" ? images.length : itemsPerPage)
    );
    if (currentPage < totalPages) {
      currentPage++;
      updateDisplayedImages();
    }
  }

  function previousPage() {
    if (currentPage > 1) {
      currentPage--;
      updateDisplayedImages();
    }
  }

  function changeItemsPerPage(value: number | "all") {
    itemsPerPage = value;
    currentPage = 1;
    updateDisplayedImages();
  }

  function toggleImageSelection(imagePath: string) {
    const newSelection = new Set(selectedImages);
    if (newSelection.has(imagePath)) {
      newSelection.delete(imagePath);
    } else {
      newSelection.add(imagePath);
    }
    selectedImages = newSelection;
    saveSessionState();
  }

  function handleRightDragStart(imagePath: string, e: MouseEvent) {
    if (e.button === 2) {
      // Right mouse button
      isRightDragging = true;
      dragStartSelection = new Set(selectedImages);
      draggedImages = new Set([imagePath]); // Track this first image
      toggleImageSelection(imagePath);
    }
  }

  function handleRightDragOver(imagePath: string, e: MouseEvent) {
    if (isRightDragging && e.buttons === 2) {
      // Right button is still held
      if (!draggedImages.has(imagePath)) {
        // First time dragging over this image - toggle it
        draggedImages.add(imagePath);
        toggleImageSelection(imagePath);
      }
    }
  }

  function handleRightDragEnd() {
    if (isRightDragging) {
      isRightDragging = false;
      draggedImages = new Set(); // Clear tracked images
      saveSessionState();
    }
  }

  function openImageViewer(image: ImageInfo, index: number) {
    viewingImage = image;
    viewingIndex = index;
  }

  function closeImageViewer() {
    viewingImage = null;
    viewingIndex = -1;
  }

  function navigateImage(direction: "prev" | "next") {
    if (!viewingImage || displayedImages.length === 0) return;

    let newIndex;
    if (direction === "prev") {
      newIndex =
        viewingIndex === 0 ? displayedImages.length - 1 : viewingIndex - 1;
    } else {
      newIndex =
        viewingIndex === displayedImages.length - 1 ? 0 : viewingIndex + 1;
    }

    viewingIndex = newIndex;
    viewingImage = displayedImages[newIndex];
  }

  function toggleCurrentImageSelection() {
    if (!viewingImage) return;
    toggleImageSelection(viewingImage.path);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!viewingImage) return;

    if (e.key === "Escape") {
      closeImageViewer();
    } else if (e.key === "ArrowLeft") {
      navigateImage("prev");
    } else if (e.key === "ArrowRight") {
      navigateImage("next");
    } else if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      toggleCurrentImageSelection();
    }
  }

  function selectAll() {
    const newSelection = new Set<string>();
    displayedImages.forEach((img) => newSelection.add(img.path));
    selectedImages = newSelection;
    saveSessionState();
  }

  async function addToLibrary() {
    if (selectedImages.size === 0) return;

    const selectedPaths = Array.from(selectedImages);
    const imagesToAdd: Image[] = [];

    try {
      console.log(`Adding ${selectedPaths.length} images to library...`);

      // Generate UUIDs and copy images to library
      for (const imagePath of selectedPaths) {
        const imageInfo = images.find((img) => img.path === imagePath);
        if (!imageInfo) continue;

        const imageId = await invoke<string>("generate_uuid");

        // Copy image to library directory
        const libraryPath = await invoke<string>("copy_to_library", {
          sourcePath: imagePath,
          imageId: imageId,
        });

        const imageData: Image = {
          id: imageId,
          packId: null,
          filename: imageInfo.filename,
          originalPath: imagePath,
          thumbnailPath: libraryPath,
          fullPath: libraryPath,
          isInLibrary: true,
          addedToLibraryAt: Date.now(),
        };

        console.log("Adding image to library:", imageData);
        imagesToAdd.push(imageData);
      }

      // Add to IndexedDB
      console.log("Saving to IndexedDB:", imagesToAdd.length, "images");
      await addImages(imagesToAdd);
      console.log("Successfully saved to IndexedDB");

      // Auto-tag images with pack name
      if (rootPath) {
        const packName = rootPath.split(/[/\\]/).pop() || "Unknown Pack";
        console.log(`Auto-tagging images with pack: ${packName}`);

        try {
          // Get all existing tags
          const existingTags = await getAllTags();
          let packTag = existingTags.find(
            (t) => t.name === packName && t.parentId === "Pack"
          );

          // Create pack tag if it doesn't exist
          if (!packTag) {
            const tagId = generateId();
            packTag = {
              id: tagId,
              name: packName,
              parentId: "Pack",
              createdAt: Date.now(),
            };
            await addTag(packTag);
            console.log(`Created new pack tag: ${packName}`);
          }

          // Add pack tag to all newly added images
          for (const image of imagesToAdd) {
            await addImageTag(image.id, packTag.id);
          }
          console.log(
            `Tagged ${imagesToAdd.length} images with pack: ${packName}`
          );
        } catch (tagError) {
          console.error("Failed to auto-tag images:", tagError);
          // Don't fail the whole operation if tagging fails
        }
      }

      // Clear selection and show success
      selectedImages = new Set();
      saveSessionState();
      alert(`Successfully added ${imagesToAdd.length} images to library!`);
    } catch (error) {
      console.error("Failed to add images to library:", error);
      alert(`Failed to add images to library: ${error}`);
    }
  }
</script>

<div class="h-full flex bg-base-100">
  <!-- Left Sidebar - Folder List -->
  <aside class="w-80 border-r border-base-300 flex flex-col bg-base-200">
    <div class="p-4 border-b border-base-300">
      <h2 class="text-lg font-semibold text-base-content mb-3">Folders</h2>
      <button class="btn btn-sm btn-primary w-full mb-2" onclick={selectFolder}>
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
        Browse Folder
      </button>

      {#if packHistory.length > 0}
        <button
          class="btn btn-sm btn-ghost w-full"
          onclick={() => (showHistory = !showHistory)}
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
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          Recent Packs ({packHistory.length})
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-4 w-4 ml-auto transition-transform {showHistory
              ? 'rotate-180'
              : ''}"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>

        {#if showHistory}
          <div class="mt-2 space-y-1 max-h-60 overflow-y-auto">
            {#each packHistory as entry}
              <div class="flex items-center gap-1">
                <button
                  class="btn btn-xs btn-ghost flex-1 justify-start text-left overflow-hidden"
                  onclick={() => browseFromHistory(entry)}
                  title={entry.path}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-4 w-4 flex-shrink-0"
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
                  <span class="truncate text-xs">{entry.name}</span>
                </button>
                <button
                  class="btn btn-xs btn-ghost btn-circle"
                  onclick={(e) => {
                    e.stopPropagation();
                    removeFromHistory(entry.path);
                  }}
                  aria-label="Remove from history"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-3 w-3"
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
            {/each}
            <button
              class="btn btn-xs btn-error btn-outline w-full mt-2"
              onclick={clearHistory}
            >
              Clear History
            </button>
          </div>
        {/if}
      {/if}
    </div>

    {#if currentPath}
      <div class="p-3 bg-base-300 border-b border-base-300">
        <div class="text-xs font-semibold text-base-content/70 mb-2">
          FOLDER TREE
        </div>
        {#each getFolderTree() as treeItem (treeItem.path)}
          <button
            class="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-base-100 rounded text-left transition-colors mb-0.5"
            class:bg-primary={treeItem.isCurrentPath}
            class:text-primary-content={treeItem.isCurrentPath}
            class:font-semibold={treeItem.isCurrentPath}
            style="padding-left: {treeItem.depth * 20 + 8}px"
            onclick={() => browseFolder(treeItem.path)}
          >
            {#if treeItem.depth > 0}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-3 w-3 flex-shrink-0 opacity-50"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="3"
                  d="M9 5l7 7-7 7"
                />
              </svg>
            {/if}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-4 w-4 flex-shrink-0"
              class:opacity-100={treeItem.isCurrentPath}
              class:opacity-70={!treeItem.isCurrentPath}
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
            <span class="text-sm truncate">{treeItem.name}</span>
          </button>
        {/each}
      </div>

      <div class="p-3 bg-base-200 border-b border-base-300">
        <div class="text-xs font-semibold text-base-content/70 mb-2">
          SUBFOLDERS
        </div>
      </div>
    {/if}

    <div class="flex-1 overflow-auto">
      {#if folders.length > 0}
        {#each folders as folder (folder.path)}
          <button
            class="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-base-300 transition-colors text-left border-b border-base-300"
            onclick={() => browseFolder(folder.path)}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-5 w-5 flex-shrink-0 text-primary"
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
            <div class="flex-1 min-w-0">
              <div class="font-medium truncate text-sm">{folder.name}</div>
              <div class="text-xs text-base-content/60">
                {#if folder.image_count > 0}
                  {folder.image_count} images
                {:else}
                  <span class="opacity-50">counting...</span>
                {/if}
              </div>
            </div>
          </button>
        {/each}
      {:else if currentPath}
        <div class="p-4 text-center text-sm text-base-content/60">
          No subfolders
        </div>
      {/if}
    </div>
  </aside>

  <!-- Main Content - Image Grid -->
  <main class="flex-1 flex flex-col">
    {#if currentPath}
      <!-- Header -->
      <header class="p-6 border-b border-base-300">
        <div class="flex items-center justify-between">
          <div>
            <h1 class="text-2xl font-semibold mb-1">
              {currentPath.split(/[/\\]/).pop() || "Folder"}
            </h1>
            <p class="text-sm text-base-content/70">
              {images.length} images in this folder
            </p>
          </div>

          {#if images.length > 0}
            <div class="flex items-center gap-3">
              <button
                class="btn btn-sm btn-ghost gap-2"
                onclick={() => (showHelp = true)}
                title="Show keyboard shortcuts"
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
                    d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                Help
              </button>
              <button class="btn btn-sm btn-ghost" onclick={selectAll}>
                Select All
              </button>
              <button
                class="btn btn-sm btn-primary"
                disabled={selectedImages.size === 0}
                onclick={addToLibrary}
              >
                Add to Library ({selectedImages.size})
              </button>
            </div>
          {/if}
        </div>
      </header>

      <!-- Image Grid -->
      <div class="flex-1 overflow-auto p-6" bind:this={scrollContainer}>
        {#if displayedImages.length > 0}
          <!-- Pagination Controls -->
          <div
            class="mb-4 flex items-center justify-between border-b border-base-300 pb-4"
          >
            <div class="flex items-center gap-3">
              <span class="text-sm text-base-content/70">Items per page:</span>
              <select
                class="select select-sm select-bordered"
                bind:value={itemsPerPage}
                onchange={handleItemsPerPageChange}
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value="all">All</option>
              </select>
            </div>
            <div class="text-sm text-base-content/70">
              {#if itemsPerPage === "all"}
                Showing all {images.length} images
              {:else}
                {@const totalPages = Math.ceil(images.length / itemsPerPage)}
                Showing {(currentPage - 1) * itemsPerPage + 1}-{Math.min(
                  currentPage * itemsPerPage,
                  images.length
                )} of {images.length} images
              {/if}
            </div>
          </div>

          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="grid grid-cols-12 gap-1.5" onmouseup={handleRightDragEnd}>
            {#each displayedImages as image, index (image.path)}
              {@const isSelected = selectedImages.has(image.path)}
              {@const shouldEagerLoad = index < EAGER_LOAD_COUNT}
              <div class="relative group">
                <button
                  class="w-full aspect-square bg-base-300 rounded overflow-hidden cursor-pointer border-2 transition-colors will-change-transform"
                  class:border-base-300={!isSelected}
                  class:border-primary={isSelected}
                  onclick={() => openImageViewer(image, index)}
                  oncontextmenu={(e) => {
                    e.preventDefault();
                    handleRightDragStart(image.path, e);
                  }}
                  onmouseenter={(e) => handleRightDragOver(image.path, e)}
                >
                  <img
                    src={convertFileSrc(image.path)}
                    alt={image.filename}
                    class="w-full h-full object-cover"
                    loading={shouldEagerLoad ? "eager" : "lazy"}
                    decoding="async"
                    fetchpriority={shouldEagerLoad ? "high" : "auto"}
                  />

                  {#if isSelected}
                    <div
                      class="absolute top-1 left-1 bg-primary rounded-full p-1"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-3 w-3 text-primary-content"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fill-rule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clip-rule="evenodd"
                        />
                      </svg>
                    </div>
                  {/if}
                </button>

                <!-- Quick select checkbox overlay -->
                <button
                  class="absolute top-1 right-1 btn btn-xs btn-circle btn-ghost opacity-0 group-hover:opacity-100 transition-opacity bg-base-100/80"
                  onclick={(e) => {
                    e.stopPropagation();
                    toggleImageSelection(image.path);
                  }}
                  aria-label="Toggle selection"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-4 w-4"
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
                </button>
              </div>
            {/each}
          </div>

          <!-- Pagination Navigation -->
          {#if itemsPerPage !== "all" && images.length > 0}
            {@const totalPages = Math.ceil(images.length / itemsPerPage)}
            <div class="mt-8 flex items-center justify-center gap-2">
              <button
                class="btn btn-sm"
                disabled={currentPage === 1}
                onclick={previousPage}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
                Previous
              </button>
              <span class="text-sm text-base-content/70 mx-4">
                Page {currentPage} of {totalPages}
              </span>
              <button
                class="btn btn-sm"
                disabled={currentPage === totalPages}
                onclick={nextPage}
              >
                Next
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </button>
            </div>
          {/if}
        {:else}
          <div class="flex items-center justify-center h-full text-center">
            <p class="text-base-content/50">No images in this folder</p>
          </div>
        {/if}
      </div>
    {:else}
      <div class="flex-1 flex items-center justify-center text-center">
        <div>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-24 w-24 mx-auto text-base-content/30 mb-4"
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
          <h2 class="text-xl font-medium mb-2 text-base-content">
            No folder selected
          </h2>
          <p class="text-base-content/70 mb-4">
            Select a folder to browse images
          </p>
          <button class="btn btn-primary" onclick={selectFolder}>
            Browse Folder
          </button>
        </div>
      </div>
    {/if}
  </main>
</div>

<!-- Image Carousel Modal -->
<svelte:window onkeydown={handleKeydown} />

{#if viewingImage}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
    onclick={closeImageViewer}
  >
    <!-- Close Button -->
    <button
      class="absolute top-4 right-4 btn btn-circle btn-ghost text-white z-10"
      onclick={closeImageViewer}
      aria-label="Close viewer"
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
          d="M6 18L18 6M6 6l12 12"
        />
      </svg>
    </button>

    <!-- Previous Button -->
    <button
      class="absolute left-4 top-1/2 -translate-y-1/2 btn btn-circle btn-ghost text-white z-10"
      onclick={(e) => {
        e.stopPropagation();
        navigateImage("prev");
      }}
      aria-label="Previous image"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="h-8 w-8"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M15 19l-7-7 7-7"
        />
      </svg>
    </button>

    <!-- Next Button -->
    <button
      class="absolute right-4 top-1/2 -translate-y-1/2 btn btn-circle btn-ghost text-white z-10"
      onclick={(e) => {
        e.stopPropagation();
        navigateImage("next");
      }}
      aria-label="Next image"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="h-8 w-8"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M9 5l7 7-7 7"
        />
      </svg>
    </button>

    <!-- Image and Info -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="flex flex-col items-center gap-4 w-full h-full px-4 pb-4"
      onclick={(e) => e.stopPropagation()}
    >
      <div
        class="flex-1 flex items-center justify-center w-full overflow-hidden"
      >
        <img
          src={convertFileSrc(viewingImage.path)}
          alt={viewingImage.filename}
          class="w-full h-full object-contain"
        />
      </div>

      <div class="flex items-center gap-4 text-white flex-shrink-0">
        <div class="text-center">
          <p class="font-medium text-lg">{viewingImage.filename}</p>
          <p class="text-sm text-white/70">
            {viewingIndex + 1} of {displayedImages.length}
            {#if displayedImages.length < images.length}
              ({images.length} total)
            {/if}
          </p>
        </div>

        <!-- Add to Selection Button -->
        <button
          class="btn btn-primary gap-2"
          onclick={toggleCurrentImageSelection}
        >
          {#if selectedImages.has(viewingImage.path)}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-5 w-5"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fill-rule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clip-rule="evenodd"
              />
            </svg>
            Selected
          {:else}
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
                d="M12 4v16m8-8H4"
              />
            </svg>
            Add to Selection
          {/if}
        </button>
      </div>

      <!-- Pagination info -->
      {#if images.length > 0}
        <div class="flex gap-2">
          <button class="btn btn-sm btn-ghost text-white gap-2" disabled>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
              />
            </svg>
            Load All ({images.length - displayedImages.length} remaining)
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<!-- Help Overlay -->
{#if showHelp}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-8"
    onclick={() => (showHelp = false)}
  >
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="bg-base-100 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-auto"
      onclick={(e) => e.stopPropagation()}
    >
      <div class="p-6">
        <div class="flex items-center justify-between mb-6">
          <h2 class="text-2xl font-bold">Packs Tab - Quick Reference</h2>
          <button
            class="btn btn-circle btn-ghost btn-sm"
            onclick={() => (showHelp = false)}
            aria-label="Close help"
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <!-- Mouse Controls -->
        <div class="mb-6">
          <h3 class="text-lg font-semibold mb-3 flex items-center gap-2">
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
                d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"
              />
            </svg>
            Mouse Controls
          </h3>
          <div class="space-y-2 text-sm">
            <div class="flex">
              <span
                class="font-mono bg-base-200 px-2 py-1 rounded min-w-[140px]"
                >Left Click</span
              >
              <span class="ml-3 text-base-content/70"
                >Open image in carousel viewer</span
              >
            </div>
            <div class="flex">
              <span
                class="font-mono bg-base-200 px-2 py-1 rounded min-w-[140px]"
                >Right Click</span
              >
              <span class="ml-3 text-base-content/70"
                >Select/unselect image</span
              >
            </div>
            <div class="flex">
              <span
                class="font-mono bg-base-200 px-2 py-1 rounded min-w-[140px]"
                >Right Drag</span
              >
              <span class="ml-3 text-base-content/70"
                >Paint selection (toggle multiple images)</span
              >
            </div>
            <div class="flex">
              <span
                class="font-mono bg-base-200 px-2 py-1 rounded min-w-[140px]"
                >Hover Button</span
              >
              <span class="ml-3 text-base-content/70"
                >Quick select (appears in top-right corner)</span
              >
            </div>
          </div>
        </div>

        <!-- Carousel Viewer -->
        <div class="mb-6">
          <h3 class="text-lg font-semibold mb-3 flex items-center gap-2">
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
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            Carousel Viewer (when image is open)
          </h3>
          <div class="space-y-2 text-sm">
            <div class="flex">
              <span
                class="font-mono bg-base-200 px-2 py-1 rounded min-w-[140px]"
                >← →</span
              >
              <span class="ml-3 text-base-content/70"
                >Navigate between images</span
              >
            </div>
            <div class="flex">
              <span
                class="font-mono bg-base-200 px-2 py-1 rounded min-w-[140px]"
                >Space / Enter</span
              >
              <span class="ml-3 text-base-content/70"
                >Toggle current image selection</span
              >
            </div>
            <div class="flex">
              <span
                class="font-mono bg-base-200 px-2 py-1 rounded min-w-[140px]"
                >Esc</span
              >
              <span class="ml-3 text-base-content/70"
                >Close carousel viewer</span
              >
            </div>
            <div class="flex">
              <span
                class="font-mono bg-base-200 px-2 py-1 rounded min-w-[140px]"
                >Click Outside</span
              >
              <span class="ml-3 text-base-content/70"
                >Close carousel viewer</span
              >
            </div>
          </div>
        </div>

        <!-- Navigation -->
        <div class="mb-6">
          <h3 class="text-lg font-semibold mb-3 flex items-center gap-2">
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
            Navigation
          </h3>
          <div class="space-y-2 text-sm">
            <div class="flex">
              <span
                class="font-mono bg-base-200 px-2 py-1 rounded min-w-[140px]"
                >Folder Tree</span
              >
              <span class="ml-3 text-base-content/70"
                >Click folders to expand/collapse and navigate</span
              >
            </div>
            <div class="flex">
              <span
                class="font-mono bg-base-200 px-2 py-1 rounded min-w-[140px]"
                >Recent Packs</span
              >
              <span class="ml-3 text-base-content/70"
                >Quick access to last 10 browsed packs</span
              >
            </div>
            <div class="flex">
              <span
                class="font-mono bg-base-200 px-2 py-1 rounded min-w-[140px]"
                >Breadcrumbs</span
              >
              <span class="ml-3 text-base-content/70"
                >Click path segments to jump to parent folders</span
              >
            </div>
          </div>
        </div>

        <!-- Features -->
        <div class="mb-6">
          <h3 class="text-lg font-semibold mb-3 flex items-center gap-2">
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
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
            Features
          </h3>
          <div class="space-y-2 text-sm">
            <div class="flex">
              <span
                class="font-mono bg-base-200 px-2 py-1 rounded min-w-[140px]"
                >Select All</span
              >
              <span class="ml-3 text-base-content/70"
                >Select all currently displayed images</span
              >
            </div>
            <div class="flex">
              <span
                class="font-mono bg-base-200 px-2 py-1 rounded min-w-[140px]"
                >Load 50 More</span
              >
              <span class="ml-3 text-base-content/70"
                >Load next batch of images (in grid or carousel)</span
              >
            </div>
            <div class="flex">
              <span
                class="font-mono bg-base-200 px-2 py-1 rounded min-w-[140px]"
                >Load All</span
              >
              <span class="ml-3 text-base-content/70"
                >Load all images from current folder</span
              >
            </div>
            <div class="flex">
              <span
                class="font-mono bg-base-200 px-2 py-1 rounded min-w-[140px]"
                >Session State</span
              >
              <span class="ml-3 text-base-content/70"
                >Your folder, selections, and scroll position persist when
                switching tabs</span
              >
            </div>
          </div>
        </div>

        <!-- Tips -->
        <div class="alert alert-info">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-5 w-5 stroke-current shrink-0"
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
            <strong>Pro Tip:</strong> Use right-click drag to quickly paint selections
            across multiple images. Drag back over selected images to unselect them!
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  button.border-base-300:hover {
    border-color: rgb(148 163 184 / 0.5);
  }

  /* Optimize image rendering performance */
  img {
    content-visibility: auto;
    image-rendering: -webkit-optimize-contrast;
    image-rendering: crisp-edges;
  }

  /* GPU acceleration for grid items */
  .grid > div {
    transform: translateZ(0);
    backface-visibility: hidden;
  }
</style>

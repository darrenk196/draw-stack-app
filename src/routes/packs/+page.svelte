<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { open } from "@tauri-apps/plugin-dialog";
  import { convertFileSrc } from "@tauri-apps/api/core";
  import { addImages, type Image } from "$lib/db";

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

  let currentPath = $state<string | null>(null);
  let rootPath = $state<string | null>(null);
  let folders = $state<FolderInfo[]>([]);
  let images = $state<ImageInfo[]>([]);
  let displayedImages = $state<ImageInfo[]>([]);
  let selectedImages = $state<Set<string>>(new Set());
  let scrollContainer = $state<HTMLDivElement | undefined>();
  let folderCountCache = new Map<string, number>();
  let expandedFolders = $state<Set<string>>(new Set());

  const IMAGES_PER_LOAD = 50; // Reduced for faster initial load
  const EAGER_LOAD_COUNT = 20; // First 20 images load immediately

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
    if (expandedFolders.has(folderPath)) {
      expandedFolders.delete(folderPath);
    } else {
      expandedFolders.add(folderPath);
    }
  }

  async function browseFolder(folderPath: string) {
    // Instant UI update - clear old data immediately
    currentPath = folderPath;
    folders = [];
    images = [];
    displayedImages = [];
    selectedImages.clear();

    if (scrollContainer) {
      scrollContainer.scrollTop = 0;
    }

    try {
      const contents = await invoke<FolderContents>("browse_folder", {
        folderPath,
      });

      // Update with real data
      folders = contents.folders;
      images = contents.images;
      displayedImages = images.slice(0, IMAGES_PER_LOAD);

      // Lazy load folder counts in background (don't wait)
      setTimeout(() => loadFolderCounts(), 0);
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
    }
  }

  function loadMore() {
    const currentLength = displayedImages.length;
    const nextBatch = images.slice(
      currentLength,
      currentLength + IMAGES_PER_LOAD
    );
    displayedImages = [...displayedImages, ...nextBatch];
  }

  function loadAll() {
    displayedImages = [...images];
  }

  function toggleImageSelection(imagePath: string) {
    if (selectedImages.has(imagePath)) {
      selectedImages.delete(imagePath);
    } else {
      selectedImages.add(imagePath);
    }
  }

  function selectAll() {
    displayedImages.forEach((img) => selectedImages.add(img.path));
  }

  async function addToLibrary() {
    if (selectedImages.size === 0) return;

    const selectedPaths = Array.from(selectedImages);
    const imagesToAdd: Image[] = [];

    try {
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

        imagesToAdd.push({
          id: imageId,
          packId: null,
          filename: imageInfo.filename,
          originalPath: imagePath,
          thumbnailPath: libraryPath,
          fullPath: libraryPath,
          isInLibrary: true,
          addedToLibraryAt: Date.now(),
        });
      }

      // Add to IndexedDB
      await addImages(imagesToAdd);

      // Clear selection and show success
      selectedImages.clear();
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
      <button class="btn btn-sm btn-primary w-full" onclick={selectFolder}>
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
          <div
            class="mb-4 flex items-center justify-between text-sm text-base-content/70"
          >
            <span>
              Showing {displayedImages.length} of {images.length} images
            </span>
          </div>

          <div class="grid grid-cols-12 gap-1.5">
            {#each displayedImages as image, index (image.path)}
              {@const isSelected = selectedImages.has(image.path)}
              {@const shouldEagerLoad = index < EAGER_LOAD_COUNT}
              <button
                class="relative aspect-square bg-base-300 rounded overflow-hidden cursor-pointer border-2 transition-colors will-change-transform"
                class:border-base-300={!isSelected}
                class:border-primary={isSelected}
                onclick={() => toggleImageSelection(image.path)}
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
            {/each}
          </div>

          {#if displayedImages.length < images.length}
            <div class="mt-8 text-center space-y-3">
              <p class="text-base-content/70">
                Showing {displayedImages.length} of {images.length} images
              </p>
              <div class="flex gap-3 justify-center">
                <button class="btn btn-primary btn-sm" onclick={loadMore}>
                  Load {Math.min(
                    IMAGES_PER_LOAD,
                    images.length - displayedImages.length
                  )} More
                </button>
                <button class="btn btn-outline btn-sm" onclick={loadAll}>
                  Load All ({images.length - displayedImages.length} remaining)
                </button>
              </div>
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
  .grid > button {
    transform: translateZ(0);
    backface-visibility: hidden;
  }
</style>

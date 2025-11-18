<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { open } from "@tauri-apps/plugin-dialog";
  import { convertFileSrc } from "@tauri-apps/api/core";

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
  let rootPath = $state<string | null>(null); // Track the original root folder
  let folders = $state<FolderInfo[]>([]);
  let images = $state<ImageInfo[]>([]);
  let displayedImages = $state<ImageInfo[]>([]);
  let selectedImages = $state<Set<string>>(new Set());
  let scrollContainer = $state<HTMLDivElement | undefined>();
  let isLoading = $state(false);

  const IMAGES_PER_LOAD = 100;

  // Get breadcrumb path segments
  function getBreadcrumbs(): Array<{
    name: string;
    path: string;
    indent: string;
  }> {
    if (!currentPath || !rootPath) return [];

    const breadcrumbs = [
      {
        name: rootPath.split(/[/\\]/).pop() || "Root",
        path: rootPath,
        indent: "",
      },
    ];

    if (currentPath === rootPath) return breadcrumbs;

    const relative = currentPath.substring(rootPath.length);
    const segments = relative.split(/[/\\]/).filter(Boolean);

    let accumulatedPath = rootPath;
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      accumulatedPath +=
        (accumulatedPath.endsWith("\\") || accumulatedPath.endsWith("/")
          ? ""
          : "\\") + segment;
      breadcrumbs.push({
        name: segment,
        path: accumulatedPath,
        indent: "  ".repeat(i + 1) + "↳ ",
      });
    }

    return breadcrumbs;
  }

  async function browseFolder(folderPath: string) {
    isLoading = true;
    try {
      const contents = await invoke<FolderContents>("browse_folder", {
        folderPath,
      });

      currentPath = contents.path;
      folders = contents.folders;
      images = contents.images;
      displayedImages = images.slice(0, IMAGES_PER_LOAD);
      selectedImages.clear();

      if (scrollContainer) {
        scrollContainer.scrollTop = 0;
      }
    } catch (error) {
      console.error("Failed to browse folder:", error);
      alert(`Failed to browse folder: ${error}`);
    } finally {
      isLoading = false;
    }
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

  function addToLibrary() {
    console.log(`Adding ${selectedImages.size} images to library`);
    // TODO: Implement add to library functionality
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
      <div class="p-3 bg-base-300">
        <select
          class="select select-sm w-full bg-base-100"
          value={currentPath}
          onchange={(e) => browseFolder(e.currentTarget.value)}
        >
          {#each getBreadcrumbs() as crumb}
            <option value={crumb.path}>
              {crumb.indent}{crumb.name}
            </option>
          {/each}
        </select>
      </div>
    {/if}

    <div class="flex-1 overflow-auto">
      {#each folders as folder}
        <button
          class="w-full flex items-center gap-3 p-3 hover:bg-base-300 transition-colors text-left border-b border-base-300"
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
            <div class="font-medium truncate">{folder.name}</div>
            <div class="text-xs text-base-content/60">
              {folder.image_count} images
            </div>
          </div>
        </button>
      {/each}
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
        {#if isLoading}
          <div class="flex items-center justify-center h-full">
            <span class="loading loading-spinner loading-lg"></span>
          </div>
        {:else if displayedImages.length > 0}
          <div
            class="mb-4 flex items-center justify-between text-sm text-base-content/70"
          >
            <span>
              Showing {displayedImages.length} of {images.length} images
            </span>
          </div>

          <div class="grid grid-cols-10 gap-2">
            {#each displayedImages as image (image.path)}
              <button
                class="relative aspect-square bg-base-300 rounded overflow-hidden cursor-pointer border-2 border-base-300 hover:border-primary/50"
                class:!border-primary={selectedImages.has(image.path)}
                onclick={() => toggleImageSelection(image.path)}
              >
                <img
                  src={convertFileSrc(image.path)}
                  alt={image.filename}
                  class="w-full h-full object-cover"
                />

                {#if selectedImages.has(image.path)}
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

<script lang="ts">
  import { onMount } from "svelte";
  import { getLibraryImages, type Image } from "$lib/db";
  import { convertFileSrc } from "@tauri-apps/api/core";

  let searchQuery = $state("");
  let viewMode: "grid" | "list" = $state("grid");
  let isSelectMode = $state(false);
  let selectedImages = $state<Set<string>>(new Set());
  let libraryImages = $state<Image[]>([]);
  let isLoading = $state(true);
  let viewingImage = $state<Image | null>(null);

  let quickFilters = [
    "Human/Female",
    "Human/Male/Standing",
    "Landscape/Mountains",
    "Animals/Mammals",
  ];

  onMount(async () => {
    await loadLibraryImages();
  });

  async function loadLibraryImages() {
    isLoading = true;
    try {
      console.log("Loading library images...");
      libraryImages = await getLibraryImages();
      console.log("Loaded library images:", libraryImages.length);
      console.log("Library images:", libraryImages);
    } catch (error) {
      console.error("Failed to load library images:", error);
    } finally {
      isLoading = false;
    }
  }

  function toggleViewMode(mode: "grid" | "list") {
    viewMode = mode;
  }

  function toggleSelectMode() {
    isSelectMode = !isSelectMode;
    if (!isSelectMode) {
      selectedImages.clear();
    }
  }

  function openImageViewer(image: Image) {
    viewingImage = image;
  }

  function closeImageViewer() {
    viewingImage = null;
  }

  function startPractice() {
    // TODO: Navigate to timer mode with filtered images
    console.log("Starting practice mode...");
  }
</script>

<div class="h-full flex flex-col bg-base-100">
  <!-- Header -->
  <header class="p-6 border-b border-base-300 bg-base-100">
    <div class="flex items-center justify-between mb-4">
      <h1 class="text-2xl font-semibold text-base-content">Library</h1>

      <div class="flex items-center gap-3">
        <!-- View Mode Toggles -->
        <div class="join">
          <button
            class="btn btn-sm join-item"
            class:btn-active={viewMode === "grid"}
            onclick={() => toggleViewMode("grid")}
            title="Grid view"
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
                d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
              />
            </svg>
          </button>
          <button
            class="btn btn-sm join-item"
            class:btn-active={viewMode === "list"}
            onclick={() => toggleViewMode("list")}
            title="List view"
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
                d="M4 6h16M4 10h16M4 14h16M4 18h16"
              />
            </svg>
          </button>
        </div>

        <button class="btn btn-sm btn-ghost gap-2" onclick={toggleSelectMode}>
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
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
          Select
        </button>

        <button class="btn btn-sm btn-primary gap-2" onclick={startPractice}>
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
              d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
            />
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          Start Practice
        </button>
      </div>
    </div>

    <!-- Search Bar -->
    <div class="relative mb-4">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="h-5 w-5 absolute left-3 top-1/2 -translate-y-1/2 text-base-content/50"
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
      <input
        type="text"
        placeholder="Search by tags or filename..."
        class="input input-bordered w-full pl-10"
        bind:value={searchQuery}
      />
      <button
        class="btn btn-sm btn-ghost absolute right-2 top-1/2 -translate-y-1/2 gap-2"
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
            d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
          />
        </svg>
        Filter
      </button>
    </div>

    <!-- Quick Filters -->
    <div class="flex items-center gap-2">
      <span class="text-sm text-base-content/70">Quick Filters:</span>
      <div class="flex gap-2 flex-wrap">
        {#each quickFilters as filter}
          <button
            class="badge badge-lg badge-ghost cursor-pointer hover:badge-primary"
          >
            {filter}
          </button>
        {/each}
      </div>
    </div>
  </header>

  <!-- Content Area -->
  <div class="flex-1 overflow-auto p-6">
    {#if isLoading}
      <div class="flex items-center justify-center h-full">
        <span class="loading loading-spinner loading-lg"></span>
      </div>
    {:else if libraryImages.length === 0}
      <div class="flex flex-col items-center justify-center h-full text-center">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-24 w-24 text-base-content/30 mb-4"
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
        <h2 class="text-xl font-medium mb-2 text-base-content">
          Your library is empty
        </h2>
        <p class="text-base-content/70 mb-4">
          Go to Packs and add images to your library
        </p>
        <a href="/packs" class="btn btn-primary"> Go to Packs </a>
      </div>
    {:else}
      <!-- Image Grid -->
      <div class="grid grid-cols-8 gap-2">
        {#each libraryImages as image (image.id)}
          <button
            class="relative aspect-square bg-base-300 rounded overflow-hidden group cursor-pointer hover:ring-2 hover:ring-primary"
            onclick={() => openImageViewer(image)}
          >
            <img
              src={convertFileSrc(image.fullPath)}
              alt={image.filename}
              class="w-full h-full object-cover"
              loading="lazy"
              decoding="async"
            />
            {#if isSelectMode}
              <div class="absolute top-2 left-2">
                <input type="checkbox" class="checkbox checkbox-primary" />
              </div>
            {/if}
            <div
              class="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <p class="text-xs text-white truncate">{image.filename}</p>
            </div>
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>

<!-- Full Screen Image Viewer Modal -->
{#if viewingImage}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
    onclick={closeImageViewer}
  >
    <button
      class="absolute top-4 right-4 btn btn-circle btn-ghost text-white"
      onclick={closeImageViewer}
      aria-label="Close image viewer"
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
    
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="max-w-[90vw] max-h-[90vh] flex flex-col items-center gap-4" onclick={(e) => e.stopPropagation()}>
      <img
        src={convertFileSrc(viewingImage.fullPath)}
        alt={viewingImage.filename}
        class="max-w-full max-h-[85vh] object-contain"
      />
      <div class="text-white text-center">
        <p class="font-medium">{viewingImage.filename}</p>
      </div>
    </div>
  </div>
{/if}

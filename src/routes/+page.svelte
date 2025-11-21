<script lang="ts">
  import { onMount } from "svelte";
  import {
    getLibraryImages,
    getAllTags,
    getTagsForImage,
    addImageTag,
    removeImageTag,
    addTag,
    generateId,
    getRecentlyUsedTags,
    buildTagPath,
    updateTagUsage,
    type Image,
    type Tag,
  } from "$lib/db";
  import { convertFileSrc } from "@tauri-apps/api/core";

  let searchQuery = $state("");
  let viewMode: "grid" | "list" = $state("grid");
  let isSelectMode = $state(false);
  let selectedImages = $state<Set<string>>(new Set());
  let libraryImages = $state<Image[]>([]);
  let isLoading = $state(true);
  let viewingImage = $state<Image | null>(null);
  let allTags = $state<Tag[]>([]);
  let imageTags = $state<Tag[]>([]);
  let customTagInput = $state("");
  let expandedCategories = $state<Set<string>>(new Set(["Gender", "Pose"]));
  let isBulkTagging = $state(false);
  let recentTags = $state<Tag[]>([]);
  let searchSuggestions = $state<Tag[]>([]);
  let showSearchSuggestions = $state(false);
  let allImageTags = $state<Map<string, Tag[]>>(new Map());
  let activeFilters = $state<string[]>([]);
  let selectedSuggestionIndex = $state(0);

  // Pagination state
  let itemsPerPage = $state<number | "all">(50);
  let currentPage = $state(1);

  // Filtered images based on search query and active filters
  let filteredImages = $derived.by(() => {
    // If no filters or search, show all
    if (!searchQuery.trim() && activeFilters.length === 0) {
      return libraryImages;
    }

    return libraryImages.filter((image) => {
      const imageTags = allImageTags.get(image.id) || [];
      const imageTagPaths = imageTags.map((tag) =>
        buildTagPath(tag, allTags).toLowerCase()
      );
      const imageTagNames = imageTags.map((tag) => tag.name.toLowerCase());

      // Check if image matches all active filters (AND logic)
      const matchesFilters = activeFilters.every((filter) => {
        const filterLower = filter.toLowerCase();
        return (
          imageTagPaths.some((path) => path.includes(filterLower)) ||
          imageTagNames.some((name) => name.includes(filterLower))
        );
      });

      if (!matchesFilters) {
        return false;
      }

      // If there's a search query, also check filename or tags
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();

        // Check if filename matches
        if (image.filename.toLowerCase().includes(query)) {
          return true;
        }

        // Check if any tag matches
        return (
          imageTagPaths.some((path) => path.includes(query)) ||
          imageTagNames.some((name) => name.includes(query))
        );
      }

      return true;
    });
  });

  // Pagination calculations
  let totalPages = $derived(
    itemsPerPage === "all" ? 1 : Math.ceil(filteredImages.length / itemsPerPage)
  );

  let displayedLibraryImages = $derived.by(() => {
    if (itemsPerPage === "all") {
      return filteredImages;
    }
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredImages.slice(startIndex, endIndex);
  });

  // Reset to page 1 when filters change
  $effect(() => {
    // Track dependencies
    void filteredImages.length;
    void activeFilters.length;
    void searchQuery;

    // Reset page
    currentPage = 1;
  });

  // Predefined tag categories with subcategories
  const tagCategories = [
    {
      name: "Gender",
      tags: ["Male", "Female"],
    },
    {
      name: "Pose",
      tags: [
        "Standing",
        "Sitting",
        "Walking",
        "Running",
        "Lying",
        "Kneeling",
        "Action",
      ],
    },
    {
      name: "View Angle",
      tags: [
        "Front View",
        "Side View",
        "Back View",
        "3/4 View",
        "Top View",
        "Bottom View",
      ],
    },
    {
      name: "Art Style",
      tags: ["Realistic", "Anime", "Cartoon", "Abstract", "Sketch"],
    },
    {
      name: "Character Type",
      tags: ["Human", "Animal", "Fantasy", "Robot", "Monster"],
    },
  ];

  onMount(() => {
    loadLibraryImages();
    loadAllTags();
    loadRecentTags();

    // Debug: Check if tagUsage store exists
    getRecentlyUsedTags(1)
      .then((tags) => {
        console.log("Recent tags check:", tags);
      })
      .catch((err) => {
        console.error("TagUsage store error - database needs reset:", err);
      });

    window.addEventListener("keydown", handleKeydown);
    
    // Watch for itemsPerPage changes
    $effect(() => {
      void itemsPerPage;
      currentPage = 1;
    });
    
    return () => {
      window.removeEventListener("keydown", handleKeydown);
    };
  });

  async function loadLibraryImages() {
    isLoading = true;
    try {
      console.log("Loading library images...");
      libraryImages = await getLibraryImages();
      console.log("Loaded library images:", libraryImages.length);
      // Load tags for all images for filtering
      await loadAllImageTags();
    } catch (error) {
      console.error("Failed to load library images:", error);
    } finally {
      isLoading = false;
    }
  }

  async function loadAllImageTags() {
    try {
      const tagsMap = new Map<string, Tag[]>();
      for (const image of libraryImages) {
        const tags = await getTagsForImage(image.id);
        tagsMap.set(image.id, tags);
      }
      allImageTags = tagsMap;
    } catch (error) {
      console.error("Failed to load image tags:", error);
    }
  }

  async function loadAllTags() {
    try {
      allTags = await getAllTags();
    } catch (error) {
      console.error("Failed to load tags:", error);
    }
  }

  async function loadRecentTags() {
    try {
      const tags = await getRecentlyUsedTags(10);
      console.log(
        "Loaded recent tags:",
        tags.length,
        tags.map((t) => t.name)
      );
      recentTags = tags;
    } catch (error) {
      console.error("Failed to load recent tags:", error);
    }
  }

  function handleSearchInput() {
    if (!searchQuery.trim()) {
      showSearchSuggestions = false;
      searchSuggestions = [];
      selectedSuggestionIndex = 0;
      return;
    }

    const query = searchQuery.toLowerCase().trim();

    // Filter tags that match the search query and aren't already active
    const matches = allTags
      .filter((tag) => {
        const tagPath = buildTagPath(tag, allTags);
        return (
          tag.name.toLowerCase().includes(query) &&
          !activeFilters.includes(tagPath)
        );
      })
      .slice(0, 10); // Show max 10 suggestions

    searchSuggestions = matches;
    showSearchSuggestions = matches.length > 0;
    selectedSuggestionIndex = 0;
  }

  async function addFilter(tagPath: string) {
    if (!activeFilters.includes(tagPath)) {
      activeFilters = [...activeFilters, tagPath];
      console.log("Added filter:", tagPath, "Current filters:", activeFilters);

      // Find the tag and update its usage for recently used tracking
      const tag = allTags.find((t) => buildTagPath(t, allTags) === tagPath);
      if (tag) {
        await updateTagUsage(tag.id);
        await loadRecentTags();
      }
    }
    searchQuery = "";
    showSearchSuggestions = false;
    selectedSuggestionIndex = 0;
  }

  function handleSearchKeydown(e: KeyboardEvent) {
    if (!showSearchSuggestions || searchSuggestions.length === 0) {
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      selectedSuggestionIndex =
        (selectedSuggestionIndex + 1) % searchSuggestions.length;
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selectedSuggestionIndex =
        selectedSuggestionIndex === 0
          ? searchSuggestions.length - 1
          : selectedSuggestionIndex - 1;
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (searchSuggestions[selectedSuggestionIndex]) {
        selectSearchSuggestion(searchSuggestions[selectedSuggestionIndex]);
      }
    } else if (e.key === "Escape") {
      showSearchSuggestions = false;
      selectedSuggestionIndex = 0;
    }
  }

  function removeFilter(tagPath: string) {
    activeFilters = activeFilters.filter((f) => f !== tagPath);
  }

  function clearAllFilters() {
    activeFilters = [];
    searchQuery = "";
  }

  function selectSearchSuggestion(tag: Tag) {
    addFilter(buildTagPath(tag, allTags));
  }

  async function loadImageTags() {
    if (!viewingImage) return;
    try {
      imageTags = await getTagsForImage(viewingImage.id);
    } catch (error) {
      console.error("Failed to load image tags:", error);
    }
  }

  function toggleViewMode(mode: "grid" | "list") {
    viewMode = mode;
  }

  function toggleSelectMode() {
    isSelectMode = !isSelectMode;
    if (!isSelectMode) {
      selectedImages = new Set();
      isBulkTagging = false;
    }
  }

  function toggleImageSelection(imageId: string, e: Event) {
    e.stopPropagation();
    const newSelected = new Set(selectedImages);
    if (newSelected.has(imageId)) {
      newSelected.delete(imageId);
    } else {
      newSelected.add(imageId);
    }
    selectedImages = newSelected;
  }

  async function openImageViewer(image: Image) {
    viewingImage = image;
    await loadImageTags();
  }

  function closeImageViewer(e?: Event) {
    if (e) {
      e.stopPropagation();
    }
    viewingImage = null;
    imageTags = [];
  }

  async function navigateImage(direction: "prev" | "next") {
    if (!viewingImage || libraryImages.length === 0) return;

    const currentIndex = libraryImages.findIndex(
      (img) => img.id === viewingImage!.id
    );
    if (currentIndex === -1) return;

    let newIndex;
    if (direction === "prev") {
      newIndex =
        currentIndex === 0 ? libraryImages.length - 1 : currentIndex - 1;
    } else {
      newIndex =
        currentIndex === libraryImages.length - 1 ? 0 : currentIndex + 1;
    }

    await openImageViewer(libraryImages[newIndex]);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!viewingImage) return;

    if (e.key === "Escape") {
      closeImageViewer();
    } else if (e.key === "ArrowLeft") {
      navigateImage("prev");
    } else if (e.key === "ArrowRight") {
      navigateImage("next");
    }
  }

  function toggleCategory(categoryName: string) {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(categoryName)) {
      newExpanded.delete(categoryName);
    } else {
      newExpanded.add(categoryName);
    }
    expandedCategories = newExpanded;
  }

  async function openBulkTagEditor() {
    if (selectedImages.size === 0) return;
    isBulkTagging = true;
    imageTags = []; // Start with no tags selected for bulk operation
  }

  function closeBulkTagEditor() {
    isBulkTagging = false;
    imageTags = [];
  }

  async function toggleTag(tagName: string, categoryName?: string) {
    // Handle bulk tagging
    if (isBulkTagging && selectedImages.size > 0) {
      const existingTag = imageTags.find((t) => t.name === tagName);

      if (existingTag) {
        // Remove from selected tags list
        imageTags = imageTags.filter((t) => t.id !== existingTag.id);
      } else {
        // Add to selected tags list
        let tag = allTags.find((t) => t.name === tagName);

        if (!tag) {
          const tagId = generateId();
          tag = {
            id: tagId,
            name: tagName,
            parentId: categoryName || null,
            createdAt: Date.now(),
          };
          await addTag(tag);
          allTags = [...allTags, tag];
        }

        imageTags = [...imageTags, tag];
      }
      return;
    }

    // Handle single image tagging
    if (!viewingImage) return;

    const existingTag = imageTags.find((t) => t.name === tagName);

    if (existingTag) {
      // Remove tag
      await removeImageTag(viewingImage.id, existingTag.id);
      imageTags = imageTags.filter((t) => t.id !== existingTag.id);
      // Update the image tags map
      allImageTags.set(viewingImage.id, imageTags);
    } else {
      // Find or create tag
      let tag = allTags.find((t) => t.name === tagName);

      if (!tag) {
        // Create new tag
        const tagId = generateId();
        tag = {
          id: tagId,
          name: tagName,
          parentId: categoryName || null,
          createdAt: Date.now(),
        };
        await addTag(tag);
        allTags = [...allTags, tag];
      }

      // Add tag to image
      await addImageTag(viewingImage.id, tag.id);
      imageTags = [...imageTags, tag];
      // Update the image tags map
      allImageTags.set(viewingImage.id, imageTags);
    }
  }

  async function addCustomTag() {
    if (!customTagInput.trim()) return;
    if (!isBulkTagging && !viewingImage) return;

    await toggleTag(customTagInput.trim());
    customTagInput = "";
  }

  function removeTag(tag: Tag) {
    toggleTag(tag.name);
  }

  function isTagActive(tagName: string): boolean {
    return imageTags.some((t) => t.name === tagName);
  }

  async function applyBulkTags() {
    if (selectedImages.size === 0 || imageTags.length === 0) return;

    try {
      const imageCount = selectedImages.size;
      const tagCount = imageTags.length;

      console.log(`Applying ${tagCount} tags to ${imageCount} images...`);

      // Apply all selected tags to all selected images
      for (const imageId of selectedImages) {
        for (const tag of imageTags) {
          await addImageTag(imageId, tag.id);
        }
      }

      console.log(
        `Successfully applied ${tagCount} tags to ${imageCount} images`
      );

      // Close bulk editor and clear selection
      closeBulkTagEditor();
      isSelectMode = false;
      selectedImages = new Set();

      // Reload image tags for filtering
      await loadAllImageTags();
    } catch (error) {
      console.error("Failed to apply bulk tags:", error);
    }
  }
  function startPractice() {
    // Get selected or filtered images
    const imagesToPractice =
      selectedImages.size > 0
        ? Array.from(selectedImages)
            .map((id) => libraryImages.find((img) => img.id === id)!)
            .filter(Boolean)
        : filteredImages;

    if (imagesToPractice.length === 0) {
      alert("No images to practice with. Select images or apply filters.");
      return;
    }

    // Navigate to timer mode with image IDs
    const imageIds = imagesToPractice.map((img) => img.id).join(",");
    window.location.href = `/timer?images=${encodeURIComponent(imageIds)}`;
  }

  function goToPage(page: number) {
    currentPage = Math.max(1, Math.min(page, totalPages));
  }

  function nextPage() {
    if (currentPage < totalPages) {
      currentPage++;
    }
  }

  function previousPage() {
    if (currentPage > 1) {
      currentPage--;
    }
  }

  function changeItemsPerPage(value: number | "all") {
    itemsPerPage = value;
    currentPage = 1;
  }
</script>

<div class="h-full flex flex-col bg-base-100">
  <!-- Header -->
  <header class="p-6 border-b border-base-300 bg-base-100">
    <div class="flex items-center justify-between mb-4">
      <h1 class="text-2xl font-semibold text-base-content">Library</h1>

      <div class="flex items-center gap-3">
        <!-- View Mode Toggle -->
        <button
          class="btn btn-sm"
          onclick={() => toggleViewMode(viewMode === "grid" ? "list" : "grid")}
          title={viewMode === "grid"
            ? "Switch to list view"
            : "Switch to grid view"}
        >
          {#if viewMode === "grid"}
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
                d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
              />
            </svg>
          {/if}
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
        oninput={handleSearchInput}
        onfocus={handleSearchInput}
        onkeydown={handleSearchKeydown}
        onblur={() => setTimeout(() => (showSearchSuggestions = false), 200)}
      />

      {#if showSearchSuggestions && searchSuggestions.length > 0}
        <div
          class="absolute z-50 w-full mt-1 bg-base-100 border border-base-300 rounded-lg shadow-lg max-h-60 overflow-y-auto"
        >
          {#each searchSuggestions as tag, index}
            <button
              class="w-full px-4 py-2 text-left hover:bg-base-200 flex items-center gap-2 transition-colors"
              class:bg-primary={index === selectedSuggestionIndex}
              class:text-primary-content={index === selectedSuggestionIndex}
              onclick={() => selectSearchSuggestion(tag)}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-4 w-4"
                class:opacity-50={index !== selectedSuggestionIndex}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                />
              </svg>
              <span class="text-sm">{buildTagPath(tag, allTags)}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Active Filters -->
    {#if activeFilters.length > 0}
      <div class="flex items-center gap-2 mb-2">
        <span class="text-sm text-base-content/70">Active Filters:</span>
        <div class="flex gap-2 flex-wrap">
          {#each activeFilters as filter}
            <button
              class="badge badge-lg badge-primary gap-2 cursor-pointer"
              onclick={() => removeFilter(filter)}
            >
              {filter}
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
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          {/each}
          <button
            class="badge badge-lg badge-ghost cursor-pointer hover:badge-error"
            onclick={clearAllFilters}
          >
            Clear All
          </button>
        </div>
      </div>
    {/if}

    <!-- Quick Filters -->
    <div class="flex items-center gap-2">
      <span class="text-sm text-base-content/70">Recently Used:</span>
      <div class="flex gap-2 flex-wrap">
        {#if recentTags.length > 0}
          {#each recentTags as tag}
            {@const tagPath = buildTagPath(tag, allTags)}
            <button
              class="badge badge-lg badge-ghost cursor-pointer hover:badge-primary"
              class:badge-outline={activeFilters.includes(tagPath)}
              onclick={() => addFilter(tagPath)}
              disabled={activeFilters.includes(tagPath)}
            >
              {tagPath}
            </button>
          {/each}
        {:else}
          <span class="text-sm text-base-content/50 italic"
            >No recently used tags</span
          >
        {/if}
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
    {:else if filteredImages.length === 0 && (searchQuery.trim() || activeFilters.length > 0)}
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
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <h2 class="text-xl font-medium mb-2 text-base-content">
          No images found
        </h2>
        <p class="text-base-content/70 mb-4">
          {#if activeFilters.length > 0}
            No images match the active filters
          {:else}
            No images match your search: "{searchQuery}"
          {/if}
        </p>
        <button class="btn btn-ghost" onclick={clearAllFilters}>
          Clear Filters
        </button>
      </div>
    {:else}
      <!-- Pagination Controls -->
      <div
        class="mb-4 flex items-center justify-between border-b border-base-300 pb-4"
      >
        <div class="flex items-center gap-3">
          <span class="text-sm text-base-content/70">Items per page:</span>
          <select
            class="select select-sm select-bordered"
            bind:value={itemsPerPage}
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
            Showing all {filteredImages.length} images
          {:else}
            Showing {(currentPage - 1) * itemsPerPage + 1}-{Math.min(
              currentPage * itemsPerPage,
              filteredImages.length
            )} of {filteredImages.length} images
          {/if}
        </div>
      </div>

      <!-- Image Grid/List -->
      {#if viewMode === "grid"}
        <div class="grid grid-cols-8 gap-2">
          {#each displayedLibraryImages as image (image.id)}
            {@const isSelected = selectedImages.has(image.id)}
            <button
              class="relative aspect-square bg-base-300 rounded overflow-hidden cursor-pointer border-2 transition-colors"
              class:border-base-300={!isSelected}
              class:border-primary={isSelected}
              onclick={() => openImageViewer(image)}
              oncontextmenu={(e) => {
                e.preventDefault();
                toggleImageSelection(image.id, e);
              }}
            >
              <img
                src={convertFileSrc(image.fullPath)}
                alt={image.filename}
                class="w-full h-full object-cover"
                loading="lazy"
                decoding="async"
              />
              {#if isSelected}
                <div class="absolute top-1 left-1 bg-primary rounded-full p-1">
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
      {:else}
        <!-- List View -->
        <div class="space-y-2">
          {#each displayedLibraryImages as image (image.id)}
            {@const isSelected = selectedImages.has(image.id)}
            {@const tags = allImageTags.get(image.id) || []}
            <button
              class="w-full flex items-center gap-4 p-3 bg-base-200 rounded-lg hover:bg-base-300 border-2 transition-colors"
              class:border-base-200={!isSelected}
              class:border-primary={isSelected}
              onclick={() => openImageViewer(image)}
              oncontextmenu={(e) => {
                e.preventDefault();
                toggleImageSelection(image.id, e);
              }}
            >
              <div class="relative w-20 h-20 flex-shrink-0">
                <img
                  src={convertFileSrc(image.fullPath)}
                  alt={image.filename}
                  class="w-full h-full object-cover rounded"
                  loading="lazy"
                  decoding="async"
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
              </div>
              <div class="flex-1 text-left">
                <p class="font-medium text-base-content">{image.filename}</p>
                {#if tags.length > 0}
                  <div class="flex flex-wrap gap-1 mt-1">
                    {#each tags as tag}
                      <span class="badge badge-sm badge-ghost">
                        {buildTagPath(tag, allTags)}
                      </span>
                    {/each}
                  </div>
                {:else}
                  <p class="text-sm text-base-content/50">No tags</p>
                {/if}
              </div>
            </button>
          {/each}
        </div>
      {/if}

      <!-- Pagination Navigation -->
      {#if itemsPerPage !== "all" && filteredImages.length > 0}
        <div
          class="mt-6 pt-4 border-t border-base-300 flex items-center justify-center gap-2"
        >
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
    {/if}
  </div>
</div>

<!-- Full Screen Image Viewer Modal -->
{#if viewingImage || isBulkTagging}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-50 bg-black/90 flex"
    onclick={() => {
      if (isBulkTagging) {
        closeBulkTagEditor();
      } else {
        closeImageViewer();
      }
    }}
  >
    <button
      class="absolute top-4 right-4 btn btn-circle btn-ghost text-white z-10"
      onclick={(e) => {
        e.stopPropagation();
        if (isBulkTagging) {
          closeBulkTagEditor();
        } else {
          closeImageViewer(e);
        }
      }}
      aria-label="Close"
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

    <!-- Previous Image Button -->
    {#if !isBulkTagging}
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
    {/if}

    <!-- Next Image Button -->
    {#if !isBulkTagging}
      <button
        class="absolute right-[21rem] top-1/2 -translate-y-1/2 btn btn-circle btn-ghost text-white z-10"
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
    {/if}

    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="flex-1 flex items-center justify-center p-8"
      onclick={(e) => e.stopPropagation()}
    >
      {#if isBulkTagging}
        <div class="text-center text-white space-y-4">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-24 w-24 mx-auto text-primary"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
            />
          </svg>
          <h2 class="text-2xl font-semibold">Bulk Tag Editor</h2>
          <p class="text-base-content/70">
            Add tags to {selectedImages.size} selected image{selectedImages.size !==
            1
              ? "s"
              : ""}
          </p>
          <p class="text-sm text-base-content/50">
            Select tags from the panel on the right, then click "Apply Tags"
          </p>
        </div>
      {:else if viewingImage}
        <div class="w-full h-full flex items-center justify-center">
          <img
            src={convertFileSrc(viewingImage.fullPath)}
            alt={viewingImage.filename}
            class="w-full h-full object-contain"
          />
        </div>
      {/if}
    </div>

    <!-- Tag Manager Panel -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="w-80 bg-base-100 h-full overflow-y-auto p-6 space-y-6"
      onclick={(e) => e.stopPropagation()}
    >
      <!-- Active Tags Section -->
      <div>
        <h3 class="text-lg font-semibold mb-3">
          {isBulkTagging ? "Tags to Apply" : "Active Tags"}
        </h3>
        {#if imageTags.length === 0}
          <p class="text-sm text-base-content/50">
            {isBulkTagging ? "Select tags below to apply" : "No tags yet"}
          </p>
        {:else}
          <div class="flex flex-wrap gap-2">
            {#each imageTags as tag}
              <div class="badge badge-primary gap-2">
                {tag.name}
                <button
                  class="btn btn-circle btn-ghost btn-xs"
                  onclick={() => removeTag(tag)}
                  aria-label="Remove tag"
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
          </div>
        {/if}
      </div>

      <div class="divider"></div>

      <!-- Tag Categories Section -->
      <div>
        <h3 class="text-lg font-semibold mb-3">Tag Categories</h3>
        <div class="space-y-3">
          {#each tagCategories as category}
            <div class="border border-base-300 rounded-lg">
              <!-- Category Header -->
              <button
                class="w-full flex items-center justify-between p-3 hover:bg-base-200 transition-colors"
                onclick={() => toggleCategory(category.name)}
              >
                <span class="font-medium">{category.name}</span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-5 w-5 transition-transform {expandedCategories.has(
                    category.name
                  )
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

              <!-- Category Tags -->
              {#if expandedCategories.has(category.name)}
                <div class="p-3 pt-0 space-y-2">
                  {#each category.tags as tagName}
                    {@const active = isTagActive(tagName)}
                    <button
                      class="btn btn-sm {active
                        ? 'btn-primary'
                        : 'btn-ghost'} w-full justify-start"
                      onclick={() => toggleTag(tagName, category.name)}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-4 w-4 {active ? '' : 'opacity-0'}"
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
                      {tagName}
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </div>

      <div class="divider"></div>

      <!-- Custom Tag Section -->
      <div>
        <h3 class="text-lg font-semibold mb-3">Custom Tag</h3>
        <div class="flex gap-2">
          <input
            type="text"
            placeholder="Enter custom tag..."
            class="input input-bordered input-sm flex-1"
            bind:value={customTagInput}
            onkeydown={(e) => {
              if (e.key === "Enter") {
                addCustomTag();
              }
            }}
          />
          <button class="btn btn-primary btn-sm" onclick={addCustomTag}>
            Add
          </button>
        </div>
      </div>

      {#if isBulkTagging}
        <div class="divider"></div>

        <!-- Action Buttons -->
        <div class="flex gap-2">
          <button class="btn btn-ghost flex-1" onclick={closeBulkTagEditor}>
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
            Cancel
          </button>
          <button
            class="btn btn-primary flex-1"
            onclick={applyBulkTags}
            disabled={imageTags.length === 0}
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
                d="M5 13l4 4L19 7"
              />
            </svg>
            Apply {imageTags.length > 0 ? imageTags.length : ""}
            {imageTags.length === 1
              ? "Tag"
              : imageTags.length > 1
                ? "Tags"
                : "Tags"}
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}

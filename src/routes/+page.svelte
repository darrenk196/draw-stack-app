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
    deleteImages,
    type Image,
    type Tag,
  } from "$lib/db";
  import { convertFileSrc } from "@tauri-apps/api/core";

  let searchQuery = $state("");
  let debouncedSearchQuery = $state("");
  let searchDebounceTimer: number | undefined;
  let viewMode: "grid" | "list" = $state("grid");
  // Selection mode toggle removed; selection is implicit when any image is selected
  let selectedImages = $state<Set<string>>(new Set());
  let lastSelectedIndex = $state<number>(-1);
  let showHelpModal = $state(false);
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
  let showDeleteConfirm = $state(false);
  let deleteCount = $state(0);
  let skipDeleteWarning = $state(false);

  // Pagination state
  const PAGINATION_STORAGE_KEY = "library-items-per-page";
  const DELETE_WARNING_KEY = "library-skip-delete-warning";

  function loadDeleteWarningPreference(): boolean {
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem(DELETE_WARNING_KEY) === "true";
  }

  let skipDeleteWarningPref = $state(loadDeleteWarningPreference());

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

  // Debounce search input
  $effect(() => {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      debouncedSearchQuery = searchQuery;
    }, 150) as unknown as number;
  });

  // Filtered images based on search query and active filters
  let filteredImages = $derived.by(() => {
    // If no filters or search, show all
    if (!debouncedSearchQuery.trim() && activeFilters.length === 0) {
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
      if (debouncedSearchQuery.trim()) {
        const query = debouncedSearchQuery.toLowerCase().trim();

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
    void debouncedSearchQuery;

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
        "Crouching",
        "Jumping",
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
    {
      name: "Clothing",
      tags: [
        "Casual",
        "Formal",
        "Athletic",
        "Swimwear",
        "Armor",
        "Robes",
        "Uniform",
        "Traditional",
      ],
    },
    {
      name: "Body Parts",
      tags: [
        "Hands",
        "Feet",
        "Face",
        "Torso",
        "Arms",
        "Legs",
        "Head",
        "Full Body",
      ],
    },
    {
      name: "Lighting",
      tags: [
        "Bright",
        "Dark",
        "Backlit",
        "Natural",
        "Dramatic",
        "Soft",
        "Studio",
      ],
    },
    {
      name: "Environment",
      tags: [
        "Indoor",
        "Outdoor",
        "Nature",
        "Urban",
        "Studio",
        "Fantasy Setting",
        "Abstract BG",
      ],
    },
  ];

  // Quick tag presets for bulk operations
  const quickTagPresets = [
    {
      name: "Female Standing Front",
      tags: ["Female", "Standing", "Front View"],
    },
    {
      name: "Male Standing Front",
      tags: ["Male", "Standing", "Front View"],
    },
    {
      name: "Female Sitting Side",
      tags: ["Female", "Sitting", "Side View"],
    },
    {
      name: "Male Action 3/4",
      tags: ["Male", "Action", "3/4 View"],
    },
    {
      name: "Hands Close-up",
      tags: ["Hands", "Bright", "Studio"],
    },
    {
      name: "Face Portrait",
      tags: ["Face", "Front View", "Studio"],
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

    // Reload library when page becomes visible (navigating back from other pages)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        console.log("Page became visible, reloading library...");
        loadLibraryImages();
      }
    };

    // Listen for custom library update events
    const handleLibraryUpdate = () => {
      console.log("Library update event received, reloading...");
      loadLibraryImages();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("library-updated", handleLibraryUpdate);
    window.addEventListener("keydown", handleKeydown);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("library-updated", handleLibraryUpdate);
      window.removeEventListener("keydown", handleKeydown);
    };
  });

  function handleItemsPerPageChange() {
    currentPage = 1;
    // Save to localStorage
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(PAGINATION_STORAGE_KEY, String(itemsPerPage));
    }
  }

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
    debouncedSearchQuery = "";
    currentPage = 1;
  }

  function selectAllImages() {
    selectedImages = new Set(displayedLibraryImages.map((img) => img.id));
    lastSelectedIndex = displayedLibraryImages.length - 1;
  }

  function clearSelection() {
    selectedImages = new Set();
    lastSelectedIndex = -1;
  }

  function toggleImageSelectionEnhanced(imageId: string, event: MouseEvent) {
    const imageIndex = filteredImages.findIndex((img) => img.id === imageId);

    // Ctrl+Click: Toggle single image
    if (event.ctrlKey) {
      event.preventDefault();
      const newSelection = new Set(selectedImages);
      if (newSelection.has(imageId)) {
        newSelection.delete(imageId);
      } else {
        newSelection.add(imageId);
      }
      selectedImages = newSelection;
      lastSelectedIndex = imageIndex;
      return;
    }

    // Shift+Click: Range select
    if (event.shiftKey && lastSelectedIndex >= 0) {
      event.preventDefault();
      const newSelection = new Set(selectedImages);
      const start = Math.min(lastSelectedIndex, imageIndex);
      const end = Math.max(lastSelectedIndex, imageIndex);
      for (let i = start; i <= end; i++) {
        newSelection.add(filteredImages[i].id);
      }
      selectedImages = newSelection;
      return;
    }

    // Regular behavior: toggle (for backwards compatibility with right-click)
    const newSelection = new Set(selectedImages);
    if (newSelection.has(imageId)) {
      newSelection.delete(imageId);
    } else {
      newSelection.add(imageId);
    }
    selectedImages = newSelection;
    lastSelectedIndex = imageIndex;
  }

  async function applyQuickPreset(preset: { name: string; tags: string[] }) {
    // Find or create all tags in the preset
    const presetTags: Tag[] = [];

    for (const tagName of preset.tags) {
      let tag = allTags.find((t) => t.name === tagName);
      if (!tag) {
        // Create the tag if it doesn't exist
        const tagId = generateId();
        tag = {
          id: tagId,
          name: tagName,
          parentId: null,
          createdAt: Date.now(),
        };
        await addTag(tag);
        allTags = [...allTags, tag];
      }
      presetTags.push(tag);
    }

    // Add these tags to the selection (avoid duplicates)
    const existingIds = new Set(imageTags.map((t) => t.id));
    const newTags = presetTags.filter((t) => !existingIds.has(t.id));
    imageTags = [...imageTags, ...newTags];
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
    // Help modal toggle
    if (e.key === "?" && !viewingImage && !isBulkTagging) {
      e.preventDefault();
      showHelpModal = !showHelpModal;
      return;
    }

    // Close help modal
    if (e.key === "Escape" && showHelpModal) {
      showHelpModal = false;
      return;
    }

    // Toggle select all / deselect all (Ctrl+A)
    if (e.key === "a" && e.ctrlKey && !viewingImage && !isBulkTagging) {
      e.preventDefault();
      if (selectedImages.size > 0) {
        clearSelection();
      } else {
        selectAllImages();
      }
      return;
    }

    // Open bulk tag editor (T key)
    if (
      e.key === "t" &&
      !viewingImage &&
      !isBulkTagging &&
      selectedImages.size > 0
    ) {
      e.preventDefault();
      openBulkTagEditor();
      return;
    }

    // Delete selected images (Delete key)
    if (
      e.key === "Delete" &&
      !viewingImage &&
      !isBulkTagging &&
      selectedImages.size > 0
    ) {
      e.preventDefault();
      deleteSelectedImages();
      return;
    }

    // Image viewer navigation
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
      selectedImages = new Set();

      // Reload image tags for filtering
      await loadAllImageTags();
    } catch (error) {
      console.error("Failed to apply bulk tags:", error);
    }
  }

  function deleteSelectedImages() {
    if (selectedImages.size === 0) return;

    // Check if user has disabled warnings
    if (skipDeleteWarningPref) {
      confirmDelete();
      return;
    }

    // Show confirmation dialog
    deleteCount = selectedImages.size;
    showDeleteConfirm = true;
  }

  async function confirmDelete() {
    showDeleteConfirm = false;

    // Save preference if checkbox was checked
    if (skipDeleteWarning) {
      localStorage.setItem(DELETE_WARNING_KEY, "true");
      skipDeleteWarningPref = true;
    }

    try {
      await deleteImages(Array.from(selectedImages));
      // Refresh library
      await loadLibraryImages();
      selectedImages = new Set();
      lastSelectedIndex = -1;
      skipDeleteWarning = false;
      // Notify other components to update library count
      window.dispatchEvent(new CustomEvent("library-updated"));
    } catch (error) {
      console.error("Failed to delete images:", error);
      alert(`Failed to delete images: ${error}`);
    }
  }

  function cancelDelete() {
    showDeleteConfirm = false;
    skipDeleteWarning = false;
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
        <!-- (Select Mode toggle removed; selection activates automatically) -->

        <!-- Selection Counter & Clear -->
        {#if selectedImages.size > 0}
          <div class="flex items-center gap-2">
            <span class="badge badge-primary badge-lg">
              {selectedImages.size} selected
            </span>
            <button
              class="btn btn-sm btn-ghost btn-circle"
              onclick={clearSelection}
              title="Clear selection (Esc)"
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
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        {/if}

        <!-- Tag Selected Button (prominent when images are selected) -->
        {#if selectedImages.size > 0}
          <button
            class="btn btn-sm btn-accent gap-2 animate-pulse"
            onclick={openBulkTagEditor}
            title="Tag selected images (T)"
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
                d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
              />
            </svg>
            Tag Selected
          </button>
          <button
            class="btn btn-sm btn-error gap-2"
            onclick={deleteSelectedImages}
            title="Delete selected images (Delete key)"
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
                d="M6 7h12M9 7V4h6v3m2 0v11a2 2 0 01-2 2H8a2 2 0 01-2-2V7h12z"
              />
            </svg>
            Delete Selected
          </button>
        {/if}

        <div class="divider divider-horizontal mx-0"></div>

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

        <!-- Help Button -->
        <button
          class="btn btn-sm btn-ghost btn-circle"
          onclick={() => (showHelpModal = true)}
          title="Keyboard shortcuts (?)"
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
              onclick={(e) => {
                // If there is an active selection or user holds Ctrl/Shift, treat click as selection
                if (
                  selectedImages.size > 0 ||
                  (e instanceof MouseEvent && (e.ctrlKey || e.shiftKey))
                ) {
                  toggleImageSelectionEnhanced(image.id, e as MouseEvent);
                } else {
                  openImageViewer(image);
                }
              }}
              oncontextmenu={(e) => {
                e.preventDefault();
                toggleImageSelectionEnhanced(image.id, e as MouseEvent);
              }}
            >
              <img
                src={convertFileSrc(image.fullPath)}
                alt={image.filename}
                class="w-full h-full object-cover transition-opacity duration-200"
                loading="lazy"
                decoding="async"
                style="background: linear-gradient(135deg, rgb(var(--b3)) 0%, rgb(var(--b2)) 100%);"
                onload={(e) =>
                  ((e.currentTarget as HTMLImageElement).style.opacity = "1")}
                style:opacity="0"
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
              onclick={(e) => {
                if (
                  selectedImages.size > 0 ||
                  (e instanceof MouseEvent && (e.ctrlKey || e.shiftKey))
                ) {
                  toggleImageSelectionEnhanced(image.id, e as MouseEvent);
                } else {
                  openImageViewer(image);
                }
              }}
              oncontextmenu={(e) => {
                e.preventDefault();
                toggleImageSelectionEnhanced(image.id, e as MouseEvent);
              }}
            >
              <div class="relative w-20 h-20 flex-shrink-0">
                <img
                  src={convertFileSrc(image.fullPath)}
                  alt={image.filename}
                  class="w-full h-full object-cover rounded transition-opacity duration-200"
                  loading="lazy"
                  decoding="async"
                  style="background: linear-gradient(135deg, rgb(var(--b3)) 0%, rgb(var(--b2)) 100%);"
                  onload={(e) =>
                    ((e.currentTarget as HTMLImageElement).style.opacity = "1")}
                  style:opacity="0"
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
              <div
                class="badge badge-primary gap-2 max-w-[200px]"
                title={tag.name}
              >
                <span class="truncate">{tag.name}</span>
                <button
                  class="btn btn-circle btn-ghost btn-xs flex-shrink-0"
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

      {#if isBulkTagging}
        <div class="divider my-2"></div>

        <!-- Quick Tag Presets -->
        <div>
          <h4 class="text-sm font-semibold mb-2 text-base-content/70">
            Quick Presets
          </h4>
          <div class="grid grid-cols-1 gap-1">
            {#each quickTagPresets as preset}
              <button
                class="btn btn-xs btn-ghost justify-start text-left"
                onclick={() => applyQuickPreset(preset)}
                title={preset.tags.join(" + ")}
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
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
                <span class="text-xs truncate">{preset.name}</span>
              </button>
            {/each}
          </div>
        </div>
      {/if}

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

<!-- Delete Confirmation Modal -->
{#if showDeleteConfirm}
  <div
    class="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-8"
  >
    <div class="bg-base-100 rounded-lg shadow-xl max-w-md w-full p-6">
      <div class="flex items-start gap-4 mb-6">
        <div class="flex-shrink-0">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-8 w-8 text-warning"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <div class="flex-1">
          <h3 class="text-lg font-bold mb-2">Delete Images</h3>
          <p class="text-base-content/80">
            Delete {deleteCount} selected image{deleteCount !== 1 ? "s" : ""}?
            This cannot be undone.
          </p>
          <div class="form-control mt-4">
            <label class="label cursor-pointer justify-start gap-3">
              <input
                type="checkbox"
                class="checkbox checkbox-sm"
                bind:checked={skipDeleteWarning}
              />
              <span class="label-text">Don't show this warning again</span>
            </label>
          </div>
        </div>
      </div>
      <div class="flex gap-2 justify-end">
        <button class="btn btn-ghost" onclick={cancelDelete}> Cancel </button>
        <button class="btn btn-error" onclick={confirmDelete}> Delete </button>
      </div>
    </div>
  </div>
{/if}

<!-- Help Modal -->
{#if showHelpModal}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-8"
    onclick={() => (showHelpModal = false)}
  >
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="bg-base-100 rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
      onclick={(e) => e.stopPropagation()}
    >
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-2xl font-bold">Keyboard Shortcuts</h2>
        <button
          class="btn btn-circle btn-ghost btn-sm"
          onclick={() => (showHelpModal = false)}
          aria-label="Close help"
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

      <div class="space-y-6">
        <!-- Selection Section -->
        <div>
          <h3 class="text-lg font-semibold mb-3 text-primary">Selection</h3>
          <div class="space-y-2">
            <div class="flex justify-between items-center">
              <span class="text-sm">Toggle selection mode</span>
              <kbd class="kbd kbd-sm">Toggle in toolbar</kbd>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm">Toggle select all / deselect all</span>
              <kbd class="kbd kbd-sm">Ctrl+A</kbd>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm">Multi-select (add/remove)</span>
              <div class="flex gap-1">
                <kbd class="kbd kbd-sm">Ctrl</kbd>
                <span class="text-xs">+</span>
                <kbd class="kbd kbd-sm">Click</kbd>
              </div>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm">Range select</span>
              <div class="flex gap-1">
                <kbd class="kbd kbd-sm">Shift</kbd>
                <span class="text-xs">+</span>
                <kbd class="kbd kbd-sm">Click</kbd>
              </div>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm">Quick select (context menu)</span>
              <kbd class="kbd kbd-sm">Right-Click</kbd>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm">Delete selected images</span>
              <kbd class="kbd kbd-sm">Delete</kbd>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm">Toggle single image</span>
              <div class="flex gap-1">
                <kbd class="kbd kbd-sm">Ctrl</kbd>
                <span class="text-xs">+</span>
                <kbd class="kbd kbd-sm">Click</kbd>
              </div>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm">Range select images</span>
              <div class="flex gap-1">
                <kbd class="kbd kbd-sm">Shift</kbd>
                <span class="text-xs">+</span>
                <kbd class="kbd kbd-sm">Click</kbd>
              </div>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm">Toggle image (alternative)</span>
              <kbd class="kbd kbd-sm">Right-Click</kbd>
            </div>
          </div>
        </div>

        <!-- Tagging Section -->
        <div>
          <h3 class="text-lg font-semibold mb-3 text-primary">Tagging</h3>
          <div class="space-y-2">
            <div class="flex justify-between items-center">
              <span class="text-sm">Open bulk tag editor</span>
              <kbd class="kbd kbd-sm">T</kbd>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm">Apply tags (in bulk editor)</span>
              <kbd class="kbd kbd-sm">Click "Apply Tags"</kbd>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm">Cancel bulk tagging</span>
              <kbd class="kbd kbd-sm">Esc</kbd>
            </div>
          </div>
        </div>

        <!-- Navigation Section -->
        <div>
          <h3 class="text-lg font-semibold mb-3 text-primary">Image Viewer</h3>
          <div class="space-y-2">
            <div class="flex justify-between items-center">
              <span class="text-sm">Previous image</span>
              <kbd class="kbd kbd-sm">←</kbd>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm">Next image</span>
              <kbd class="kbd kbd-sm">→</kbd>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm">Close viewer</span>
              <kbd class="kbd kbd-sm">Esc</kbd>
            </div>
          </div>
        </div>

        <!-- General Section -->
        <div>
          <h3 class="text-lg font-semibold mb-3 text-primary">General</h3>
          <div class="space-y-2">
            <div class="flex justify-between items-center">
              <span class="text-sm">Show this help</span>
              <kbd class="kbd kbd-sm">?</kbd>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm">Close modals</span>
              <kbd class="kbd kbd-sm">Esc</kbd>
            </div>
          </div>
        </div>

        <!-- Settings Section -->
        <div>
          <h3 class="text-lg font-semibold mb-3 text-primary">Settings</h3>
          <div class="space-y-2">
            <div class="form-control">
              <label class="label cursor-pointer justify-start gap-3">
                <input
                  type="checkbox"
                  class="checkbox checkbox-sm"
                  checked={!skipDeleteWarningPref}
                  onchange={(e) => {
                    const showWarning = e.currentTarget.checked;
                    skipDeleteWarningPref = !showWarning;
                    if (showWarning) {
                      localStorage.removeItem(DELETE_WARNING_KEY);
                    } else {
                      localStorage.setItem(DELETE_WARNING_KEY, "true");
                    }
                  }}
                />
                <span class="label-text">Show delete confirmation warning</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      <div class="mt-6 p-4 bg-base-200 rounded-lg">
        <p class="text-sm text-base-content/70">
          <strong>Tip:</strong> Enable "Select Mode" in the toolbar for easier multi-selection
          without holding Ctrl. Use quick presets in the bulk tag editor to apply
          common tag combinations instantly!
        </p>
      </div>
    </div>
  </div>
{/if}

<script lang="ts">
  import { onMount } from "svelte";
  import {
    getLibraryImages,
    getAllTags,
    getTagsForImage,
    getTagsForImages,
    addImageTag,
    removeImageTag,
    addTag,
    generateId,
    getRecentlyUsedTags,
    buildTagPath,
    updateTagUsage,
    deleteImages,
    deleteTag,
    deleteTagsByCategory,
    type Image,
    type Tag,
  } from "$lib/db";
  import { convertFileSrc } from "@tauri-apps/api/core";
  import { toast } from "$lib/toast";
  import { focusTrap } from "$lib/focusTrap";
  import { ScreenReaderAnnouncer } from "$lib/accessibility";
  import {
    STORAGE_KEYS,
    PAGINATION,
    TAG_SYSTEM,
    DEFAULT_TAG_CATEGORIES,
    UI,
    VIRTUAL_SCROLL,
  } from "$lib/constants";
  import ImageGrid from "$lib/components/ImageGrid.svelte";
  import VirtualImageGrid from "$lib/components/VirtualImageGrid.svelte";
  import SearchAndFilter from "$lib/components/SearchAndFilter.svelte";

  // Initialize screen reader announcer
  const announcer = new ScreenReaderAnnouncer();

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
  let newCategoryName = $state("");
  let newTagName = $state("");
  let selectedCategoryForNewTag = $state("");
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
  let isDeletingImages = $state(false);
  let isApplyingBulkTags = $state(false);

  // Progress tracking
  let bulkOperationProgress = $state({ current: 0, total: 0, label: "" });
  let showProgress = $state(false);

  // Delete confirmation modals
  let deleteTagModal = $state<{
    tagId: string;
    tagName: string;
    categoryName?: string;
  } | null>(null);
  let deleteCategoryModal = $state<{
    categoryName: string;
    isDefault: boolean;
    tagCount: number;
  } | null>(null);

  // Custom categories persistence
  function loadCustomCategories(): Set<string> {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.CUSTOM_CATEGORIES);
      if (!raw) return new Set();
      const arr = JSON.parse(raw);
      return new Set(Array.isArray(arr) ? arr : []);
    } catch (e) {
      console.warn("Failed to load custom categories", e);
      return new Set();
    }
  }
  function saveCustomCategories(set: Set<string>) {
    try {
      localStorage.setItem(
        STORAGE_KEYS.CUSTOM_CATEGORIES,
        JSON.stringify(Array.from(set))
      );
    } catch (e) {
      console.warn("Failed to save custom categories", e);
    }
  }
  let customCategories = $state<Set<string>>(loadCustomCategories());

  // Tag categories persistence
  function loadTagCategories() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.TAG_CATEGORIES);
      if (!raw) return null;
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : null;
    } catch (e) {
      console.warn("Failed to load tag categories", e);
      return null;
    }
  }
  function saveTagCategories(
    categories: Array<{ name: string; tags: string[] }>
  ) {
    try {
      localStorage.setItem(
        STORAGE_KEYS.TAG_CATEGORIES,
        JSON.stringify(categories)
      );
    } catch (e) {
      console.warn("Failed to save tag categories", e);
    }
  }

  // Hidden categories persistence
  function loadHiddenCategories(): Set<string> {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.HIDDEN_CATEGORIES);
      if (!raw) return new Set();
      const arr = JSON.parse(raw);
      return new Set(Array.isArray(arr) ? arr : []);
    } catch (e) {
      console.warn("Failed to load hidden categories", e);
      return new Set();
    }
  }
  function saveHiddenCategories(set: Set<string>) {
    try {
      localStorage.setItem(
        STORAGE_KEYS.HIDDEN_CATEGORIES,
        JSON.stringify(Array.from(set))
      );
    } catch (e) {
      console.warn("Failed to save hidden categories", e);
    }
  }
  let hiddenCategories = $state<Set<string>>(loadHiddenCategories());

  // Pagination state
  function loadDeleteWarningPreference(): boolean {
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem(STORAGE_KEYS.DELETE_WARNING) === "true";
  }

  function loadTagDeleteWarningPreference(): boolean {
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem(STORAGE_KEYS.TAG_DELETE_WARNING) === "true";
  }

  let skipDeleteWarningPref = $state(loadDeleteWarningPreference());
  let skipTagDeleteWarningPref = $state(loadTagDeleteWarningPreference());

  function loadItemsPerPage(): number | "all" {
    if (typeof localStorage === "undefined")
      return PAGINATION.DEFAULT_ITEMS_PER_PAGE;
    const stored = localStorage.getItem(STORAGE_KEYS.PAGINATION);
    if (!stored) return PAGINATION.DEFAULT_ITEMS_PER_PAGE;
    if (stored === "all") return "all";
    const parsed = parseInt(stored);
    return isNaN(parsed) ? PAGINATION.DEFAULT_ITEMS_PER_PAGE : parsed;
  }

  let itemsPerPage = $state<number | "all">(loadItemsPerPage());
  let currentPage = $state(1);

  // Sort state
  type SortOrder = "newest" | "oldest";

  function loadSortOrder(): SortOrder {
    if (typeof localStorage === "undefined") return "newest";
    const stored = localStorage.getItem(STORAGE_KEYS.SORT_ORDER);
    return (stored === "oldest" ? "oldest" : "newest") as SortOrder;
  }

  function saveSortOrder(order: SortOrder) {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(STORAGE_KEYS.SORT_ORDER, order);
  }

  let sortOrder = $state<SortOrder>(loadSortOrder());

  // Debounce search input
  $effect(() => {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      debouncedSearchQuery = searchQuery;
    }, UI.DEBOUNCE_MS) as unknown as number;
  });

  // Filtered images based on search query and active filters
  let filteredImages = $derived.by(() => {
    let images = libraryImages;

    // Only apply filtering if there are actual filters or search queries
    // This is an optimization: when loading all with no filters, skip the expensive filter operation
    if (debouncedSearchQuery.trim() || activeFilters.length > 0) {
      // Pre-build image tag paths once to avoid recalculating inside filter loop
      const imageTagPathsMap = new Map<string, string[]>();
      const imageTagNamesMap = new Map<string, string[]>();

      for (const image of libraryImages) {
        const imageTags = allImageTags.get(image.id) || [];
        imageTagPathsMap.set(
          image.id,
          imageTags.map((tag) => buildTagPath(tag, allTags).toLowerCase())
        );
        imageTagNamesMap.set(
          image.id,
          imageTags.map((tag) => tag.name.toLowerCase())
        );
      }

      images = libraryImages.filter((image) => {
        const imageTagPaths = imageTagPathsMap.get(image.id) || [];
        const imageTagNames = imageTagNamesMap.get(image.id) || [];

        // Check if image matches all active filters (AND logic)
        const matchesFilters = activeFilters.every((filter) => {
          const filterLower = filter.toLowerCase();
          // Use exact match for tag paths to avoid partial matches (e.g., "Male" matching "Female")
          return imageTagPaths.some((path) => path === filterLower);
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

          // Check if any tag matches (partial match is OK for search)
          return (
            imageTagPaths.some((path) => path.includes(query)) ||
            imageTagNames.some((name) => name.includes(query))
          );
        }

        return true;
      });
    }

    // Apply sorting by date added
    const sorted = [...images].sort((a, b) => {
      const aTime = a.addedToLibraryAt || 0;
      const bTime = b.addedToLibraryAt || 0;
      return sortOrder === "newest" ? bTime - aTime : aTime - bTime;
    });

    return sorted;
  });

  // Pagination calculations
  let totalPages = $derived(
    itemsPerPage === "all" ? 1 : Math.ceil(filteredImages.length / itemsPerPage)
  );

  let displayedLibraryImages = $derived.by(() => {
    if (itemsPerPage === "all") {
      // Load all images at once - Svelte's virtual scrolling and
      // lazy loading of images handles the rendering efficiently
      return filteredImages;
    }
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredImages.slice(startIndex, endIndex);
  });

  // Reset to page 1 when filters change
  $effect(() => {
    // Track only the dependencies that should trigger a reset
    const filterCount = activeFilters.length;
    const searchText = debouncedSearchQuery;

    // Reset page
    currentPage = 1;
  });

  let tagCategories = $state<Array<{ name: string; tags: string[] }>>(
    loadTagCategories() || DEFAULT_TAG_CATEGORIES
  );

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
      localStorage.setItem(STORAGE_KEYS.PAGINATION, String(itemsPerPage));
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
      const imageIds = libraryImages.map((img) => img.id);
      allImageTags = await getTagsForImages(imageIds);
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
      .slice(0, TAG_SYSTEM.MAX_RECENT_TAGS); // Show max suggestions

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

    // Calculate which page the current image is on and navigate to it
    if (viewingImage && itemsPerPage !== "all") {
      const imageIndex = filteredImages.findIndex(
        (img) => img.id === viewingImage!.id
      );
      if (imageIndex >= 0) {
        const pageNumber = Math.floor(imageIndex / itemsPerPage) + 1;
        if (pageNumber !== currentPage) {
          currentPage = pageNumber;
        }
      }
    }

    viewingImage = null;
    imageTags = [];
  }

  async function navigateImage(direction: "prev" | "next") {
    if (!viewingImage || filteredImages.length === 0) return;

    const currentIndex = filteredImages.findIndex(
      (img) => img.id === viewingImage!.id
    );
    if (currentIndex === -1) return;

    let newIndex;
    if (direction === "prev") {
      newIndex =
        currentIndex === 0 ? filteredImages.length - 1 : currentIndex - 1;
    } else {
      newIndex =
        currentIndex === filteredImages.length - 1 ? 0 : currentIndex + 1;
    }

    await openImageViewer(filteredImages[newIndex]);
  }

  function toggleCurrentImageSelection() {
    if (!viewingImage) return;
    const imageId = viewingImage.id;
    const newSelection = new Set(selectedImages);
    if (newSelection.has(imageId)) {
      newSelection.delete(imageId);
    } else {
      newSelection.add(imageId);
    }
    selectedImages = newSelection;

    // Keep lastSelectedIndex in sync with current image for subsequent range selections
    const idx = filteredImages.findIndex((img) => img.id === imageId);
    if (idx >= 0) {
      lastSelectedIndex = idx;
    }
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
    } else if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      toggleCurrentImageSelection();
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

  async function handleDeleteTag(
    tagId: string,
    tagName: string,
    categoryName?: string
  ) {
    if (skipTagDeleteWarningPref) {
      // Skip modal, delete directly
      await confirmDeleteTag(tagId, tagName, categoryName);
    } else {
      deleteTagModal = { tagId, tagName, categoryName };
    }
  }

  async function confirmDeleteTag(
    paramTagId?: string,
    paramTagName?: string,
    paramCategoryName?: string
  ) {
    let tagId: string, tagName: string, categoryName: string | undefined;

    if (paramTagId && paramTagName) {
      // Called directly with parameters
      tagId = paramTagId;
      tagName = paramTagName;
      categoryName = paramCategoryName;
    } else if (deleteTagModal) {
      // Called from modal
      ({ tagId, tagName, categoryName } = deleteTagModal);
      deleteTagModal = null;
    } else {
      return;
    }

    try {
      // Delete from database if it exists
      if (tagId) {
        await deleteTag(tagId);
        await loadAllTags();
      }

      // Remove from template category if specified
      if (categoryName) {
        const categoryIndex = tagCategories.findIndex(
          (c) => c.name === categoryName
        );
        if (categoryIndex !== -1) {
          const tagIndex = tagCategories[categoryIndex].tags.indexOf(tagName);
          if (tagIndex !== -1) {
            tagCategories[categoryIndex].tags.splice(tagIndex, 1);
            tagCategories = [...tagCategories];
            saveTagCategories(tagCategories);
          }
        }
      }
      toast.success(`Tag "${tagName}" deleted`);
    } catch (err) {
      console.error("Failed to delete tag:", err);
      toast.error("Failed to delete tag");
    }
  }

  async function handleDeleteCategory(
    categoryName: string,
    isDefault: boolean = false
  ) {
    const tagsInCategory = allTags.filter((t) => t.parentId === categoryName);
    const tagCount = tagsInCategory.length;

    if (skipTagDeleteWarningPref) {
      // Skip modal, delete directly
      await confirmDeleteCategory(categoryName, isDefault, tagCount);
    } else {
      deleteCategoryModal = { categoryName, isDefault, tagCount };
    }
  }

  async function confirmDeleteCategory(
    paramCategoryName?: string,
    paramIsDefault?: boolean,
    paramTagCount?: number
  ) {
    let categoryName: string, isDefault: boolean, tagCount: number;

    if (paramCategoryName !== undefined) {
      // Called directly with parameters
      categoryName = paramCategoryName;
      isDefault = paramIsDefault ?? false;
      tagCount = paramTagCount ?? 0;
    } else if (deleteCategoryModal) {
      // Called from modal
      ({ categoryName, isDefault, tagCount } = deleteCategoryModal);
      deleteCategoryModal = null;
    } else {
      return;
    }

    try {
      await deleteTagsByCategory(categoryName);

      if (isDefault) {
        // Hide default categories
        hiddenCategories.add(categoryName);
        hiddenCategories = new Set(hiddenCategories);
        saveHiddenCategories(hiddenCategories);
      } else {
        // Remove custom categories completely
        customCategories.delete(categoryName);
        customCategories = new Set(customCategories);
        saveCustomCategories(customCategories);
      }

      expandedCategories.delete(categoryName);
      expandedCategories = new Set(expandedCategories);
      await loadAllTags();

      const action = isDefault ? "hidden" : "deleted";
      toast.success(`Category "${categoryName}" ${action}`);
    } catch (err) {
      console.error("Failed to delete category:", err);
      toast.error("Failed to delete category");
    }
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
        // Find tag by name AND category to avoid reusing deleted tags
        let tag = allTags.find(
          (t) => t.name === tagName && t.parentId === (categoryName || null)
        );

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
      // Find or create tag - match by name AND category to avoid reusing deleted tags
      let tag = allTags.find(
        (t) => t.name === tagName && t.parentId === (categoryName || null)
      );

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

    isApplyingBulkTags = true;
    showProgress = true;
    const imageCount = selectedImages.size;
    const tagCount = imageTags.length;
    const totalOperations = imageCount * tagCount;
    let completedOperations = 0;
    let successCount = 0;
    let failCount = 0;

    try {
      console.log(`Applying ${tagCount} tags to ${imageCount} images...`);
      bulkOperationProgress = {
        current: 0,
        total: totalOperations,
        label: "Applying tags",
      };

      // Apply all selected tags to all selected images
      for (const imageId of selectedImages) {
        for (const tag of imageTags) {
          try {
            await addImageTag(imageId, tag.id);
            successCount++;
          } catch (error) {
            console.error(`Failed to add tag ${tag.name} to image:`, error);
            failCount++;
          }
          completedOperations++;
          bulkOperationProgress = {
            ...bulkOperationProgress,
            current: completedOperations,
          };
        }
      }

      console.log(
        `Successfully applied ${successCount} tags (${failCount} failed)`
      );

      // Close bulk editor and clear selection
      closeBulkTagEditor();
      selectedImages = new Set();

      // Reload image tags for filtering
      await loadAllImageTags();

      // Show results
      const successMsg = `Applied ${tagCount} tag${tagCount !== 1 ? "s" : ""} to ${imageCount} image${imageCount !== 1 ? "s" : ""}`;
      if (failCount > 0) {
        toast.success(`${successMsg} (${failCount} operations failed)`);
        announcer.announce(`${successMsg}, ${failCount} failed`);
      } else {
        toast.success(successMsg);
        announcer.announce(successMsg);
      }
    } catch (error) {
      console.error("Failed to apply bulk tags:", error);
      toast.error("Failed to apply tags");
      announcer.announce("Failed to apply tags");
    } finally {
      isApplyingBulkTags = false;
      showProgress = false;
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
    isDeletingImages = true;
    showProgress = true;

    // Save preference if checkbox was checked
    if (skipDeleteWarning) {
      localStorage.setItem(STORAGE_KEYS.DELETE_WARNING, "true");
      skipDeleteWarningPref = true;
    }

    const deleteCount = selectedImages.size;
    const imagesToDelete = Array.from(selectedImages);
    bulkOperationProgress = {
      current: 0,
      total: deleteCount,
      label: "Deleting images",
    };

    try {
      // Delete images one by one to track progress
      let successCount = 0;
      let failCount = 0;

      for (let i = 0; i < imagesToDelete.length; i++) {
        try {
          await deleteImages([imagesToDelete[i]]);
          successCount++;
        } catch (error) {
          console.error(`Failed to delete image:`, error);
          failCount++;
        }
        bulkOperationProgress = {
          ...bulkOperationProgress,
          current: i + 1,
        };
      }

      // Refresh library
      await loadLibraryImages();
      selectedImages = new Set();
      lastSelectedIndex = -1;
      skipDeleteWarning = false;

      // Notify other components to update library count
      window.dispatchEvent(new CustomEvent("library-updated"));

      // Show results
      if (failCount > 0) {
        toast.success(
          `Deleted ${successCount} of ${deleteCount} images (${failCount} failed)`
        );
        announcer.announce(
          `Deleted ${successCount} images, ${failCount} failed`
        );
      } else {
        toast.success(
          `Successfully deleted ${deleteCount} image${deleteCount !== 1 ? "s" : ""}`
        );
        announcer.announce(
          `Successfully deleted ${deleteCount} image${deleteCount !== 1 ? "s" : ""}`
        );
      }
    } catch (error) {
      console.error("Failed to delete images:", error);
      toast.error(
        "Unable to delete images. Please check that the files are not in use and try again."
      );
      announcer.announce("Failed to delete images");
    } finally {
      isDeletingImages = false;
      showProgress = false;
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
      toast.warning(
        "No images to practice with. Select images or apply filters."
      );
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

<div class="h-full flex flex-col bg-cream">
  <!-- Header -->
  <header class="p-6 border-b border-warm-beige bg-white">
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-3">
        <h1 class="text-2xl font-semibold text-warm-charcoal">Library</h1>
        <button
          class="btn btn-sm btn-circle btn-ghost text-warm-gray hover:bg-warm-beige/30"
          onclick={() => (showHelpModal = true)}
          title="Show keyboard shortcuts and help"
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
      </div>

      <div class="flex items-center gap-3">
        <!-- (Select Mode toggle removed; selection activates automatically) -->

        <!-- Selection Counter & Clear -->
        {#if selectedImages.size > 0}
          <div class="flex items-center gap-2">
            <span
              class="badge rounded-full bg-terracotta text-white border-none text-sm font-medium h-auto min-h-0 px-4 py-2.5"
            >
              {selectedImages.size} selected
            </span>
            <button
              class="btn btn-sm btn-ghost btn-circle text-warm-gray hover:bg-warm-beige/30"
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
            class="btn btn-sm rounded-full bg-terracotta hover:bg-terracotta-dark text-white border-none gap-2 animate-pulse px-5 py-2.5 h-auto min-h-0"
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

        <div class="divider divider-horizontal mx-0"></div>

        <!-- Sort Order Dropdown -->
        <select
          class="select select-sm select-bordered w-36"
          bind:value={sortOrder}
          onchange={() => saveSortOrder(sortOrder)}
          title="Sort by date added"
        >
          <option value="newest">Newest First</option>
          <option value="oldest">Oldest First</option>
        </select>

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

        <button
          class="btn btn-sm rounded-full bg-terracotta hover:bg-terracotta-dark text-white border-none gap-2 px-5 py-2.5 h-auto min-h-0"
          onclick={startPractice}
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

    <SearchAndFilter
      bind:searchQuery
      bind:showSearchSuggestions
      {activeFilters}
      {recentTags}
      {searchSuggestions}
      {selectedSuggestionIndex}
      onSearchInput={handleSearchInput}
      onSearchKeydown={handleSearchKeydown}
      onSuggestionSelect={selectSearchSuggestion}
      onFilterAdd={addFilter}
      onFilterRemove={removeFilter}
      onClearAllFilters={clearAllFilters}
      {buildTagPath}
      {allTags}
    />
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
          class="h-24 w-24 text-warm-gray mb-4"
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
        <h2 class="text-xl font-medium mb-2 text-warm-charcoal">
          Your library is empty
        </h2>
        <p class="text-warm-gray mb-4">
          Go to Packs and add images to your library
        </p>
        <a
          href="/packs"
          class="btn rounded-full bg-terracotta hover:bg-terracotta-dark text-white border-none px-6 py-3"
        >
          Go to Packs
        </a>
      </div>
    {:else if filteredImages.length === 0 && (searchQuery.trim() || activeFilters.length > 0)}
      <div class="flex flex-col items-center justify-center h-full text-center">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-24 w-24 text-warm-gray mb-4"
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
        <h2 class="text-xl font-medium mb-2 text-warm-charcoal">
          No images found
        </h2>
        <p class="text-warm-gray mb-4">
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
        class="mb-4 flex items-center justify-between border-b border-warm-beige pb-4"
      >
        <div class="flex items-center gap-3">
          <span class="text-sm text-warm-gray">Items per page:</span>
          <select
            class="select select-sm select-bordered"
            bind:value={itemsPerPage}
            onchange={handleItemsPerPageChange}
          >
            {#each PAGINATION.OPTIONS as option}
              <option value={option.value}>{option.label}</option>
            {/each}
          </select>
        </div>
        <div class="text-sm text-warm-gray">
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

      {#if itemsPerPage === "all" && filteredImages.length > VIRTUAL_SCROLL.THRESHOLD}
        <!-- Virtual scrolling for large "all" lists -->
        <VirtualImageGrid
          images={filteredImages}
          {viewMode}
          {selectedImages}
          {allImageTags}
          onImageClick={openImageViewer}
          onImageSelect={toggleImageSelectionEnhanced}
          {buildTagPath}
          {allTags}
        />
      {:else}
        <!-- Regular pagination rendering -->
        <ImageGrid
          images={displayedLibraryImages}
          {viewMode}
          {selectedImages}
          {allImageTags}
          {currentPage}
          {totalPages}
          {itemsPerPage}
          onImageClick={openImageViewer}
          onImageSelect={toggleImageSelectionEnhanced}
          onNextPage={nextPage}
          onPreviousPage={previousPage}
          {buildTagPath}
          {allTags}
        />
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
          <p class="text-warm-gray">
            Add tags to {selectedImages.size} selected image{selectedImages.size !==
            1
              ? "s"
              : ""}
          </p>
          <p class="text-sm text-warm-gray">
            Select tags from the panel on the right, then click "Apply Tags"
          </p>
        </div>
      {:else if viewingImage}
        <div
          class="w-full h-full flex flex-col items-center justify-center gap-4 p-8"
        >
          <div
            class="flex-1 flex items-center justify-center w-full min-h-0 overflow-hidden"
          >
            <img
              src={convertFileSrc(viewingImage.fullPath)}
              alt={viewingImage.filename}
              class="max-w-full max-h-full object-contain"
            />
          </div>
          <div class="flex items-center gap-4 text-white flex-shrink-0">
            <div class="text-center">
              <p class="font-medium text-lg">{viewingImage.filename}</p>
              <p class="text-sm text-white/70">
                {filteredImages.findIndex(
                  (img) => img.id === viewingImage?.id
                ) + 1} of {filteredImages.length}
              </p>
            </div>
            <button
              class="btn rounded-full bg-terracotta hover:bg-terracotta-dark text-white border-none gap-2 px-5 py-2.5"
              onclick={(e) => {
                e.stopPropagation();
                toggleCurrentImageSelection();
              }}
            >
              {selectedImages.has(viewingImage.id)
                ? "Remove from Selection"
                : "Add to Selection"}
            </button>
          </div>
        </div>
      {/if}
    </div>

    <!-- Tag Manager Panel -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="w-80 bg-white border-l border-warm-beige h-full overflow-y-auto p-6 space-y-6"
      onclick={(e) => e.stopPropagation()}
    >
      <!-- Active Tags Section -->
      <div>
        <h3 class="text-lg font-semibold text-warm-charcoal mb-3">
          {isBulkTagging ? "Tags to Apply" : "Active Tags"}
        </h3>
        {#if imageTags.length === 0}
          <p class="text-sm text-warm-gray">
            {isBulkTagging ? "Select tags below to apply" : "No tags yet"}
          </p>
        {:else}
          <div class="flex flex-wrap gap-2">
            {#each imageTags as tag}
              <div
                class="badge rounded-full bg-terracotta text-white border-none gap-2 max-w-[200px] text-sm font-medium h-auto min-h-0 px-3.5 py-2"
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
          <h4 class="text-sm font-semibold mb-2 text-warm-gray">
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
        <h3 class="text-lg font-semibold text-warm-charcoal mb-3">
          Tag Categories
        </h3>
        <div class="space-y-3">
          {#each tagCategories.filter((cat) => !hiddenCategories.has(cat.name)) as category}
            <div class="border border-warm-beige rounded-lg">
              <div class="flex items-center">
                <button
                  class="flex-1 flex items-center justify-between p-3 hover:bg-warm-beige/30 transition-colors"
                  onclick={() => toggleCategory(category.name)}
                >
                  <span class="font-medium text-warm-charcoal"
                    >{category.name}</span
                  >
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
                <button
                  class="btn btn-ghost btn-sm btn-square mr-2"
                  onclick={(e) => {
                    e.stopPropagation();
                    handleDeleteCategory(category.name, true);
                  }}
                  title="Delete category"
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
              <!-- Category Tags -->
              {#if expandedCategories.has(category.name)}
                <div class="p-3 pt-0 space-y-2">
                  {#each category.tags as tagName}
                    {@const active = isTagActive(tagName)}
                    {@const dbTag = allTags.find(
                      (t) => t.name === tagName && t.parentId === category.name
                    )}
                    <div class="flex items-center gap-1">
                      <button
                        class="btn btn-sm rounded-full {active
                          ? 'bg-terracotta text-white border-none'
                          : 'btn-ghost text-warm-charcoal hover:bg-warm-beige/30'} flex-1 justify-start"
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
                      <button
                        class="btn btn-ghost btn-xs btn-square"
                        onclick={(e) => {
                          e.stopPropagation();
                          handleDeleteTag(
                            dbTag?.id || "",
                            tagName,
                            category.name
                          );
                        }}
                        title="Delete tag"
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
                  <!-- Dynamic tags from database for this category -->
                  {#each allTags.filter((t) => t.parentId === category.name && !category.tags.includes(t.name)) as tag}
                    {@const active = imageTags.some((t) => t.id === tag.id)}
                    <div class="flex items-center gap-1">
                      <button
                        class="btn btn-sm rounded-full {active
                          ? 'bg-terracotta text-white border-none'
                          : 'btn-ghost text-warm-charcoal hover:bg-warm-beige/30'} flex-1 justify-start"
                        onclick={() => toggleTag(tag.name, category.name)}
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
                        {tag.name}
                      </button>
                      <button
                        class="btn btn-ghost btn-xs btn-square"
                        onclick={(e) => {
                          e.stopPropagation();
                          handleDeleteTag(tag.id, tag.name);
                        }}
                        title="Delete tag"
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
          {/each}

          <!-- Custom Categories -->
          {#each Array.from(customCategories) as customCat}
            {@const customTags = allTags.filter(
              (t) => t.parentId === customCat
            )}
            <div class="border border-warm-beige rounded-lg">
              <div class="flex items-center">
                <button
                  class="flex-1 flex items-center justify-between p-3 hover:bg-warm-beige/30 transition-colors"
                  onclick={() => toggleCategory(customCat)}
                >
                  <span class="font-medium text-warm-charcoal">{customCat}</span
                  >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-5 w-5 transition-transform {expandedCategories.has(
                      customCat
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
                <button
                  class="btn btn-ghost btn-sm btn-square mr-2"
                  onclick={(e) => {
                    e.stopPropagation();
                    handleDeleteCategory(customCat);
                  }}
                  title="Delete category"
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

              {#if expandedCategories.has(customCat)}
                <div class="p-3 pt-0 space-y-2">
                  {#if customTags.length === 0}
                    <p class="text-sm text-warm-gray text-center py-2">
                      No tags yet
                    </p>
                  {:else}
                    {#each customTags as tag}
                      {@const active = imageTags.some((t) => t.id === tag.id)}
                      <div class="flex items-center gap-1">
                        <button
                          class="btn btn-sm rounded-full {active
                            ? 'bg-terracotta text-white border-none'
                            : 'btn-ghost text-warm-charcoal hover:bg-warm-beige/30'} flex-1 justify-start"
                          onclick={() => toggleTag(tag.name, customCat)}
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
                          {tag.name}
                        </button>
                        <button
                          class="btn btn-ghost btn-xs btn-square"
                          onclick={(e) => {
                            e.stopPropagation();
                            handleDeleteTag(tag.id, tag.name);
                          }}
                          title="Delete tag"
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
                  {/if}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </div>

      <div class="divider"></div>

      <!-- Custom Category Section -->
      <div class="bg-warm-beige/30 rounded-lg p-4">
        <h3 class="text-base font-semibold text-warm-charcoal mb-3">
          Add Category
        </h3>
        <div class="flex gap-2 mb-6">
          <input
            type="text"
            placeholder="Category name..."
            class="input input-bordered flex-1 h-10 text-sm border-warm-beige focus:border-terracotta"
            bind:value={newCategoryName}
            onkeydown={(e) => {
              if (e.key === "Enter" && newCategoryName.trim()) {
                const name = newCategoryName.trim();
                customCategories.add(name);
                customCategories = new Set(customCategories);
                saveCustomCategories(customCategories);
                expandedCategories.add(name);
                expandedCategories = new Set(expandedCategories);
                newCategoryName = "";
              }
            }}
          />
          <button
            class="btn rounded-full bg-terracotta hover:bg-terracotta-dark text-white border-none px-6 h-10 min-h-0"
            onclick={() => {
              const name = newCategoryName.trim();
              if (name) {
                customCategories.add(name);
                customCategories = new Set(customCategories);
                saveCustomCategories(customCategories);
                expandedCategories.add(name);
                expandedCategories = new Set(expandedCategories);
                newCategoryName = "";
              }
            }}
            disabled={!newCategoryName.trim()}
          >
            Add
          </button>
        </div>

        <h3 class="text-base font-semibold text-warm-charcoal mb-3">
          Add Tag to Category
        </h3>
        <div class="space-y-2">
          <select
            class="select select-bordered w-full h-10 text-sm border-warm-beige focus:border-terracotta"
            bind:value={selectedCategoryForNewTag}
          >
            <option value="" disabled>Select category...</option>
            {#each [...tagCategories
                .map((c) => c.name)
                .filter((name) => !hiddenCategories.has(name)), ...Array.from(customCategories)] as categoryName}
              <option value={categoryName}>{categoryName}</option>
            {/each}
          </select>
          <div class="flex gap-2">
            <input
              type="text"
              placeholder="Tag name..."
              class="input input-bordered flex-1 h-10 text-sm border-warm-beige focus:border-terracotta"
              bind:value={newTagName}
              disabled={!selectedCategoryForNewTag}
              onkeydown={(e) => {
                if (
                  e.key === "Enter" &&
                  newTagName.trim() &&
                  selectedCategoryForNewTag
                ) {
                  e.preventDefault();

                  // Prevent adding to hidden categories
                  if (hiddenCategories.has(selectedCategoryForNewTag)) {
                    toast.error(
                      `Cannot add tags to hidden category "${selectedCategoryForNewTag}"`
                    );
                    return;
                  }

                  const tagId = generateId();
                  const newTag = {
                    id: tagId,
                    name: newTagName.trim(),
                    parentId: selectedCategoryForNewTag,
                    createdAt: Date.now(),
                  };
                  addTag(newTag)
                    .then(() => {
                      allTags = [...allTags, newTag];
                      newTagName = "";
                      toast.success(
                        `Tag "${newTag.name}" added to ${selectedCategoryForNewTag}`
                      );
                    })
                    .catch((err) => {
                      console.error("Failed to add tag:", err);
                      toast.error("Failed to add tag: " + err);
                    });
                }
              }}
            />
            <button
              class="btn rounded-full bg-terracotta hover:bg-terracotta-dark text-white border-none px-6 h-10 min-h-0"
              onclick={() => {
                if (newTagName.trim() && selectedCategoryForNewTag) {
                  // Prevent adding to hidden categories
                  if (hiddenCategories.has(selectedCategoryForNewTag)) {
                    toast.error(
                      `Cannot add tags to hidden category "${selectedCategoryForNewTag}"`
                    );
                    return;
                  }

                  const tagId = generateId();
                  const newTag = {
                    id: tagId,
                    name: newTagName.trim(),
                    parentId: selectedCategoryForNewTag,
                    createdAt: Date.now(),
                  };
                  addTag(newTag)
                    .then(() => {
                      allTags = [...allTags, newTag];
                      newTagName = "";
                      toast.success(
                        `Tag "${newTag.name}" added to ${selectedCategoryForNewTag}`
                      );
                    })
                    .catch((err) => {
                      console.error("Failed to add tag:", err);
                      toast.error("Failed to add tag: " + err);
                    });
                }
              }}
              disabled={!newTagName.trim() || !selectedCategoryForNewTag}
            >
              Add
            </button>
          </div>
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
            class="btn rounded-full bg-terracotta hover:bg-terracotta-dark text-white border-none flex-1 px-6 py-2.5 h-auto min-h-0"
            onclick={applyBulkTags}
            disabled={imageTags.length === 0 || isApplyingBulkTags}
          >
            {#if isApplyingBulkTags}
              <span class="loading loading-spinner loading-sm"></span>
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
                  d="M5 13l4 4L19 7"
                />
              </svg>
            {/if}
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

<!-- Progress Indicator Modal -->
{#if showProgress}
  <div
    class="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-8"
    role="status"
    aria-live="polite"
  >
    <div class="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
      <div class="mb-4">
        <h3 class="text-lg font-bold mb-2 text-warm-charcoal">
          {bulkOperationProgress.label}
        </h3>
        <p class="text-warm-gray text-sm">
          Processing {bulkOperationProgress.current} of {bulkOperationProgress.total}
        </p>
      </div>

      <!-- Progress Bar -->
      <div class="w-full bg-warm-beige/30 rounded-full h-3 overflow-hidden">
        <div
          class="bg-terracotta h-full transition-all duration-300 rounded-full"
          style="width: {bulkOperationProgress.total > 0
            ? (bulkOperationProgress.current / bulkOperationProgress.total) *
              100
            : 0}%"
        ></div>
      </div>

      <div class="mt-3 text-right text-sm text-warm-gray">
        {Math.round(
          (bulkOperationProgress.current / bulkOperationProgress.total) * 100
        )}% complete
      </div>
    </div>
  </div>
{/if}

<!-- Delete Confirmation Modal -->
{#if showDeleteConfirm}
  <div
    class="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-8"
    role="dialog"
    aria-modal="true"
    aria-labelledby="delete-modal-title"
  >
    <div
      class="bg-white rounded-2xl shadow-xl max-w-md w-full p-6"
      use:focusTrap
    >
      <div class="flex items-start gap-4 mb-6">
        <div class="flex-shrink-0">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-12 w-12 text-error"
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
          <h3 class="text-xl font-bold mb-2 text-error" id="delete-modal-title">
            Delete {deleteCount} Image{deleteCount !== 1 ? "s" : ""}?
          </h3>
          <div class="bg-error/10 border border-error/20 rounded-lg p-3 mb-4">
            <p class="text-sm font-semibold text-error mb-1">
              ⚠️ Permanent Action
            </p>
            <p class="text-sm text-warm-charcoal">
              This will permanently delete the selected image{deleteCount !== 1
                ? "s"
                : ""} from your library. This action cannot be undone.
            </p>
          </div>
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
        <button
          class="btn btn-ghost"
          onclick={cancelDelete}
          disabled={isDeletingImages}
        >
          Cancel
        </button>
        <button
          class="btn btn-error"
          onclick={confirmDelete}
          disabled={isDeletingImages}
        >
          {#if isDeletingImages}
            <span class="loading loading-spinner loading-sm"></span>
          {/if}
          Delete
        </button>
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
    role="dialog"
    aria-modal="true"
    aria-labelledby="help-modal-title"
    tabindex="-1"
  >
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="bg-white rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
      onclick={(e) => e.stopPropagation()}
      use:focusTrap
    >
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-2xl font-bold text-warm-charcoal" id="help-modal-title">
          Library Tab - Quick Reference
        </h2>
        <button
          class="btn btn-circle btn-ghost btn-sm text-warm-gray hover:bg-warm-beige/30"
          onclick={() => (showHelpModal = false)}
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

      <!-- Selection Section -->
      <div class="mb-6">
        <h3
          class="text-lg font-semibold mb-3 flex items-center gap-2 text-warm-charcoal"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-5 w-5 text-terracotta"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
            />
          </svg>
          Selection
        </h3>
        <div class="space-y-2 text-sm">
          <div class="flex">
            <span
              class="font-mono bg-warm-beige/30 text-warm-charcoal px-2 py-1 rounded-lg min-w-[140px]"
              >Toggle in toolbar</span
            >
            <span class="ml-3 text-warm-gray">Toggle selection mode</span>
          </div>
          <div class="flex">
            <span
              class="font-mono bg-warm-beige/30 text-warm-charcoal px-2 py-1 rounded-lg min-w-[140px]"
              >Ctrl+A</span
            >
            <span class="ml-3 text-warm-gray"
              >Toggle select all / deselect all</span
            >
          </div>
          <div class="flex">
            <span
              class="font-mono bg-warm-beige/30 text-warm-charcoal px-2 py-1 rounded-lg min-w-[140px]"
              >Ctrl + Click</span
            >
            <span class="ml-3 text-warm-gray">Multi-select (add/remove)</span>
          </div>
          <div class="flex">
            <span
              class="font-mono bg-warm-beige/30 text-warm-charcoal px-2 py-1 rounded-lg min-w-[140px]"
              >Shift + Click</span
            >
            <span class="ml-3 text-warm-gray">Range select</span>
          </div>
          <div class="flex">
            <span
              class="font-mono bg-warm-beige/30 text-warm-charcoal px-2 py-1 rounded-lg min-w-[140px]"
              >Right-Click</span
            >
            <span class="ml-3 text-warm-gray">Quick select (context menu)</span>
          </div>
          <div class="flex">
            <span
              class="font-mono bg-warm-beige/30 text-warm-charcoal px-2 py-1 rounded-lg min-w-[140px]"
              >Delete</span
            >
            <span class="ml-3 text-warm-gray">Delete selected images</span>
          </div>
          <div class="flex">
            <span
              class="font-mono bg-warm-beige/30 text-warm-charcoal px-2 py-1 rounded-lg min-w-[140px]"
              >Ctrl + Click</span
            >
            <span class="ml-3 text-warm-gray">Toggle single image</span>
          </div>
          <div class="flex">
            <span
              class="font-mono bg-warm-beige/30 text-warm-charcoal px-2 py-1 rounded-lg min-w-[140px]"
              >Shift + Click</span
            >
            <span class="ml-3 text-warm-gray">Range select images</span>
          </div>
          <div class="flex">
            <span
              class="font-mono bg-warm-beige/30 text-warm-charcoal px-2 py-1 rounded-lg min-w-[140px]"
              >Right-Click</span
            >
            <span class="ml-3 text-warm-gray">Toggle image (alternative)</span>
          </div>
        </div>
      </div>

      <!-- Tagging Section -->
      <div class="mb-6">
        <h3
          class="text-lg font-semibold mb-3 flex items-center gap-2 text-warm-charcoal"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-5 w-5 text-terracotta"
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
          Tagging
        </h3>
        <div class="space-y-2 text-sm">
          <div class="flex">
            <span
              class="font-mono bg-warm-beige/30 text-warm-charcoal px-2 py-1 rounded-lg min-w-[140px]"
              >T</span
            >
            <span class="ml-3 text-warm-gray">Open bulk tag editor</span>
          </div>
          <div class="flex">
            <span
              class="font-mono bg-warm-beige/30 text-warm-charcoal px-2 py-1 rounded-lg min-w-[140px]"
              >Click "Apply Tags"</span
            >
            <span class="ml-3 text-warm-gray">Apply tags (in bulk editor)</span>
          </div>
          <div class="flex">
            <span
              class="font-mono bg-warm-beige/30 text-warm-charcoal px-2 py-1 rounded-lg min-w-[140px]"
              >Esc</span
            >
            <span class="ml-3 text-warm-gray">Cancel bulk tagging</span>
          </div>
        </div>
      </div>

      <!-- Image Viewer Section -->
      <div class="mb-6">
        <h3
          class="text-lg font-semibold mb-3 flex items-center gap-2 text-warm-charcoal"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-5 w-5 text-terracotta"
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
          Image Viewer
        </h3>
        <div class="space-y-2 text-sm">
          <div class="flex">
            <span
              class="font-mono bg-warm-beige/30 text-warm-charcoal px-2 py-1 rounded-lg min-w-[140px]"
              >←</span
            >
            <span class="ml-3 text-warm-gray">Previous image</span>
          </div>
          <div class="flex">
            <span
              class="font-mono bg-warm-beige/30 text-warm-charcoal px-2 py-1 rounded-lg min-w-[140px]"
              >→</span
            >
            <span class="ml-3 text-warm-gray">Next image</span>
          </div>
          <div class="flex">
            <span
              class="font-mono bg-warm-beige/30 text-warm-charcoal px-2 py-1 rounded-lg min-w-[140px]"
              >Esc</span
            >
            <span class="ml-3 text-warm-gray">Close viewer</span>
          </div>
        </div>
      </div>

      <!-- General Section -->
      <div class="mb-6">
        <h3
          class="text-lg font-semibold mb-3 flex items-center gap-2 text-warm-charcoal"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-5 w-5 text-terracotta"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          General
        </h3>
        <div class="space-y-2 text-sm">
          <div class="flex">
            <span
              class="font-mono bg-warm-beige/30 text-warm-charcoal px-2 py-1 rounded-lg min-w-[140px]"
              >?</span
            >
            <span class="ml-3 text-warm-gray">Show this help</span>
          </div>
          <div class="flex">
            <span
              class="font-mono bg-warm-beige/30 text-warm-charcoal px-2 py-1 rounded-lg min-w-[140px]"
              >Esc</span
            >
            <span class="ml-3 text-warm-gray">Close modals</span>
          </div>
        </div>
      </div>

      <!-- Settings Section -->
      <div class="mb-6">
        <h3
          class="text-lg font-semibold mb-3 flex items-center gap-2 text-warm-charcoal"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-5 w-5 text-terracotta"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
          Settings
        </h3>
        <div class="space-y-3">
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
                    localStorage.removeItem(STORAGE_KEYS.DELETE_WARNING);
                  } else {
                    localStorage.setItem(STORAGE_KEYS.DELETE_WARNING, "true");
                  }
                }}
              />
              <span class="label-text text-warm-gray"
                >Show image delete confirmation</span
              >
            </label>
          </div>
          <div class="form-control">
            <label class="label cursor-pointer justify-start gap-3">
              <input
                type="checkbox"
                class="checkbox checkbox-sm"
                checked={!skipTagDeleteWarningPref}
                onchange={(e) => {
                  const showWarning = e.currentTarget.checked;
                  skipTagDeleteWarningPref = !showWarning;
                  if (showWarning) {
                    localStorage.removeItem(STORAGE_KEYS.TAG_DELETE_WARNING);
                  } else {
                    localStorage.setItem(
                      STORAGE_KEYS.TAG_DELETE_WARNING,
                      "true"
                    );
                  }
                }}
              />
              <span class="label-text text-warm-gray"
                >Show tag/category delete confirmation</span
              >
            </label>
          </div>
        </div>
      </div>

      <!-- Tips -->
      <div class="bg-warm-beige rounded-lg p-4 flex items-start gap-3">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-5 w-5 flex-shrink-0 text-terracotta"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
          />
        </svg>
        <div class="text-sm text-warm-charcoal">
          <strong>Tip:</strong> Enable "Select Mode" in the toolbar for easier multi-selection
          without holding Ctrl. Use quick presets in the bulk tag editor to apply
          common tag combinations instantly!
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Delete Tag Confirmation Modal -->
{#if deleteTagModal}
  <div
    class="modal modal-open"
    role="dialog"
    aria-modal="true"
    aria-labelledby="delete-tag-modal-title"
  >
    <div class="modal-box" use:focusTrap>
      <h3 class="font-bold text-lg mb-4" id="delete-tag-modal-title">
        Delete Tag
      </h3>
      <p class="py-4">
        Delete tag <strong>"{deleteTagModal.tagName}"</strong>?
        <br />
        <span class="text-warning">This will remove it from all images.</span>
      </p>
      <div class="form-control">
        <label class="label cursor-pointer justify-start gap-3">
          <input
            type="checkbox"
            class="checkbox checkbox-sm"
            checked={skipTagDeleteWarningPref}
            onchange={(e) => {
              const skip = e.currentTarget.checked;
              skipTagDeleteWarningPref = skip;
              if (skip) {
                localStorage.setItem(STORAGE_KEYS.TAG_DELETE_WARNING, "true");
              } else {
                localStorage.removeItem(STORAGE_KEYS.TAG_DELETE_WARNING);
              }
            }}
          />
          <span class="label-text text-sm">Don't show this again</span>
        </label>
      </div>
      <div class="modal-action">
        <button class="btn btn-ghost" onclick={() => (deleteTagModal = null)}>
          Cancel
        </button>
        <button class="btn btn-error" onclick={() => confirmDeleteTag()}>
          Delete Tag
        </button>
      </div>
    </div>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="modal-backdrop" onclick={() => (deleteTagModal = null)}></div>
  </div>
{/if}

<!-- Delete Category Confirmation Modal -->
{#if deleteCategoryModal}
  <div
    class="modal modal-open"
    role="dialog"
    aria-modal="true"
    aria-labelledby="delete-category-modal-title"
  >
    <div class="modal-box" use:focusTrap>
      <h3 class="font-bold text-lg mb-4" id="delete-category-modal-title">
        {deleteCategoryModal.isDefault ? "Hide" : "Delete"} Category
      </h3>
      <p class="py-4">
        {deleteCategoryModal.isDefault ? "Hide" : "Delete"} category
        <strong>"{deleteCategoryModal.categoryName}"</strong>
        {#if deleteCategoryModal.tagCount > 0}
          and its <strong>{deleteCategoryModal.tagCount}</strong>
          tag{deleteCategoryModal.tagCount > 1 ? "s" : ""}?
          <br />
          <span class="text-warning"
            >This will remove all tags from images.</span
          >
        {:else}
          ?
        {/if}
      </p>
      <div class="form-control">
        <label class="label cursor-pointer justify-start gap-3">
          <input
            type="checkbox"
            class="checkbox checkbox-sm"
            checked={skipTagDeleteWarningPref}
            onchange={(e) => {
              const skip = e.currentTarget.checked;
              skipTagDeleteWarningPref = skip;
              if (skip) {
                localStorage.setItem(STORAGE_KEYS.TAG_DELETE_WARNING, "true");
              } else {
                localStorage.removeItem(STORAGE_KEYS.TAG_DELETE_WARNING);
              }
            }}
          />
          <span class="label-text text-sm">Don't show this again</span>
        </label>
      </div>
      <div class="modal-action">
        <button
          class="btn btn-ghost"
          onclick={() => (deleteCategoryModal = null)}
        >
          Cancel
        </button>
        <button class="btn btn-error" onclick={() => confirmDeleteCategory()}>
          {deleteCategoryModal.isDefault ? "Hide" : "Delete"} Category
        </button>
      </div>
    </div>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="modal-backdrop"
      onclick={() => (deleteCategoryModal = null)}
    ></div>
  </div>
{/if}

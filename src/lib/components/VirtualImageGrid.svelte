<script lang="ts">
  import { onMount } from "svelte";
  import { convertFileSrc } from "@tauri-apps/api/core";
  import type { Image, Tag } from "$lib/db";
  import { VIRTUAL_SCROLL, UI } from "$lib/constants";

  interface Props {
    images: Image[];
    viewMode: "grid" | "list";
    selectedImages: Set<string>;
    allImageTags: Map<string, Tag[]>;
    onImageClick: (image: Image, event: MouseEvent) => void;
    onImageSelect: (imageId: string, event: MouseEvent) => void;
    buildTagPath: (tag: Tag, allTags: Tag[]) => string;
    allTags: Tag[];
  }

  let {
    images,
    viewMode,
    selectedImages,
    allImageTags,
    onImageClick,
    onImageSelect,
    buildTagPath,
    allTags,
  }: Props = $props();

  // Virtual scrolling state
  let scrollContainer: HTMLDivElement | undefined;
  let containerHeight = $state(0);
  let scrollTop = $state(0);
  let visibleStart = $state(0);
  let visibleEnd = $state(0);
  let totalHeight = $state(0);
  let offsetY = $state(0);

  // Calculate grid dimensions
  const COLUMNS = UI.GRID_COLUMNS.LIBRARY;
  const ROW_HEIGHT = VIRTUAL_SCROLL.GRID_ITEM_HEIGHT;
  const BUFFER_ROWS = VIRTUAL_SCROLL.BUFFER_ROWS;

  // Calculate visible range based on scroll position
  function updateVisibleRange() {
    if (!scrollContainer) return;
    
    // Safety check: ensure we have valid dimensions
    if (images.length === 0 || containerHeight === 0) {
      visibleStart = 0;
      visibleEnd = 0;
      totalHeight = 0;
      offsetY = 0;
      return;
    }

    const totalRows = Math.ceil(images.length / COLUMNS);
    totalHeight = totalRows * ROW_HEIGHT;

    // Calculate which rows are visible
    const viewportRows = Math.ceil(containerHeight / ROW_HEIGHT);
    const scrolledRows = Math.floor(scrollTop / ROW_HEIGHT);

    // Add buffer rows above and below
    const startRow = Math.max(0, scrolledRows - BUFFER_ROWS);
    const endRow = Math.min(
      totalRows,
      scrolledRows + viewportRows + BUFFER_ROWS
    );

    // Convert rows to item indices with safety bounds
    const newVisibleStart = Math.max(0, startRow * COLUMNS);
    const newVisibleEnd = Math.min(images.length, endRow * COLUMNS);
    
    // Only update if values changed to reduce re-renders
    if (newVisibleStart !== visibleStart || newVisibleEnd !== visibleEnd) {
      visibleStart = newVisibleStart;
      visibleEnd = newVisibleEnd;
      offsetY = startRow * ROW_HEIGHT;
    }
  }

  // Get only the visible images
  let visibleImages = $derived.by(() => {
    return images.slice(visibleStart, visibleEnd);
  });

  // Throttle scroll updates to prevent crashes from rapid scrolling
  let scrollUpdatePending = false;
  let lastScrollTop = 0;

  // Handle scroll events with requestAnimationFrame throttling
  function handleScroll(e: Event) {
    const target = e.target as HTMLDivElement;
    lastScrollTop = target.scrollTop;

    // Only update once per animation frame
    if (!scrollUpdatePending) {
      scrollUpdatePending = true;
      requestAnimationFrame(() => {
        scrollTop = lastScrollTop;
        updateVisibleRange();
        scrollUpdatePending = false;
      });
    }
  }

  // Measure container height on mount and resize
  onMount(() => {
    if (!scrollContainer) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        containerHeight = entry.contentRect.height;
        updateVisibleRange();
      }
    });

    resizeObserver.observe(scrollContainer);

    // Initial calculation
    containerHeight = scrollContainer.clientHeight;
    updateVisibleRange();

    return () => {
      resizeObserver.disconnect();
    };
  });

  // Recalculate when images change
  $effect(() => {
    // Track dependency on images
    void images.length;
    updateVisibleRange();
  });
</script>

<!-- Virtual scroll container -->
<div
  bind:this={scrollContainer}
  class="overflow-auto h-full"
  onscroll={handleScroll}
>
  <!-- Total scrollable height spacer -->
  <div style="height: {totalHeight}px; position: relative;">
    <!-- Visible items container with offset -->
    <div style="position: absolute; top: {offsetY}px; left: 0; right: 0;">
      {#if viewMode === "grid"}
        <div class="grid grid-cols-8 gap-2">
          {#each visibleImages as image (image.id)}
            {@const isSelected = selectedImages.has(image.id)}
            <button
              class="relative aspect-square bg-warm-beige rounded overflow-hidden cursor-pointer border-2 transition-colors"
              class:border-warm-beige={!isSelected}
              class:border-terracotta={isSelected}
              onclick={(e) => {
                if (
                  selectedImages.size > 0 ||
                  (e instanceof MouseEvent && (e.ctrlKey || e.shiftKey))
                ) {
                  onImageSelect(image.id, e as MouseEvent);
                } else {
                  onImageClick(image, e as MouseEvent);
                }
              }}
              oncontextmenu={(e) => {
                e.preventDefault();
                onImageSelect(image.id, e as MouseEvent);
              }}
            >
              <img
                src={convertFileSrc(image.fullPath)}
                alt={image.filename}
                class="w-full h-full object-contain transition-opacity duration-200"
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
          {#each visibleImages as image (image.id)}
            {@const isSelected = selectedImages.has(image.id)}
            {@const tags = allImageTags.get(image.id) || []}
            <button
              class="w-full flex items-center gap-4 p-3 bg-white rounded-lg hover:bg-warm-beige/30 border-2 transition-colors"
              class:border-warm-beige={!isSelected}
              class:border-terracotta={isSelected}
              onclick={(e) => {
                if (
                  selectedImages.size > 0 ||
                  (e instanceof MouseEvent && (e.ctrlKey || e.shiftKey))
                ) {
                  onImageSelect(image.id, e as MouseEvent);
                } else {
                  onImageClick(image, e as MouseEvent);
                }
              }}
              oncontextmenu={(e) => {
                e.preventDefault();
                onImageSelect(image.id, e as MouseEvent);
              }}
            >
              <div class="relative w-20 h-20 flex-shrink-0">
                <img
                  src={convertFileSrc(image.fullPath)}
                  alt={image.filename}
                  class="w-full h-full object-contain rounded transition-opacity duration-200"
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
              <div class="flex-1 text-left min-w-0">
                <p class="font-medium text-warm-charcoal truncate">
                  {image.filename}
                </p>
                {#if tags.length > 0}
                  <div class="flex flex-wrap gap-1 mt-1">
                    {#each tags as tag}
                      <span class="badge badge-sm badge-ghost">
                        {buildTagPath(tag, allTags)}
                      </span>
                    {/each}
                  </div>
                {:else}
                  <p class="text-sm text-warm-gray">No tags</p>
                {/if}
              </div>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</div>

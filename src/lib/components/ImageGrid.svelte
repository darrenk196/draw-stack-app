<script lang="ts">
  import { convertFileSrc } from "@tauri-apps/api/core";
  import type { Image, Tag } from "$lib/db";

  interface Props {
    images: Image[];
    viewMode: "grid" | "list";
    selectedImages: Set<string>;
    allImageTags: Map<string, Tag[]>;
    currentPage: number;
    totalPages: number;
    itemsPerPage: number | "all";
    isProgressiveRendering: boolean;
    progressiveRenderLimit: number;
    onImageClick: (image: Image, event: MouseEvent) => void;
    onImageSelect: (imageId: string, event: MouseEvent) => void;
    onNextPage: () => void;
    onPreviousPage: () => void;
    buildTagPath: (tag: Tag, allTags: Tag[]) => string;
    allTags: Tag[];
  }

  let {
    images,
    viewMode,
    selectedImages,
    allImageTags,
    currentPage,
    totalPages,
    itemsPerPage,
    isProgressiveRendering,
    progressiveRenderLimit,
    onImageClick,
    onImageSelect,
    onNextPage,
    onPreviousPage,
    buildTagPath,
    allTags,
  }: Props = $props();
</script>

<!-- Image Grid/List -->
{#if viewMode === "grid"}
  <div class="grid grid-cols-8 gap-2">
    {#each images as image (image.id)}
      {@const isSelected = selectedImages.has(image.id)}
      <button
        class="relative aspect-square bg-warm-beige rounded overflow-hidden cursor-pointer border-2 transition-colors"
        class:border-warm-beige={!isSelected}
        class:border-terracotta={isSelected}
        onclick={(e) => {
          // If there is an active selection or user holds Ctrl/Shift, treat click as selection
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
    {#each images as image (image.id)}
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

<!-- Pagination Navigation -->
{#if itemsPerPage !== "all" && images.length > 0}
  <div
    class="mt-6 pt-4 border-t border-warm-beige flex items-center justify-center gap-2"
  >
    <button
      class="btn btn-sm"
      disabled={currentPage === 1}
      onclick={onPreviousPage}
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
    <span class="text-sm text-warm-gray mx-4">
      Page {currentPage} of {totalPages}
    </span>
    <button
      class="btn btn-sm"
      disabled={currentPage === totalPages}
      onclick={onNextPage}
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

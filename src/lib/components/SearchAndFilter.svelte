<script lang="ts">
  import type { Tag } from "$lib/db";

  interface Props {
    searchQuery: string;
    activeFilters: string[];
    recentTags: Tag[];
    searchSuggestions: Tag[];
    showSearchSuggestions: boolean;
    selectedSuggestionIndex: number;
    onSearchInput: (value: string) => void;
    onSearchKeydown: (event: KeyboardEvent) => void;
    onSuggestionSelect: (tag: Tag) => void;
    onFilterAdd: (tagPath: string) => void;
    onFilterRemove: (tagPath: string) => void;
    onClearAllFilters: () => void;
    buildTagPath: (tag: Tag, allTags: Tag[]) => string;
    allTags: Tag[];
  }

  let {
    searchQuery = $bindable(),
    activeFilters,
    recentTags,
    searchSuggestions,
    showSearchSuggestions = $bindable(),
    selectedSuggestionIndex,
    onSearchInput,
    onSearchKeydown,
    onSuggestionSelect,
    onFilterAdd,
    onFilterRemove,
    onClearAllFilters,
    buildTagPath,
    allTags,
  }: Props = $props();

  function handleInput(e: Event) {
    const target = e.target as HTMLInputElement;
    onSearchInput(target.value);
  }

  function handleFocus() {
    onSearchInput(searchQuery);
  }

  function handleBlur() {
    setTimeout(() => (showSearchSuggestions = false), 200);
  }
</script>

<!-- Search Bar -->
<div class="relative mb-4">
  <svg
    xmlns="http://www.w3.org/2000/svg"
    class="h-5 w-5 absolute left-3 top-1/2 -translate-y-1/2 text-warm-gray"
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
    oninput={handleInput}
    onfocus={handleFocus}
    onkeydown={onSearchKeydown}
    onblur={handleBlur}
  />

  {#if showSearchSuggestions && searchSuggestions.length > 0}
    <div
      class="absolute z-50 w-full mt-1 bg-white border border-warm-beige rounded-lg shadow-lg max-h-60 overflow-y-auto"
    >
      {#each searchSuggestions as tag, index}
        <button
          class="w-full px-4 py-2 text-left hover:bg-warm-beige/30 flex items-center gap-2 transition-colors"
          class:bg-terracotta={index === selectedSuggestionIndex}
          class:text-white={index === selectedSuggestionIndex}
          onclick={() => onSuggestionSelect(tag)}
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
    <span class="text-sm text-warm-gray">Active Filters:</span>
    <div class="flex gap-2 flex-wrap">
      {#each activeFilters as filter}
        <button
          class="badge rounded-full bg-terracotta text-white border-none gap-2 cursor-pointer hover:bg-terracotta-dark text-sm font-medium h-auto min-h-0 px-4 py-2.5"
          onclick={() => onFilterRemove(filter)}
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
        class="badge rounded-full bg-warm-gray hover:bg-warm-charcoal text-white border-none cursor-pointer text-sm font-medium h-auto min-h-0 px-4 py-2.5"
        onclick={onClearAllFilters}
      >
        Clear All
      </button>
    </div>
  </div>
{/if}

<!-- Quick Filters -->
<div class="flex items-center gap-2">
  <span class="text-sm text-warm-gray">Recently Used:</span>
  <div class="flex gap-2 flex-wrap">
    {#if recentTags.length > 0}
      {#each recentTags as tag}
        {@const tagPath = buildTagPath(tag, allTags)}
        <button
          class="badge rounded-full bg-warm-beige hover:bg-terracotta hover:text-white border border-warm-beige text-warm-charcoal cursor-pointer transition-colors text-sm font-medium h-auto min-h-0 px-4 py-2.5"
          class:bg-terracotta={activeFilters.includes(tagPath)}
          class:text-white={activeFilters.includes(tagPath)}
          onclick={() => onFilterAdd(tagPath)}
          disabled={activeFilters.includes(tagPath)}
        >
          {tagPath}
        </button>
      {/each}
    {:else}
      <span class="text-sm text-warm-gray italic">No recently used tags</span>
    {/if}
  </div>
</div>

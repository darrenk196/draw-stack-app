<script lang="ts">
  import "../app.css";
  import { page } from "$app/stores";
  import { Toaster } from "svelte-sonner";
  import Onboarding from "$lib/components/Onboarding.svelte";
  let { children } = $props();

  import { onMount } from "svelte";
  import { getLibraryImages } from "$lib/db";

  let libraryCount = $state(0);
  let showOnboarding = $state(false);

  async function refreshLibraryCount() {
    try {
      const imgs = await getLibraryImages();
      libraryCount = imgs.length;
    } catch (e) {
      console.error("Failed to load library count", e);
    }
  }

  function completeOnboarding() {
    showOnboarding = false;
    localStorage.setItem("hasCompletedOnboarding", "true");
  }

  onMount(() => {
    refreshLibraryCount();
    const handler = () => refreshLibraryCount();
    window.addEventListener("library-updated", handler);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") refreshLibraryCount();
    });

    // Check if user has completed onboarding
    const hasCompleted = localStorage.getItem("hasCompletedOnboarding");
    if (!hasCompleted) {
      showOnboarding = true;
    }

    return () => window.removeEventListener("library-updated", handler);
  });
</script>

<div class="flex h-screen bg-base-100">
  <!-- Sidebar -->
  <aside
    class="app-sidebar w-60 bg-base-200 flex flex-col border-r border-base-300"
  >
    <!-- Navigation Header -->
    <div class="p-4 text-xs text-base-content/60 font-medium tracking-wider">
      NAVIGATION
    </div>

    <!-- Navigation Links -->
    <nav class="flex-1 px-2">
      <a
        href="/"
        class="flex items-center gap-3 px-3 py-2 rounded-lg mb-1 transition-colors text-base-content"
        class:bg-primary={$page.url.pathname === "/"}
        class:text-primary-content={$page.url.pathname === "/"}
        class:hover:bg-base-300={$page.url.pathname !== "/"}
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
            d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
          />
        </svg>
        <span>Library</span>
      </a>

      <a
        href="/packs"
        class="flex items-center gap-3 px-3 py-2 rounded-lg mb-1 transition-colors text-base-content"
        class:bg-primary={$page.url.pathname.startsWith("/packs")}
        class:text-primary-content={$page.url.pathname.startsWith("/packs")}
        class:hover:bg-base-300={!$page.url.pathname.startsWith("/packs")}
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
            d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
          />
        </svg>
        <span>Packs</span>
      </a>

      <a
        href="/timer"
        class="flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-base-content"
        class:bg-primary={$page.url.pathname === "/timer"}
        class:text-primary-content={$page.url.pathname === "/timer"}
        class:hover:bg-base-300={$page.url.pathname !== "/timer"}
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
        <span>Timer Mode</span>
      </a>

      <a
        href="/settings"
        class="flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-base-content"
        class:bg-primary={$page.url.pathname === "/settings"}
        class:text-primary-content={$page.url.pathname === "/settings"}
        class:hover:bg-base-300={$page.url.pathname !== "/settings"}
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
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
        <span>Settings</span>
      </a>
    </nav>

    <!-- Stats Footer -->
    <div class="p-4 border-t border-base-300 text-sm space-y-1">
      <div class="flex justify-between text-base-content">
        <span class="opacity-70">Library Items</span>
        <span class="font-medium">{libraryCount}</span>
      </div>
    </div>
  </aside>

  <!-- Main Content -->
  <main class="flex-1 overflow-hidden">
    {@render children()}
  </main>
</div>

{#if showOnboarding}
  <Onboarding onComplete={completeOnboarding} />
{/if}

<Toaster position="bottom-right" theme="dark" richColors />

<style>
  :global(html.immersive-practice) .app-sidebar {
    display: none;
  }
</style>

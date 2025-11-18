<script lang="ts">
  import "../app.css";
  import { page } from "$app/stores";

  let libraryCount = $state(0);
  let packCount = $state(0);

  // TODO: Load counts from IndexedDB
</script>

<div class="flex h-screen bg-base-100">
  <!-- Sidebar -->
  <aside class="w-60 bg-base-200 flex flex-col border-r border-base-300">
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
    </nav>

    <!-- Stats Footer -->
    <div class="p-4 border-t border-base-300 text-sm space-y-1">
      <div class="flex justify-between text-base-content">
        <span class="opacity-70">Library Items</span>
        <span class="font-medium">{libraryCount}</span>
      </div>
      <div class="flex justify-between text-base-content">
        <span class="opacity-70">Total Packs</span>
        <span class="font-medium">{packCount}</span>
      </div>
    </div>
  </aside>

  <!-- Main Content -->
  <main class="flex-1 overflow-hidden">
    <slot />
  </main>
</div>

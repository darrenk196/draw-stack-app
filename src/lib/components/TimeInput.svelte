<script lang="ts">
  interface Props {
    value: number; // Total seconds
    onchange: (seconds: number) => void;
    size?: "sm" | "xs" | "md";
    class?: string;
  }

  let {
    value = 60,
    onchange,
    size = "sm",
    class: className = "",
  }: Props = $props();

  // Local state for editing
  let localHours = $state(0);
  let localMinutes = $state(0);
  let localSeconds = $state(0);

  // Update local state when value changes from outside
  $effect(() => {
    localHours = Math.floor(value / 3600);
    localMinutes = Math.floor((value % 3600) / 60);
    localSeconds = value % 60;
  });

  function updateValue() {
    const totalSeconds = localHours * 3600 + localMinutes * 60 + localSeconds;
    onchange(totalSeconds);
  }

  function incrementHours() {
    if (localHours < 23) {
      localHours++;
      updateValue();
    }
  }

  function decrementHours() {
    if (localHours > 0) {
      localHours--;
      updateValue();
    }
  }

  function incrementMinutes() {
    if (localMinutes < 59) {
      localMinutes++;
      updateValue();
    } else if (localHours < 23) {
      localMinutes = 0;
      localHours++;
      updateValue();
    }
  }

  function decrementMinutes() {
    if (localMinutes > 0) {
      localMinutes--;
      updateValue();
    } else if (localHours > 0) {
      localMinutes = 59;
      localHours--;
      updateValue();
    }
  }

  function incrementSeconds() {
    if (localSeconds < 59) {
      localSeconds++;
      updateValue();
    } else if (localMinutes < 59 || localHours < 23) {
      localSeconds = 0;
      if (localMinutes < 59) {
        localMinutes++;
      } else {
        localMinutes = 0;
        localHours++;
      }
      updateValue();
    }
  }

  function decrementSeconds() {
    if (localSeconds > 0) {
      localSeconds--;
      updateValue();
    } else if (localMinutes > 0 || localHours > 0) {
      localSeconds = 59;
      if (localMinutes > 0) {
        localMinutes--;
      } else {
        localMinutes = 59;
        localHours--;
      }
      updateValue();
    }
  }

  function handleHoursInput(e: Event) {
    const target = e.target as HTMLInputElement;
    const val = parseInt(target.value);
    if (!isNaN(val) && val >= 0 && val <= 23) {
      localHours = val;
      updateValue();
    }
  }

  function handleMinutesInput(e: Event) {
    const target = e.target as HTMLInputElement;
    const val = parseInt(target.value);
    if (!isNaN(val) && val >= 0 && val <= 59) {
      localMinutes = val;
      updateValue();
    }
  }

  function handleSecondsInput(e: Event) {
    const target = e.target as HTMLInputElement;
    const val = parseInt(target.value);
    if (!isNaN(val) && val >= 0 && val <= 59) {
      localSeconds = val;
      updateValue();
    }
  }

  function handleHoursKeydown(e: KeyboardEvent) {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      incrementHours();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      decrementHours();
    }
  }

  function handleMinutesKeydown(e: KeyboardEvent) {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      incrementMinutes();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      decrementMinutes();
    }
  }

  function handleSecondsKeydown(e: KeyboardEvent) {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      incrementSeconds();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      decrementSeconds();
    }
  }

  // Determine button and input sizes
  const btnSize =
    size === "xs" ? "btn-xs" : size === "sm" ? "btn-sm" : "btn-md";
  const inputSize =
    size === "xs" ? "input-xs" : size === "sm" ? "input-sm" : "input-md";
  const inputWidth = size === "xs" ? "w-10" : size === "sm" ? "w-12" : "w-14";
</script>

<div class="flex items-center gap-1 {className}">
  <!-- Hours -->
  <div class="flex flex-col items-center gap-0.5">
    <button
      class="btn {btnSize} btn-ghost btn-square min-h-0 h-6"
      onclick={incrementHours}
      aria-label="Increment hours"
      type="button"
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
          d="M5 15l7-7 7 7"
        />
      </svg>
    </button>
    <input
      type="number"
      class="input {inputSize} {inputWidth} input-bordered text-center px-1"
      value={localHours}
      oninput={handleHoursInput}
      onkeydown={handleHoursKeydown}
      min="0"
      max="23"
      aria-label="Hours"
    />
    <button
      class="btn {btnSize} btn-ghost btn-square min-h-0 h-6"
      onclick={decrementHours}
      aria-label="Decrement hours"
      type="button"
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
          d="M19 9l-7 7-7-7"
        />
      </svg>
    </button>
    <span class="text-xs text-warm-gray mt-0.5">hr</span>
  </div>

  <!-- Separator -->
  <span class="text-lg font-bold text-warm-beige pb-4">:</span>

  <!-- Minutes -->
  <div class="flex flex-col items-center gap-0.5">
    <button
      class="btn {btnSize} btn-ghost btn-square min-h-0 h-6"
      onclick={incrementMinutes}
      aria-label="Increment minutes"
      type="button"
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
          d="M5 15l7-7 7 7"
        />
      </svg>
    </button>
    <input
      type="number"
      class="input {inputSize} {inputWidth} input-bordered text-center px-1"
      value={localMinutes}
      oninput={handleMinutesInput}
      onkeydown={handleMinutesKeydown}
      min="0"
      max="59"
      aria-label="Minutes"
    />
    <button
      class="btn {btnSize} btn-ghost btn-square min-h-0 h-6"
      onclick={decrementMinutes}
      aria-label="Decrement minutes"
      type="button"
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
          d="M19 9l-7 7-7-7"
        />
      </svg>
    </button>
    <span class="text-xs text-warm-gray mt-0.5">min</span>
  </div>

  <!-- Separator -->
  <span class="text-lg font-bold text-warm-beige pb-4">:</span>

  <!-- Seconds -->
  <div class="flex flex-col items-center gap-0.5">
    <button
      class="btn {btnSize} btn-ghost btn-square min-h-0 h-6"
      onclick={incrementSeconds}
      aria-label="Increment seconds"
      type="button"
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
          d="M5 15l7-7 7 7"
        />
      </svg>
    </button>
    <input
      type="number"
      class="input {inputSize} {inputWidth} input-bordered text-center px-1"
      value={localSeconds}
      oninput={handleSecondsInput}
      onkeydown={handleSecondsKeydown}
      min="0"
      max="59"
      aria-label="Seconds"
    />
    <button
      class="btn {btnSize} btn-ghost btn-square min-h-0 h-6"
      onclick={decrementSeconds}
      aria-label="Decrement seconds"
      type="button"
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
          d="M19 9l-7 7-7-7"
        />
      </svg>
    </button>
    <span class="text-xs text-warm-gray mt-0.5">sec</span>
  </div>
</div>

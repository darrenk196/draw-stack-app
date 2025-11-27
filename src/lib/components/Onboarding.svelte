<script lang="ts">
  interface Props {
    onComplete: () => void;
  }

  let { onComplete }: Props = $props();

  let currentStep = $state(0);

  const steps = [
    {
      title: "Welcome to Draw Stack!",
      description:
        "Your desktop app for managing reference images and running practice sessions.",
      icon: "🎨",
    },
    {
      title: "Build Your Library",
      description:
        'Start by importing image packs from folders on your computer. Go to "Packs" to browse and add images to your library.',
      icon: "📚",
    },
    {
      title: "Organize with Tags",
      description:
        "Tag your images by category (poses, lighting, anatomy, etc.) to make them easy to filter during practice sessions.",
      icon: "🏷️",
    },
    {
      title: "Practice with Timer Mode",
      description:
        "Create custom timed sessions with your tagged images. Perfect for gesture drawing, still-life practice, and more!",
      icon: "⏱️",
    },
  ];

  function nextStep() {
    if (currentStep < steps.length - 1) {
      currentStep++;
    } else {
      onComplete();
    }
  }

  function prevStep() {
    if (currentStep > 0) {
      currentStep--;
    }
  }

  function skip() {
    onComplete();
  }
</script>

<div class="modal modal-open">
  <div class="modal-box max-w-2xl">
    <!-- Progress indicator -->
    <div class="flex gap-2 mb-6">
      {#each steps as _, i}
        <div
          class="flex-1 h-1 rounded-full transition-colors"
          class:bg-primary={i <= currentStep}
          class:bg-base-300={i > currentStep}
        ></div>
      {/each}
    </div>

    <!-- Content -->
    <div class="text-center space-y-4">
      <div class="text-6xl mb-4">{steps[currentStep].icon}</div>
      <h2 class="text-2xl font-bold">{steps[currentStep].title}</h2>
      <p class="text-base-content/70 max-w-md mx-auto">
        {steps[currentStep].description}
      </p>
    </div>

    <!-- Actions -->
    <div class="modal-action justify-between">
      <button class="btn btn-ghost" onclick={skip}>Skip Tour</button>
      <div class="flex gap-2">
        {#if currentStep > 0}
          <button class="btn btn-ghost" onclick={prevStep}>Back</button>
        {/if}
        <button class="btn btn-primary" onclick={nextStep}>
          {currentStep < steps.length - 1 ? "Next" : "Get Started"}
        </button>
      </div>
    </div>
  </div>
</div>

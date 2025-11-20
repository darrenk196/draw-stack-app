<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import {
    getImage,
    getLibraryImages,
    getImagesByTags,
    getAllTags,
    type Image,
  } from "$lib/db";
  import { convertFileSrc } from "@tauri-apps/api/core";

  interface TimerEntry {
    imageId: string;
    duration: number; // in seconds
    stageIndex: number;
    poseNumber: number;
  }

  interface SessionStage {
    imageCount: number;
    duration: number; // seconds per image
    description?: string;
  }

  interface ClassroomPreset {
    id: string;
    name: string;
    totalDuration: string;
    description: string;
    stages: SessionStage[];
  }

  interface QuickSessionConfig {
    selectedTags: string[];
    stages: SessionStage[];
  }

  let practiceImages = $state<Image[]>([]);
  let timerEntries = $state<TimerEntry[]>([]);
  let isLoading = $state(true);
  let showSetup = $state(true);
  let setupMode = $state<"choose" | "classroom" | "quick" | "legacy">("choose");
  let selectedPreset = $state<ClassroomPreset | null>(null);
  let quickConfig = $state<QuickSessionConfig>({
    selectedTags: [],
    stages: [],
  });
  let allTags = $state<any[]>([]);
  let currentStageIndex = $state(0);

  // Practice session state
  let currentIndex = $state(0);
  let isPaused = $state(false);
  let timeRemaining = $state(0);
  let timerInterval: number | null = null;
  let isFullscreen = $state(false);
  let showUI = $state(true);
  let uiHideTimer: number | null = null;
  const uiHideDelay = 2000; // ms
  let uiLocked = $state(false);
  let showCompletion = $state(false);

  // Plumb line and angle measurement tool state
  interface Point {
    x: number;
    y: number;
  }

  interface AngleLine {
    id: string;
    pointA: Point;
    pointB: Point;
  }

  let showPlumbTool = $state(false);
  let showVerticalLines = $state(false);
  let showHorizontalLines = $state(false);
  let verticalLine2X = $state(0.3); // as percentage of image width
  let horizontalLine2Y = $state(0.3); // as percentage of image height
  let angleMode = $state(false);
  let currentAngleLine = $state<AngleLine | null>(null);
  let angleLines = $state<AngleLine[]>([]);
  let plumbLocked = $state(false);
  let plumbColor = $state("#FF0000");
  let snapToAngle = $state(true);
  let dragTarget = $state<string | null>(null);
  let showAlignmentCheck = $state(false);
  let imageContainerRef = $state<HTMLDivElement | null>(null);

  // Default timer durations
  const presetDurations = [30, 60, 120, 300, 600]; // 30s, 1m, 2m, 5m, 10m

  // Classroom Mode Presets
  const classroomPresets: ClassroomPreset[] = [
    {
      id: "classic-warmup",
      name: "Classic Warm-Up",
      totalDuration: "~30 min",
      description: "Start of any class",
      stages: [
        { imageCount: 12, duration: 30, description: "30 second poses" },
        { imageCount: 10, duration: 60, description: "1 minute poses" },
        { imageCount: 8, duration: 120, description: "2 minute poses" },
        { imageCount: 6, duration: 300, description: "5 minute poses" },
      ],
    },
    {
      id: "standard-1hour",
      name: "Standard 1-Hour Class",
      totalDuration: "60–75 min",
      description: "Full figure drawing session",
      stages: [
        { imageCount: 10, duration: 30, description: "30 second warm-up" },
        { imageCount: 10, duration: 60, description: "1 minute gestures" },
        { imageCount: 10, duration: 120, description: "2 minute studies" },
        { imageCount: 6, duration: 300, description: "5 minute drawings" },
        { imageCount: 3, duration: 600, description: "10 minute poses" },
        { imageCount: 2, duration: 1200, description: "20 minute pieces" },
      ],
    },
    {
      id: "beginner-friendly",
      name: "Beginner Friendly",
      totalDuration: "~50 min",
      description: "New students",
      stages: [
        { imageCount: 10, duration: 60, description: "1 minute gestures" },
        { imageCount: 10, duration: 120, description: "2 minute studies" },
        { imageCount: 6, duration: 300, description: "5 minute drawings" },
        { imageCount: 3, duration: 600, description: "10 minute poses" },
        { imageCount: 1, duration: 1200, description: "20 minute final pose" },
      ],
    },
    {
      id: "gesture-bootcamp",
      name: "Gesture Bootcamp",
      totalDuration: "30 min",
      description: "Fast energy warm-up",
      stages: [
        { imageCount: 20, duration: 10, description: "10 second quick hits" },
        { imageCount: 15, duration: 20, description: "20 second gestures" },
        { imageCount: 20, duration: 30, description: "30 second poses" },
        { imageCount: 15, duration: 60, description: "1 minute studies" },
        { imageCount: 10, duration: 120, description: "2 minute drawings" },
      ],
    },
    {
      id: "long-pose-focus",
      name: "Long Pose Focus",
      totalDuration: "90 min",
      description: "Finishing/rendering practice",
      stages: [
        { imageCount: 5, duration: 120, description: "2 minute warm-up" },
        { imageCount: 4, duration: 300, description: "5 minute studies" },
        { imageCount: 3, duration: 600, description: "10 minute drawings" },
        { imageCount: 1, duration: 1200, description: "20 minute pose" },
        { imageCount: 1, duration: 2700, description: "45 minute final piece" },
      ],
    },
    {
      id: "portrait-features",
      name: "Portrait & Features",
      totalDuration: "60 min",
      description: "Face + detail work",
      stages: [
        { imageCount: 8, duration: 60, description: "1 minute face studies" },
        { imageCount: 8, duration: 120, description: "2 minute portraits" },
        {
          imageCount: 5,
          duration: 300,
          description: "5 minute detailed portraits",
        },
        { imageCount: 10, duration: 120, description: "2 minute hands/feet" },
      ],
    },
  ];

  onMount(async () => {
    allTags = await getAllTags();
    await loadPracticeImages();
  });

  $effect(() => {
    // Cleanup timer on unmount
    return () => {
      if (timerInterval !== null) {
        clearInterval(timerInterval);
      }
      // Ensure we exit fullscreen if active
      if (isFullscreen && document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      // Remove immersive class on destroy
      document.documentElement.classList.remove("immersive-practice");
    };
  });

  async function loadPracticeImages() {
    isLoading = true;
    try {
      // Get image IDs from URL params
      const imageIdsParam = $page.url.searchParams.get("images");
      if (!imageIdsParam) {
        console.log("No images provided");
        isLoading = false;
        return;
      }

      const imageIds = imageIdsParam.split(",");
      console.log("Loading practice images:", imageIds);

      // Load images from database
      const images: Image[] = [];
      for (const id of imageIds) {
        const image = await getImage(id);
        if (image) {
          images.push(image);
        }
      }

      practiceImages = images;

      // Initialize timer entries with default duration (60 seconds) - legacy mode
      timerEntries = images.map((img, index) => ({
        imageId: img.id,
        duration: 60,
        stageIndex: 0,
        poseNumber: index + 1,
      }));

      console.log("Loaded images:", images.length);
    } catch (error) {
      console.error("Failed to load practice images:", error);
    } finally {
      isLoading = false;
    }
  }

  function updateDuration(imageId: string, duration: number) {
    const entry = timerEntries.find((e) => e.imageId === imageId);
    if (entry) {
      entry.duration = duration;
      timerEntries = [...timerEntries]; // Trigger reactivity
    }
  }

  function setAllDurations(duration: number) {
    timerEntries = timerEntries.map((entry) => ({
      ...entry,
      duration,
    }));
  }

  function startPractice() {
    showSetup = false;
    currentIndex = 0;
    startTimer();
    revealUI();
  }

  function startTimer() {
    const entry = timerEntries[currentIndex];
    if (!entry) return;

    timeRemaining = entry.duration;
    isPaused = false;

    if (timerInterval !== null) {
      clearInterval(timerInterval);
    }

    timerInterval = window.setInterval(() => {
      if (!isPaused && timeRemaining > 0) {
        timeRemaining--;

        // Auto-advance when timer reaches 0
        if (timeRemaining === 0) {
          if (currentIndex < practiceImages.length - 1) {
            playChime();
            goToNext();
          } else {
            // Session complete
            playVictory();
            showCompletion = true;
            pauseTimer();
          }
        }
      }
    }, 1000);
  }

  function pauseTimer() {
    isPaused = true;
  }

  function resumeTimer() {
    isPaused = false;
  }

  function resetCurrentTimer() {
    const entry = timerEntries[currentIndex];
    if (entry) {
      timeRemaining = entry.duration;
    }
  }

  function goToPrevious() {
    if (currentIndex > 0) {
      currentIndex--;
      startTimer();
    }
  }

  function goToNext() {
    if (currentIndex < practiceImages.length - 1) {
      currentIndex++;
      startTimer();
    }
  }

  function goToImage(index: number) {
    currentIndex = index;
    startTimer();
  }

  function exitPractice() {
    if (timerInterval !== null) {
      clearInterval(timerInterval);
    }
    if (isFullscreen && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
      isFullscreen = false;
    }
    showSetup = true;
    document.documentElement.classList.remove("immersive-practice");
  }

  // Plumb Tool Interaction Handlers
  function getRelativeCoords(e: PointerEvent): Point {
    if (!imageContainerRef) return { x: 0.5, y: 0.5 };
    const rect = imageContainerRef.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
  }

  function handlePlumbPointerDown(e: PointerEvent) {
    if (plumbLocked) return;

    const target = (e.target as HTMLElement).getAttribute("data-drag-target");

    // Handle angle mode clicks
    if (angleMode && !target) {
      const coords = getRelativeCoords(e);

      if (!currentAngleLine) {
        // Start new angle line with point A
        currentAngleLine = {
          id: Date.now().toString(),
          pointA: coords,
          pointB: coords,
        };
      } else if (
        !currentAngleLine.pointB ||
        (currentAngleLine.pointA.x === currentAngleLine.pointB.x &&
          currentAngleLine.pointA.y === currentAngleLine.pointB.y)
      ) {
        // Set point B and complete the line
        currentAngleLine.pointB = coords;
        angleLines = [...angleLines, currentAngleLine];
        currentAngleLine = null;
      }
      return;
    }

    // Handle drag targets
    if (target) {
      dragTarget = target;
      e.preventDefault();
    }
  }

  function handlePlumbPointerMove(e: PointerEvent) {
    if (!dragTarget || plumbLocked) return;

    const coords = getRelativeCoords(e);

    if (dragTarget === "vertical-line") {
      verticalLine2X = Math.max(0, Math.min(1, coords.x));
    } else if (dragTarget === "horizontal-line") {
      horizontalLine2Y = Math.max(0, Math.min(1, coords.y));
    } else if (dragTarget.startsWith("angle-point-")) {
      const parts = dragTarget.split("-");
      const pointType = parts[2]; // 'a' or 'b'
      const lineId = parts.slice(3).join("-");

      const lineIndex = angleLines.findIndex((l) => l.id === lineId);
      if (lineIndex !== -1) {
        if (pointType === "a") {
          angleLines[lineIndex].pointA = coords;
        } else {
          angleLines[lineIndex].pointB = coords;
        }
        angleLines = [...angleLines];
      }
    }
  }

  function handlePlumbPointerUp() {
    dragTarget = null;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (showSetup) return;
    // Any key interaction reveals UI briefly
    revealUI();

    // Plumb tool shortcuts
    if (e.key === "v" || e.key === "V") {
      if (!e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        showVerticalLines = !showVerticalLines;
        if (showVerticalLines) showPlumbTool = true;
        return;
      }
    }
    if (e.key === "h" || e.key === "H") {
      if (!e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        showHorizontalLines = !showHorizontalLines;
        if (showHorizontalLines) showPlumbTool = true;
        return;
      }
    }
    if (e.key === "a" || e.key === "A") {
      if (!e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        angleMode = !angleMode;
        if (angleMode) showPlumbTool = true;
        return;
      }
    }
    if (e.key === "l" || e.key === "L") {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        if (e.shiftKey) {
          plumbLocked = !plumbLocked;
        } else {
          showPlumbTool = !showPlumbTool;
        }
        return;
      }
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      if (currentAngleLine) {
        e.preventDefault();
        currentAngleLine = null;
        return;
      }
      if (angleLines.length > 0) {
        e.preventDefault();
        angleLines = angleLines.slice(0, -1);
        return;
      }
    }
    if (e.key === "Escape") {
      if (angleMode) {
        e.preventDefault();
        angleMode = false;
        currentAngleLine = null;
        return;
      }
    }
    // Ctrl+Shift+A - Show alignment check
    if (
      (e.ctrlKey || e.metaKey) &&
      e.shiftKey &&
      (e.key === "a" || e.key === "A")
    ) {
      e.preventDefault();
      showAlignmentCheck = true;
      setTimeout(() => {
        showAlignmentCheck = false;
      }, 15000);
      return;
    }

    switch (e.key) {
      case "ArrowLeft":
        goToPrevious();
        break;
      case "ArrowRight":
        goToNext();
        break;
      case " ":
      case "Spacebar":
        e.preventDefault();
        if (isPaused) {
          resumeTimer();
        } else {
          pauseTimer();
        }
        break;
      case "r":
      case "R":
        resetCurrentTimer();
        break;
      case "f":
      case "F":
        e.preventDefault();
        toggleFullscreen();
        break;
      case "Escape":
        if (isFullscreen) {
          toggleFullscreen();
        } else {
          exitPractice();
        }
        break;
    }
  }

  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        isFullscreen = true;
      } else {
        await document.exitFullscreen();
        isFullscreen = false;
      }
    } catch (error) {
      console.error("Failed to toggle fullscreen:", error);
    }
  }

  // Keep isFullscreen in sync if user changes via browser controls
  $effect(() => {
    const onChange = () => {
      isFullscreen = !!document.fullscreenElement;
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  });

  // Toggle immersive layout: hide app chrome while practicing
  $effect(() => {
    if (!showSetup) {
      document.documentElement.classList.add("immersive-practice");
    } else {
      document.documentElement.classList.remove("immersive-practice");
    }
  });

  function formatTime(seconds: number): string {
    if (seconds < 60) {
      return `${seconds}s`;
    }
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  }

  // ============= Classroom Mode & Quick Session Functions =============

  async function generateSessionFromPreset(preset: ClassroomPreset) {
    const allImages = await getLibraryImages();
    if (allImages.length === 0) {
      alert("No images in library. Please add images first.");
      return;
    }

    // Shuffle images for randomness
    const shuffled = [...allImages].sort(() => Math.random() - 0.5);

    const entries: TimerEntry[] = [];
    const images: Image[] = [];
    let imageIndex = 0;
    let poseNumber = 1;

    for (let stageIndex = 0; stageIndex < preset.stages.length; stageIndex++) {
      const stage = preset.stages[stageIndex];
      for (let i = 0; i < stage.imageCount; i++) {
        if (imageIndex >= shuffled.length) {
          imageIndex = 0; // Loop back if we run out of images
        }
        entries.push({
          imageId: shuffled[imageIndex].id,
          duration: stage.duration,
          stageIndex,
          poseNumber,
        });
        images.push(shuffled[imageIndex]);
        imageIndex++;
        poseNumber++;
      }
    }

    practiceImages = images;
    timerEntries = entries;
    currentStageIndex = 0;
    setupMode = "choose";
    startPractice();
  }

  async function generateQuickSession() {
    let sourceImages: Image[];

    if (quickConfig.selectedTags.length > 0) {
      sourceImages = await getImagesByTags(quickConfig.selectedTags);
    } else {
      sourceImages = await getLibraryImages();
    }

    if (sourceImages.length === 0) {
      alert("No images match your filters. Please adjust your selection.");
      return;
    }

    if (quickConfig.stages.length === 0) {
      alert("Please add at least one stage to your session.");
      return;
    }

    // Shuffle images
    const shuffled = [...sourceImages].sort(() => Math.random() - 0.5);

    const entries: TimerEntry[] = [];
    const images: Image[] = [];
    let imageIndex = 0;
    let poseNumber = 1;

    for (
      let stageIndex = 0;
      stageIndex < quickConfig.stages.length;
      stageIndex++
    ) {
      const stage = quickConfig.stages[stageIndex];
      for (let i = 0; i < stage.imageCount; i++) {
        if (imageIndex >= shuffled.length) {
          imageIndex = 0;
        }
        entries.push({
          imageId: shuffled[imageIndex].id,
          duration: stage.duration,
          stageIndex,
          poseNumber,
        });
        images.push(shuffled[imageIndex]);
        imageIndex++;
        poseNumber++;
      }
    }

    practiceImages = images;
    timerEntries = entries;
    currentStageIndex = 0;
    setupMode = "choose";
    startPractice();
  }

  function addQuickStage() {
    quickConfig.stages.push({ imageCount: 10, duration: 60 });
    quickConfig = { ...quickConfig };
  }

  function removeQuickStage(index: number) {
    quickConfig.stages.splice(index, 1);
    quickConfig = { ...quickConfig };
  }

  function toggleQuickTag(tagId: string) {
    const index = quickConfig.selectedTags.indexOf(tagId);
    if (index >= 0) {
      quickConfig.selectedTags.splice(index, 1);
    } else {
      quickConfig.selectedTags.push(tagId);
    }
    quickConfig = { ...quickConfig };
  }

  function extendCurrentPose(seconds: number) {
    timeRemaining += seconds;
    const entry = timerEntries[currentIndex];
    if (entry) {
      entry.duration += seconds;
    }
  }

  function getCurrentStage(): SessionStage | null {
    const entry = timerEntries[currentIndex];
    if (!entry) return null;

    // Find which stage this entry belongs to based on preset
    if (selectedPreset) {
      return selectedPreset.stages[entry.stageIndex] || null;
    }

    // For quick sessions
    if (quickConfig.stages.length > 0) {
      return quickConfig.stages[entry.stageIndex] || null;
    }

    return null;
  }

  function getCurrentStageImages(): {
    image: Image;
    index: number;
    isActive: boolean;
  }[] {
    const entry = timerEntries[currentIndex];
    if (!entry) return [];

    const currentStageIndex = entry.stageIndex;
    const stageImages: { image: Image; index: number; isActive: boolean }[] =
      [];

    timerEntries.forEach((e, idx) => {
      if (e.stageIndex === currentStageIndex) {
        stageImages.push({
          image: practiceImages[idx],
          index: idx,
          isActive: idx === currentIndex,
        });
      }
    });

    return stageImages;
  }

  function revealUI() {
    if (uiLocked) return; // Don't auto-hide if locked
    showUI = true;
    if (uiHideTimer !== null) {
      clearTimeout(uiHideTimer);
    }
    uiHideTimer = window.setTimeout(() => {
      showUI = false;
    }, uiHideDelay);
  }

  function handlePointerActivity() {
    if (!showSetup && !uiLocked) revealUI();
  }

  function toggleUILock() {
    uiLocked = !uiLocked;
    if (uiLocked) {
      showUI = true;
      if (uiHideTimer !== null) {
        clearTimeout(uiHideTimer);
      }
    }
  }

  // Audio functions using Web Audio API
  function playChime() {
    try {
      const audioContext = new AudioContext();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      // Pleasant chime sound (two notes)
      oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
      oscillator.frequency.setValueAtTime(1000, audioContext.currentTime + 0.1);
      oscillator.type = "sine";

      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(
        0.01,
        audioContext.currentTime + 0.3
      );

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
    } catch (error) {
      console.error("Failed to play chime:", error);
    }
  }

  function playVictory() {
    try {
      const audioContext = new AudioContext();

      // Play a triumphant 4-note melody
      const notes = [
        { freq: 523.25, time: 0 }, // C5
        { freq: 659.25, time: 0.15 }, // E5
        { freq: 783.99, time: 0.3 }, // G5
        { freq: 1046.5, time: 0.45 }, // C6
      ];

      notes.forEach(({ freq, time }) => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.setValueAtTime(
          freq,
          audioContext.currentTime + time
        );
        oscillator.type = "sine";

        gainNode.gain.setValueAtTime(0.2, audioContext.currentTime + time);
        gainNode.gain.exponentialRampToValueAtTime(
          0.01,
          audioContext.currentTime + time + 0.4
        );

        oscillator.start(audioContext.currentTime + time);
        oscillator.stop(audioContext.currentTime + time + 0.4);
      });
    } catch (error) {
      console.error("Failed to play victory sound:", error);
    }
  }
</script>

<svelte:window
  onkeydown={handleKeydown}
  onmousemove={handlePointerActivity}
  onmousedown={handlePointerActivity}
  ontouchstart={handlePointerActivity}
/>

<div
  class={`${isFullscreen ? "h-screen w-screen" : "h-full"} flex flex-col bg-base-100`}
>
  {#if isLoading}
    <div class="flex-1 flex items-center justify-center">
      <span class="loading loading-spinner loading-lg"></span>
    </div>
  {:else if showSetup}
    <!-- Setup Screen - Choose Mode -->
    {#if setupMode === "choose" && practiceImages.length === 0}
      <div class="flex-1 flex items-center justify-center p-8">
        <div class="max-w-5xl w-full">
          <h1 class="text-4xl font-bold text-center mb-3 text-base-content">
            Timer Mode
          </h1>
          <p class="text-center text-base-content/70 mb-12 text-lg">
            Choose how you want to practice
          </p>

          <div class="grid md:grid-cols-2 gap-8">
            <!-- Classroom Mode Card -->
            <button
              class="card bg-base-200 shadow-xl hover:shadow-2xl transition-all border-2 border-transparent hover:border-primary text-left"
              onclick={() => (setupMode = "classroom")}
            >
              <div class="card-body">
                <div class="flex items-center gap-3 mb-4">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-12 w-12 text-primary"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                    />
                  </svg>
                  <div>
                    <h2 class="card-title text-2xl">Classroom Mode</h2>
                    <p class="text-sm text-base-content/70">6 presets</p>
                  </div>
                </div>
                <p class="text-base-content/80 mb-4">
                  Professional, battle-tested class structures used by real art
                  schools. One-click start with proven progressions.
                </p>
                <ul class="text-sm space-y-1 text-base-content/70">
                  <li>✓ Classic Warm-Up (~30 min)</li>
                  <li>✓ Standard 1-Hour Class</li>
                  <li>✓ Gesture Bootcamp</li>
                  <li>✓ And 3 more...</li>
                </ul>
              </div>
            </button>

            <!-- Quick Custom Session Card -->
            <button
              class="card bg-base-200 shadow-xl hover:shadow-2xl transition-all border-2 border-transparent hover:border-primary text-left"
              onclick={() => (setupMode = "quick")}
            >
              <div class="card-body">
                <div class="flex items-center gap-3 mb-4">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-12 w-12 text-secondary"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
                    />
                  </svg>
                  <div>
                    <h2 class="card-title text-2xl">Quick Custom Session</h2>
                    <p class="text-sm text-base-content/70">Build on the fly</p>
                  </div>
                </div>
                <p class="text-base-content/80 mb-4">
                  Create your own session with tag filters and custom stages.
                  Perfect for focused practice on specific subjects.
                </p>
                <ul class="text-sm space-y-1 text-base-content/70">
                  <li>✓ Filter by tags (poses, angles, etc.)</li>
                  <li>✓ Add multiple timed stages</li>
                  <li>✓ Flexible session structure</li>
                  <li>✓ Save custom presets</li>
                </ul>
              </div>
            </button>
          </div>

          <div class="text-center mt-8">
            <a href="/" class="btn btn-ghost btn-sm">
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
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
              Back to Library
            </a>
          </div>
        </div>
      </div>
    {:else if setupMode === "classroom"}
      <!-- Classroom Mode Presets -->
      <div class="flex-1 overflow-auto">
        <div class="p-8 max-w-6xl mx-auto">
          <div class="flex items-center justify-between mb-6">
            <div>
              <h1 class="text-3xl font-bold text-base-content">
                Classroom Mode
              </h1>
              <p class="text-base-content/70 mt-1">
                Professional preset sessions
              </p>
            </div>
            <button
              class="btn btn-ghost btn-sm"
              onclick={() => (setupMode = "choose")}
            >
              ← Back
            </button>
          </div>

          <div class="grid gap-4">
            {#each classroomPresets as preset (preset.id)}
              <div class="card bg-base-200 border border-base-300">
                <div class="card-body">
                  <div class="flex items-start justify-between">
                    <div class="flex-1">
                      <div class="flex items-center gap-3 mb-2">
                        <h3 class="card-title text-xl">{preset.name}</h3>
                        <span class="badge badge-primary"
                          >{preset.totalDuration}</span
                        >
                        <span class="badge badge-outline"
                          >{preset.stages.reduce(
                            (sum, s) => sum + s.imageCount,
                            0
                          )} poses</span
                        >
                      </div>
                      <p class="text-base-content/70 mb-3">
                        {preset.description}
                      </p>

                      <div class="flex flex-wrap gap-2 text-sm">
                        {#each preset.stages as stage, i}
                          <span class="badge badge-sm">
                            {stage.imageCount}×{formatTime(stage.duration)}
                          </span>
                        {/each}
                      </div>
                    </div>

                    <button
                      class="btn btn-primary"
                      onclick={() => {
                        selectedPreset = preset;
                        generateSessionFromPreset(preset);
                      }}
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
                      Start Session
                    </button>
                  </div>
                </div>
              </div>
            {/each}
          </div>
        </div>
      </div>
    {:else if setupMode === "quick"}
      <!-- Quick Custom Session Builder -->
      <div class="flex-1 overflow-auto">
        <div class="p-8 max-w-6xl mx-auto">
          <div class="flex items-center justify-between mb-6">
            <div>
              <h1 class="text-3xl font-bold text-base-content">
                Quick Custom Session
              </h1>
              <p class="text-base-content/70 mt-1">
                Build your own practice session
              </p>
            </div>
            <button
              class="btn btn-ghost btn-sm"
              onclick={() => (setupMode = "choose")}
            >
              ← Back
            </button>
          </div>

          <!-- Tag Filters -->
          <div class="card bg-base-200 mb-6">
            <div class="card-body">
              <h3 class="card-title text-lg mb-3">
                Filter Images by Tags (optional)
              </h3>
              <p class="text-sm text-base-content/70 mb-4">
                Select tags to filter which images appear in your session. Leave
                empty to use all library images.
              </p>

              <div class="flex flex-wrap gap-2">
                {#each allTags as tag}
                  <button
                    class="btn btn-sm"
                    class:btn-primary={quickConfig.selectedTags.includes(
                      tag.id
                    )}
                    class:btn-ghost={!quickConfig.selectedTags.includes(tag.id)}
                    onclick={() => toggleQuickTag(tag.id)}
                  >
                    {tag.name}
                  </button>
                {/each}
              </div>
            </div>
          </div>

          <!-- Stages -->
          <div class="card bg-base-200 mb-6">
            <div class="card-body">
              <div class="flex items-center justify-between mb-4">
                <h3 class="card-title text-lg">Session Stages</h3>
                <button class="btn btn-sm btn-primary" onclick={addQuickStage}>
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
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                  Add Stage
                </button>
              </div>

              {#if quickConfig.stages.length === 0}
                <div class="text-center py-8 text-base-content/50">
                  <p>No stages added yet. Click "Add Stage" to begin.</p>
                </div>
              {:else}
                <div class="space-y-3">
                  {#each quickConfig.stages as stage, index}
                    <div
                      class="flex items-center gap-4 bg-base-300 p-4 rounded-lg"
                    >
                      <span class="font-semibold text-base-content"
                        >Stage {index + 1}</span
                      >

                      <div class="flex items-center gap-2">
                        <span class="text-sm text-base-content/70">Images:</span
                        >
                        <input
                          type="number"
                          class="input input-sm input-bordered w-20"
                          bind:value={stage.imageCount}
                          min="1"
                          max="100"
                        />
                      </div>

                      <div class="flex items-center gap-2">
                        <span class="text-sm text-base-content/70"
                          >Duration:</span
                        >
                        <select
                          class="select select-sm select-bordered w-32"
                          bind:value={stage.duration}
                        >
                          <option value={10}>10 seconds</option>
                          <option value={20}>20 seconds</option>
                          <option value={30}>30 seconds</option>
                          <option value={60}>1 minute</option>
                          <option value={120}>2 minutes</option>
                          <option value={300}>5 minutes</option>
                          <option value={600}>10 minutes</option>
                          <option value={1200}>20 minutes</option>
                          <option value={2700}>45 minutes</option>
                        </select>
                      </div>

                      <div class="flex-1"></div>

                      <button
                        class="btn btn-sm btn-ghost btn-circle"
                        onclick={() => removeQuickStage(index)}
                        aria-label="Remove stage"
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
                  {/each}
                </div>
              {/if}
            </div>
          </div>

          <!-- Start Button -->
          <div class="flex justify-end">
            <button
              class="btn btn-primary btn-lg"
              onclick={generateQuickSession}
              disabled={quickConfig.stages.length === 0}
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
                  d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                />
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              Start Custom Session
            </button>
          </div>
        </div>
      </div>
    {:else}
      <!-- Legacy Setup Screen (from library) -->
      <header class="p-6 border-b border-base-300">
        <div class="flex items-center justify-between mb-4">
          <div>
            <h1 class="text-2xl font-semibold text-base-content">
              Practice Session Setup
            </h1>
            <p class="text-sm text-base-content/70 mt-1">
              {practiceImages.length} images selected
            </p>
          </div>
          <div class="flex items-center gap-3">
            <a href="/" class="btn btn-sm btn-ghost">Cancel</a>
            <button class="btn btn-sm btn-primary" onclick={startPractice}>
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

        <!-- Quick Set All -->
        <div class="flex items-center gap-3">
          <span class="text-sm text-base-content/70">Set all timers to:</span>
          {#each presetDurations as duration}
            <button
              class="btn btn-sm btn-ghost"
              onclick={() => setAllDurations(duration)}
            >
              {formatTime(duration)}
            </button>
          {/each}
        </div>
      </header>

      <!-- Timer List -->
      <div class="flex-1 overflow-auto p-6">
        <div class="space-y-3">
          {#each practiceImages as image, index (index)}
            {@const entry = timerEntries[index]}
            <div
              class="bg-base-200 rounded-lg p-4 flex items-center gap-4 border border-base-300"
            >
              <!-- Image Number -->
              <div
                class="flex-shrink-0 w-10 h-10 rounded-full bg-primary text-primary-content flex items-center justify-center font-semibold"
              >
                {index + 1}
              </div>

              <!-- Image Thumbnail -->
              <div class="flex-shrink-0 w-20 h-20">
                <img
                  src={convertFileSrc(image.fullPath)}
                  alt={image.filename}
                  class="w-full h-full object-cover rounded"
                />
              </div>

              <!-- Image Info -->
              <div class="flex-1 min-w-0">
                <p class="font-medium truncate">{image.filename}</p>
                <p class="text-sm text-base-content/60">
                  Duration: {formatTime(entry?.duration || 60)}
                </p>
              </div>

              <!-- Timer Duration Buttons -->
              <div class="flex-shrink-0 flex items-center gap-2">
                {#each presetDurations as duration}
                  <button
                    class="btn btn-sm"
                    class:btn-primary={entry?.duration === duration}
                    class:btn-ghost={entry?.duration !== duration}
                    onclick={() => updateDuration(image.id, duration)}
                  >
                    {formatTime(duration)}
                  </button>
                {/each}
              </div>

              <!-- Custom Duration Input -->
              <div class="flex-shrink-0">
                <input
                  type="number"
                  class="input input-sm input-bordered w-20"
                  placeholder="Sec"
                  value={entry?.duration}
                  onchange={(e) =>
                    updateDuration(
                      image.id,
                      parseInt(e.currentTarget.value) || 60
                    )}
                  min="1"
                  max="3600"
                />
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  {:else}
    <!-- Practice Session Active -->
    <div class="h-full min-h-0 flex flex-col bg-black relative">
      <!-- Top Bar -->
      <div
        class="absolute top-0 left-0 right-0 z-10 bg-base-100 px-6 py-3 flex items-center justify-between border-b border-base-300 transition-opacity duration-200"
        class:opacity-0={!showUI && !uiLocked}
        class:pointer-events-none={!showUI && !uiLocked}
      >
        <!-- Progress -->
        <div class="flex flex-col gap-1">
          <div class="flex items-center gap-3">
            <span class="text-sm font-semibold text-base-content">
              Pose {timerEntries[currentIndex]?.poseNumber || currentIndex + 1} of
              {timerEntries.length}
            </span>
            <progress
              class="progress progress-primary w-32"
              value={currentIndex + 1}
              max={timerEntries.length}
            ></progress>
          </div>
          {#if timerEntries[currentIndex]}
            {@const stage = getCurrentStage()}
            {#if stage && stage.description}
              <span class="text-xs text-base-content/60">
                Stage: {stage.description}
              </span>
            {/if}
          {/if}
        </div>

        <!-- Timer Display -->
        <div class="flex items-center gap-3">
          <div class="text-4xl font-bold font-mono text-base-content">
            {formatTime(timeRemaining)}
          </div>
          {#if timeRemaining === 0}
            <span class="badge badge-success badge-lg">Complete</span>
          {:else if isPaused}
            <span class="badge badge-warning badge-lg">Paused</span>
          {/if}
        </div>

        <div class="flex items-center gap-2">
          <!-- Fullscreen Toggle -->
          <button
            class="btn btn-sm"
            onclick={toggleFullscreen}
            title={isFullscreen
              ? "Exit fullscreen (F)"
              : "Enter fullscreen (F)"}
          >
            {#if isFullscreen}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="2"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            {:else}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="2"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                />
              </svg>
            {/if}
          </button>

          <!-- Teacher Controls: Extend Pose -->
          <div class="dropdown dropdown-end">
            <button tabindex="0" class="btn btn-sm" title="Extend current pose">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="2"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              +Time
            </button>
            <ul
              class="dropdown-content z-[1] menu p-2 shadow bg-base-100 rounded-box w-40"
            >
              <li>
                <button onclick={() => extendCurrentPose(60)}>+1 minute</button>
              </li>
              <li>
                <button onclick={() => extendCurrentPose(300)}
                  >+5 minutes</button
                >
              </li>
              <li>
                <button onclick={() => extendCurrentPose(600)}
                  >+10 minutes</button
                >
              </li>
            </ul>
          </div>

          <!-- Lock UI Toggle -->
          <button
            class="btn btn-sm"
            class:btn-active={uiLocked}
            onclick={toggleUILock}
            title={uiLocked
              ? "Unlock UI (auto-hide enabled)"
              : "Lock UI (always visible)"}
          >
            {#if uiLocked}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="2"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            {:else}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="2"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"
                />
              </svg>
            {/if}
          </button>

          <!-- Plumb Tool Controls -->
          <div class="dropdown dropdown-end">
            <button
              tabindex="0"
              class="btn btn-sm"
              class:btn-active={showPlumbTool}
              title="Alignment tools (Ctrl+L)"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="2"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
              Tools
            </button>
            <div
              class="dropdown-content z-[1] menu p-3 shadow bg-base-100 rounded-box w-72"
            >
              <div class="flex flex-col gap-3">
                <div class="text-xs font-bold opacity-60">ALIGNMENT TOOLS</div>

                <div class="form-control">
                  <label class="label cursor-pointer">
                    <span class="label-text">Vertical Lines (V)</span>
                    <input
                      type="checkbox"
                      bind:checked={showVerticalLines}
                      onchange={() => {
                        if (showVerticalLines) showPlumbTool = true;
                      }}
                      class="checkbox checkbox-sm"
                    />
                  </label>
                </div>

                <div class="form-control">
                  <label class="label cursor-pointer">
                    <span class="label-text">Horizontal Lines (H)</span>
                    <input
                      type="checkbox"
                      bind:checked={showHorizontalLines}
                      onchange={() => {
                        if (showHorizontalLines) showPlumbTool = true;
                      }}
                      class="checkbox checkbox-sm"
                    />
                  </label>
                </div>

                <div class="form-control">
                  <label class="label cursor-pointer">
                    <span class="label-text">Angle Mode (A)</span>
                    <input
                      type="checkbox"
                      bind:checked={angleMode}
                      onchange={() => {
                        if (angleMode) showPlumbTool = true;
                      }}
                      class="checkbox checkbox-sm"
                    />
                  </label>
                </div>

                <div class="divider my-0"></div>

                <div class="form-control">
                  <label class="label cursor-pointer">
                    <span class="label-text">Lock Tools (Ctrl+Shift+L)</span>
                    <input
                      type="checkbox"
                      bind:checked={plumbLocked}
                      class="checkbox checkbox-sm"
                    />
                  </label>
                </div>

                <div class="form-control">
                  <label class="label" for="plumb-color-picker">
                    <span class="label-text">Line Color</span>
                  </label>
                  <input
                    id="plumb-color-picker"
                    type="color"
                    bind:value={plumbColor}
                    class="w-full h-8"
                  />
                </div>

                <button
                  class="btn btn-sm btn-error"
                  onclick={() => {
                    angleLines = [];
                    currentAngleLine = null;
                  }}
                  disabled={angleLines.length === 0 && !currentAngleLine}
                >
                  Clear All Angles
                </button>

                {#if showPlumbTool}
                  <button
                    class="btn btn-sm btn-primary"
                    onclick={() => {
                      showAlignmentCheck = true;
                      setTimeout(() => {
                        showAlignmentCheck = false;
                      }, 15000);
                    }}
                  >
                    CHECK ALIGNMENT (15s)
                  </button>
                {/if}

                <div class="text-xs opacity-60 mt-2">
                  <div><strong>V</strong> - Toggle vertical lines</div>
                  <div><strong>H</strong> - Toggle horizontal lines</div>
                  <div><strong>A</strong> - Toggle angle mode</div>
                  <div><strong>Ctrl+L</strong> - Toggle all tools</div>
                  <div><strong>Ctrl+Shift+L</strong> - Lock/unlock</div>
                  <div><strong>Ctrl+Shift+A</strong> - Check alignment</div>
                  <div><strong>Delete</strong> - Remove last angle</div>
                </div>
              </div>
            </div>
          </div>

          <!-- Exit Button -->
          <button
            class="btn btn-sm btn-ghost"
            onclick={exitPractice}
            title="Exit practice (Esc)"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
            Exit
          </button>
        </div>
      </div>

      <!-- Image Display -->
      <div
        class="absolute flex items-center justify-center overflow-hidden"
        class:inset-0={!uiLocked}
        class:top-[73px]={uiLocked}
        class:bottom-[205px]={uiLocked}
        class:left-0={uiLocked}
        class:right-0={uiLocked}
        bind:this={imageContainerRef}
      >
        {#if practiceImages[currentIndex]}
          {@const currentImage = practiceImages[currentIndex]}
          <img
            src={convertFileSrc(currentImage.fullPath)}
            alt={currentImage.filename}
            class="max-w-full max-h-full object-contain"
          />

          <!-- Plumb Line & Angle Overlay -->
          {#if showPlumbTool && imageContainerRef}
            <svg
              class="absolute inset-0 w-full h-full pointer-events-auto"
              style="z-index: 5;"
              onpointermove={handlePlumbPointerMove}
              onpointerdown={handlePlumbPointerDown}
              onpointerup={handlePlumbPointerUp}
            >
              <!-- Vertical Lines -->
              {#if showVerticalLines}
                <!-- Center vertical line -->
                <line
                  x1="50%"
                  y1="0"
                  x2="50%"
                  y2="100%"
                  stroke={plumbColor}
                  stroke-width="2"
                  stroke-dasharray="10 5"
                  opacity="0.8"
                />

                <!-- Draggable vertical line -->
                <line
                  x1="{verticalLine2X * 100}%"
                  y1="0"
                  x2="{verticalLine2X * 100}%"
                  y2="100%"
                  stroke={plumbColor}
                  stroke-width="2"
                  opacity="0.9"
                  style="cursor: {plumbLocked ? 'default' : 'ew-resize'};"
                  data-drag-target="vertical-line"
                />

                <!-- Drag handle for vertical line -->
                {#if !plumbLocked}
                  <circle
                    cx="{verticalLine2X * 100}%"
                    cy="50%"
                    r="8"
                    fill={plumbColor}
                    opacity="0.7"
                    style="cursor: ew-resize;"
                    data-drag-target="vertical-line"
                  />
                {/if}
              {/if}

              <!-- Horizontal Lines -->
              {#if showHorizontalLines}
                <!-- Center horizontal line -->
                <line
                  x1="0"
                  y1="50%"
                  x2="100%"
                  y2="50%"
                  stroke={plumbColor}
                  stroke-width="2"
                  stroke-dasharray="10 5"
                  opacity="0.8"
                />

                <!-- Draggable horizontal line -->
                <line
                  x1="0"
                  y1="{horizontalLine2Y * 100}%"
                  x2="100%"
                  y2="{horizontalLine2Y * 100}%"
                  stroke={plumbColor}
                  stroke-width="2"
                  opacity="0.9"
                  style="cursor: {plumbLocked ? 'default' : 'ns-resize'};"
                  data-drag-target="horizontal-line"
                />

                <!-- Drag handle for horizontal line -->
                {#if !plumbLocked}
                  <circle
                    cx="50%"
                    cy="{horizontalLine2Y * 100}%"
                    r="8"
                    fill={plumbColor}
                    opacity="0.7"
                    style="cursor: ns-resize;"
                    data-drag-target="horizontal-line"
                  />
                {/if}
              {/if}

              <!-- Angle Lines -->
              {#each angleLines as angleLine, i (angleLine.id)}
                {@const dx = angleLine.pointB.x - angleLine.pointA.x}
                {@const dy = angleLine.pointB.y - angleLine.pointA.y}
                {@const angleFromVertical = Math.abs(
                  (Math.atan2(dx, -dy) * 180) / Math.PI
                )}
                {@const angleFromHorizontal = Math.abs(
                  (Math.atan2(dy, dx) * 180) / Math.PI
                )}
                {@const absoluteAngle = Math.abs(
                  (Math.atan2(dy, dx) * 180) / Math.PI
                )}

                <!-- Line connecting points -->
                <line
                  x1="{angleLine.pointA.x * 100}%"
                  y1="{angleLine.pointA.y * 100}%"
                  x2="{angleLine.pointB.x * 100}%"
                  y2="{angleLine.pointB.y * 100}%"
                  stroke={plumbColor}
                  stroke-width="3"
                  opacity="0.9"
                />

                <!-- Point A -->
                <circle
                  cx="{angleLine.pointA.x * 100}%"
                  cy="{angleLine.pointA.y * 100}%"
                  r="6"
                  fill={plumbColor}
                  opacity="0.9"
                  style="cursor: {plumbLocked ? 'default' : 'move'};"
                  data-drag-target="angle-point-a-{angleLine.id}"
                />
                <text
                  x="{angleLine.pointA.x * 100}%"
                  y="{angleLine.pointA.y * 100}%"
                  dx="10"
                  dy="-10"
                  fill={plumbColor}
                  font-size="14"
                  font-weight="bold"
                >
                  A
                </text>

                <!-- Point B -->
                <circle
                  cx="{angleLine.pointB.x * 100}%"
                  cy="{angleLine.pointB.y * 100}%"
                  r="6"
                  fill={plumbColor}
                  opacity="0.9"
                  style="cursor: {plumbLocked ? 'default' : 'move'};"
                  data-drag-target="angle-point-b-{angleLine.id}"
                />
                <text
                  x="{angleLine.pointB.x * 100}%"
                  y="{angleLine.pointB.y * 100}%"
                  dx="10"
                  dy="-10"
                  fill={plumbColor}
                  font-size="14"
                  font-weight="bold"
                >
                  B
                </text>

                <!-- Angle display (midpoint) -->
                <text
                  x="{((angleLine.pointA.x + angleLine.pointB.x) / 2) * 100}%"
                  y="{((angleLine.pointA.y + angleLine.pointB.y) / 2) * 100}%"
                  dx="10"
                  dy="5"
                  fill={plumbColor}
                  font-size="16"
                  font-weight="bold"
                  style="background: rgba(0,0,0,0.5); padding: 2px 4px;"
                >
                  {angleFromVertical.toFixed(1)}° | {angleFromHorizontal.toFixed(
                    1
                  )}° | {absoluteAngle.toFixed(1)}°
                </text>
              {/each}

              <!-- Current angle line being drawn -->
              {#if angleMode && currentAngleLine}
                {#if currentAngleLine.pointA && !currentAngleLine.pointB}
                  <!-- Show point A only -->
                  <circle
                    cx="{currentAngleLine.pointA.x * 100}%"
                    cy="{currentAngleLine.pointA.y * 100}%"
                    r="6"
                    fill={plumbColor}
                    opacity="0.9"
                  />
                  <text
                    x="{currentAngleLine.pointA.x * 100}%"
                    y="{currentAngleLine.pointA.y * 100}%"
                    dx="10"
                    dy="-10"
                    fill={plumbColor}
                    font-size="14"
                    font-weight="bold"
                  >
                    A
                  </text>
                {/if}
              {/if}
            </svg>
          {/if}
        {/if}
      </div>

      <!-- Alignment Check Freeze Overlay -->
      {#if showAlignmentCheck}
        <div
          class="absolute inset-0 z-20 bg-black/80 flex items-center justify-center"
        >
          <div class="text-center">
            <div class="text-6xl font-bold text-red-500 mb-4 animate-pulse">
              CHECK ALIGNMENT
            </div>
            <div class="text-2xl text-white">Timer paused for inspection</div>
          </div>
        </div>
      {/if}

      <!-- Bottom Controls -->
      <div
        class="absolute bottom-0 left-0 right-0 z-10 bg-base-100 px-6 py-4 border-t border-base-300 transition-opacity duration-200"
        class:opacity-0={!showUI && !uiLocked}
        class:pointer-events-none={!showUI && !uiLocked}
      >
        <!-- Main Controls -->
        <div class="flex items-center justify-center gap-3 mb-4">
          <!-- Previous Button -->
          <button
            class="btn btn-circle btn-lg"
            onclick={goToPrevious}
            disabled={currentIndex === 0}
            title="Previous (←)"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-7 w-7"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2.5"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>

          <!-- Play/Pause Button -->
          <button
            class="btn btn-circle btn-lg btn-primary"
            onclick={isPaused ? resumeTimer : pauseTimer}
            title={isPaused ? "Resume (Space)" : "Pause (Space)"}
          >
            {#if isPaused}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-9 w-9"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="2.5"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                />
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            {:else}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-9 w-9"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="2.5"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            {/if}
          </button>

          <!-- Next Button -->
          <button
            class="btn btn-circle btn-lg"
            onclick={goToNext}
            disabled={currentIndex === practiceImages.length - 1}
            title="Next (→)"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-7 w-7"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2.5"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>

          <!-- Reset Timer Button -->
          <button
            class="btn btn-circle"
            onclick={resetCurrentTimer}
            title="Reset timer (R)"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2.5"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        </div>

        <!-- Image Thumbnails -->
        <div
          class="flex items-center justify-center gap-2 overflow-x-auto pb-2"
        >
          {#each getCurrentStageImages() as { image, index, isActive } (index)}
            <button
              class="relative flex-shrink-0 w-16 h-16 rounded overflow-hidden border-2 transition-all"
              class:border-primary={isActive}
              class:border-base-300={!isActive}
              class:opacity-50={!isActive}
              onclick={() => goToImage(index)}
              title="Go to pose {timerEntries[index]?.poseNumber || index + 1}"
            >
              <img
                src={convertFileSrc(image.fullPath)}
                alt={image.filename}
                class="w-full h-full object-cover"
              />
              {#if index < currentIndex}
                <div
                  class="absolute inset-0 bg-success/30 flex items-center justify-center"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-6 w-6 text-success"
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
              <div
                class="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-xs text-center py-0.5"
              >
                {timerEntries[index]?.poseNumber || index + 1}
              </div>
            </button>
          {/each}
        </div>

        <!-- Keyboard Shortcuts Hint -->
        <div
          class="flex items-center justify-center gap-4 mt-2 text-xs font-medium text-base-content"
        >
          <span>← → Navigate</span>
          <span>Space Pause/Resume</span>
          <span>R Reset</span>
          <span>F Fullscreen</span>
          <span>Esc Exit</span>
        </div>
      </div>

      <!-- Minimal overlay when UI hidden (not shown when locked) -->
      {#if !showUI && !uiLocked}
        <div class="absolute top-3 left-3 z-20">
          <div
            class="px-3 py-1 rounded bg-base-100/90 text-base-content shadow text-sm font-mono font-semibold"
          >
            {formatTime(timeRemaining)}
          </div>
        </div>
        <div class="absolute top-3 right-3 z-20 flex items-center gap-2">
          {#if timeRemaining === 0}
            <span class="badge badge-success">Complete</span>
          {:else if isPaused}
            <span class="badge badge-warning">Paused</span>
          {/if}
        </div>
      {/if}

      <!-- Session Completion Modal -->
      {#if showCompletion}
        <div
          class="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
        >
          <div class="card bg-base-100 shadow-2xl w-96 animate-bounce-in">
            <div class="card-body text-center">
              <!-- Trophy Icon -->
              <div class="flex justify-center mb-4">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-24 w-24 text-warning animate-pulse"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
                  />
                </svg>
              </div>

              <h2 class="card-title text-3xl justify-center mb-2">
                Session Complete!
              </h2>
              <p class="text-base-content/70 mb-4">
                Great work! You completed {timerEntries.length} poses.
              </p>

              <div class="stats shadow mb-4">
                <div class="stat py-3">
                  <div class="stat-title text-xs">Total Poses</div>
                  <div class="stat-value text-2xl text-primary">
                    {timerEntries.length}
                  </div>
                </div>
                {#if selectedPreset}
                  <div class="stat py-3">
                    <div class="stat-title text-xs">Session Type</div>
                    <div class="stat-value text-lg">{selectedPreset.name}</div>
                  </div>
                {/if}
              </div>

              <div class="card-actions justify-center gap-3">
                <button
                  class="btn btn-primary"
                  onclick={() => {
                    showCompletion = false;
                    exitPractice();
                  }}
                >
                  Finish
                </button>
                <button
                  class="btn btn-outline"
                  onclick={() => {
                    showCompletion = false;
                    currentIndex = 0;
                    startTimer();
                  }}
                >
                  Restart Session
                </button>
              </div>
            </div>
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  :global(html:fullscreen),
  :global(body:fullscreen) {
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    background: black;
  }

  @keyframes bounce-in {
    0% {
      transform: scale(0.3);
      opacity: 0;
    }
    50% {
      transform: scale(1.05);
    }
    70% {
      transform: scale(0.9);
    }
    100% {
      transform: scale(1);
      opacity: 1;
    }
  }

  .animate-bounce-in {
    animation: bounce-in 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55);
  }
</style>

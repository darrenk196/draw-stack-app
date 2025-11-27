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
  import { toast } from "$lib/toast";

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
    tagIds?: string[]; // Per-stage tag filtering
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

  interface CustomSession {
    id: string;
    name: string;
    stages: SessionStage[];
    createdAt: number;
  }

  const CUSTOM_SESSIONS_KEY = "customPracticeSessions";

  function loadCustomSessions(): CustomSession[] {
    if (typeof localStorage === "undefined") return [];
    try {
      const stored = localStorage.getItem(CUSTOM_SESSIONS_KEY);
      if (!stored) return [];
      return JSON.parse(stored);
    } catch {
      return [];
    }
  }

  function loadRecentTags(): string[] {
    if (typeof localStorage === "undefined") return [];
    try {
      const stored = localStorage.getItem(RECENT_TAGS_KEY);
      if (!stored) return [];
      return JSON.parse(stored);
    } catch {
      return [];
    }
  }

  function saveRecentTags(tagIds: string[]) {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(RECENT_TAGS_KEY, JSON.stringify(tagIds));
    } catch (e) {
      console.error("Failed to save recent tags", e);
    }
  }

  function markTagAsRecent(tagId: string) {
    const updated = [tagId, ...recentTagIds.filter((id) => id !== tagId)].slice(
      0,
      MAX_RECENT_TAGS
    );
    recentTagIds = updated;
    saveRecentTags(updated);
  }

  function saveCustomSessions(sessions: CustomSession[]) {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(CUSTOM_SESSIONS_KEY, JSON.stringify(sessions));
    } catch (e) {
      console.error("Failed to save custom sessions", e);
    }
  }

  let customSessions = $state<CustomSession[]>(loadCustomSessions());
  let classroomPresets = $state<ClassroomPreset[]>([]);

  function loadClassroomPresets(): ClassroomPreset[] {
    if (typeof localStorage === "undefined") return defaultClassroomPresets;
    try {
      const stored = localStorage.getItem(CLASSROOM_PRESETS_KEY);
      if (!stored) return defaultClassroomPresets;
      return JSON.parse(stored);
    } catch {
      return defaultClassroomPresets;
    }
  }

  function saveClassroomPresets(presets: ClassroomPreset[]) {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(CLASSROOM_PRESETS_KEY, JSON.stringify(presets));
    } catch (e) {
      console.error("Failed to save classroom presets", e);
    }
  }

  function deleteClassroomPreset(presetId: string) {
    classroomPresets = classroomPresets.filter((p) => p.id !== presetId);
    saveClassroomPresets(classroomPresets);

    // Also check if this is a custom session and remove from there too
    const isCustomSession = customSessions.some((s) => s.id === presetId);
    if (isCustomSession) {
      customSessions = customSessions.filter((s) => s.id !== presetId);
      saveCustomSessions(customSessions);
    }

    toast.success("Preset deleted");
  }

  function convertCustomSessionToPreset(
    session: CustomSession
  ): ClassroomPreset {
    const totalMinutes = Math.ceil(
      session.stages.reduce((sum, s) => sum + s.imageCount * s.duration, 0) / 60
    );
    return {
      id: session.id,
      name: session.name,
      totalDuration: `~${totalMinutes} min`,
      description: "Custom session",
      stages: session.stages,
    };
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

  // Tag UI state
  let tagSearchQuery = $state("");
  let recentTagIds = $state<string[]>([]);
  const RECENT_TAGS_KEY = "recentlyUsedTags";
  const MAX_RECENT_TAGS = 12;

  // Derived tag organization
  const tagsByCategory = $derived.by(() => {
    const categories = new Map<string, typeof allTags>();

    for (const tag of allTags) {
      const category = tag.parentId || "Uncategorized";
      if (!categories.has(category)) {
        categories.set(category, []);
      }
      categories.get(category)!.push(tag);
    }

    // Sort categories alphabetically, but keep "Uncategorized" last
    return Array.from(categories.entries())
      .sort(([a], [b]) => {
        if (a === "Uncategorized") return 1;
        if (b === "Uncategorized") return -1;
        return a.localeCompare(b);
      })
      .map(([category, tags]) => ({
        name: category,
        tags: tags.sort((a, b) => a.name.localeCompare(b.name)),
      }));
  });

  const filteredTags = $derived.by(() => {
    if (!tagSearchQuery.trim()) return allTags;
    const query = tagSearchQuery.toLowerCase();
    return allTags.filter((tag) => tag.name.toLowerCase().includes(query));
  });

  const recentTags = $derived.by(() => {
    return recentTagIds
      .map((id) => allTags.find((t) => t.id === id))
      .filter(Boolean);
  });

  // Practice session state
  let currentIndex = $state(0);
  let isPaused = $state(false);
  let timeRemaining = $state(0);
  let timerInterval: number | null = null;
  let isFullscreen = $state(false);
  let showUI = $state(true);
  let uiHideTimer: number | null = null;
  const uiHideDelay = 2000; // ms
  let uiLocked = $state(true);
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
    color: string;
  }

  let showPlumbTool = $state(false);
  let showVerticalLines = $state(false);
  let showHorizontalLines = $state(false);
  let verticalLine2X = $state(0.3); // as percentage of image width
  let horizontalLine2Y = $state(0.3); // as percentage of image height
  let angleMode = $state(false);
  let currentAngleLine = $state<AngleLine | null>(null);
  let angleLines = $state<AngleLine[]>([]);
  let plumbColor = $state("#FF0000");
  let randomColors = $state(true);
  let snapToAngle = $state(true);
  let dragTarget = $state<string | null>(null);
  let imageContainerRef = $state<HTMLDivElement | null>(null);
  let imageElementRef = $state<HTMLImageElement | null>(null);

  // Track held keys for line movement
  let heldKeys = $state<Set<string>>(new Set());
  let arrowUsedWithModifier = $state(false);

  // Color presets for grid and plumb lines
  const colorPresets = [
    { name: "Red", color: "#FF0000" },
    { name: "Cyan", color: "#00FFFF" },
    { name: "Yellow", color: "#FFFF00" },
    { name: "Magenta", color: "#FF00FF" },
    { name: "Lime", color: "#00FF00" },
    { name: "White", color: "#FFFFFF" },
    { name: "Orange", color: "#FF8800" },
    { name: "Blue", color: "#0088FF" },
    { name: "Pink", color: "#FF88FF" },
    { name: "Green", color: "#00FF88" },
  ];
  let currentColorIndex = $state(0);

  // Line visibility enhancement options
  let lineOpacity = $state(0.9); // 0.1 to 1.0
  let lineOutline = $state(true); // Add contrasting outline for visibility

  // Grid overlay state
  let gridMode = $state<0 | 1 | 2 | 3>(0); // 0=off, 1=fine(32x32), 2=medium(16x16), 3=coarse(8x8)
  let showDiagonals = $state(false);
  let gridLocked = $state(false);
  let gridLineWidth = $state(1); // px, range 1-5

  // Image bounds for grid overlay
  let imageBounds = $state({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
  });

  const gridSizes = {
    1: { cells: 32, label: "32×32" },
    2: { cells: 16, label: "16×16" },
    3: { cells: 8, label: "8×8" },
  } as const;

  // Default timer durations
  const presetDurations = [30, 60, 120, 300, 600]; // 30s, 1m, 2m, 5m, 10m

  const CLASSROOM_PRESETS_KEY = "classroomPresets";

  // Default Classroom Mode Presets
  const defaultClassroomPresets: ClassroomPreset[] = [
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
    recentTagIds = loadRecentTags();
    classroomPresets = loadClassroomPresets();

    // Merge custom sessions into classroom presets
    const customPresets = customSessions.map(convertCustomSessionToPreset);
    const existingIds = new Set(classroomPresets.map((p) => p.id));
    const newCustomPresets = customPresets.filter(
      (p) => !existingIds.has(p.id)
    );
    if (newCustomPresets.length > 0) {
      classroomPresets = [...classroomPresets, ...newCustomPresets];
      saveClassroomPresets(classroomPresets);
    }

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
      // Clear angle measurements when changing images
      angleLines = [];
      currentAngleLine = null;
      startTimer();
    }
  }

  function goToNext() {
    if (currentIndex < practiceImages.length - 1) {
      currentIndex++;
      // Clear angle measurements when changing images
      angleLines = [];
      currentAngleLine = null;
      startTimer();
    }
  }

  function goToImage(index: number) {
    currentIndex = index;
    // Clear angle measurements when changing images
    angleLines = [];
    currentAngleLine = null;
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

  // Get contrasting outline color (inverse for visibility)
  function getOutlineColor(mainColor: string): string {
    // For common bright colors, use black outline
    const brightColors = [
      "#FFFF00",
      "#00FFFF",
      "#00FF00",
      "#FFFFFF",
      "#FF88FF",
      "#00FF88",
    ];
    if (brightColors.includes(mainColor.toUpperCase())) {
      return "#000000";
    }
    // For dark/saturated colors, use white outline
    return "#FFFFFF";
  }

  // Plumb Tool Interaction Handlers
  function getRandomColor(): string {
    const colors = [
      "#FF0000", // Red
      "#00FF00", // Green
      "#0000FF", // Blue
      "#FFFF00", // Yellow
      "#FF00FF", // Magenta
      "#00FFFF", // Cyan
      "#FF8800", // Orange
      "#8800FF", // Purple
      "#00FF88", // Spring Green
      "#FF0088", // Hot Pink
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  function getRelativeCoords(e: PointerEvent): Point {
    if (
      !imageContainerRef ||
      imageBounds.width === 0 ||
      imageBounds.height === 0
    ) {
      return { x: 0.5, y: 0.5 };
    }
    const containerRect = imageContainerRef.getBoundingClientRect();
    const imgLeft = containerRect.left + imageBounds.left;
    const imgTop = containerRect.top + imageBounds.top;

    return {
      x: (e.clientX - imgLeft) / imageBounds.width,
      y: (e.clientY - imgTop) / imageBounds.height,
    };
  }

  function handlePlumbPointerDown(e: PointerEvent) {
    const target = (e.target as HTMLElement).getAttribute("data-drag-target");

    // Handle angle mode clicks
    if (angleMode && !target) {
      const coords = getRelativeCoords(e);

      if (!currentAngleLine) {
        // Start new angle line with point A
        const lineColor = randomColors ? getRandomColor() : plumbColor;
        currentAngleLine = {
          id: Date.now().toString(),
          pointA: coords,
          pointB: coords,
          color: lineColor,
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
    if (!dragTarget) return;

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

    // Track held keys
    heldKeys.add(e.key.toLowerCase());

    // V and H keys - only prevent default, don't toggle yet (toggle on keyup)
    if (e.key === "v" || e.key === "V") {
      if (!e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        return;
      }
    }
    if (e.key === "h" || e.key === "H") {
      if (!e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        return;
      }
    }
    if (e.key === "a" || e.key === "A") {
      if (e.altKey) {
        // Alt+A - Clear all angles
        e.preventDefault();
        angleLines = [];
        currentAngleLine = null;
        return;
      }
      if (!e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        angleMode = !angleMode;
        if (angleMode) showPlumbTool = true;
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
    if (e.key === "l" || e.key === "L") {
      if (!e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        // Toggle UI lock (same as clicking lock icon)
        uiLocked = !uiLocked;
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

    // Grid tool shortcuts
    if (e.key === "g" || e.key === "G") {
      if (!e.ctrlKey && !e.metaKey && !gridLocked) {
        e.preventDefault();
        // Cycle through grid modes: 0 -> 1 -> 2 -> 3 -> 0
        gridMode = ((gridMode + 1) % 4) as 0 | 1 | 2 | 3;
        return;
      }
    }
    if (e.key === "d" || e.key === "D") {
      if (!e.ctrlKey && !e.metaKey && gridMode > 0) {
        e.preventDefault();
        showDiagonals = !showDiagonals;
        return;
      }
    }
    if (e.key === "c" || e.key === "C") {
      if (!e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        // Cycle through color presets
        currentColorIndex = (currentColorIndex + 1) % colorPresets.length;
        return;
      }
    }
    if (e.key === "=" || e.key === "+") {
      if (!e.ctrlKey && !e.metaKey && gridMode > 0) {
        e.preventDefault();
        gridLineWidth = Math.min(5, gridLineWidth + 1);
        return;
      }
    }
    if (e.key === "-" || e.key === "_") {
      if (!e.ctrlKey && !e.metaKey && gridMode > 0) {
        e.preventDefault();
        gridLineWidth = Math.max(1, gridLineWidth - 1);
        return;
      }
    }

    // Only reveal UI for playback controls, not navigation
    switch (e.key) {
      case "ArrowLeft":
        if (heldKeys.has("v")) {
          // Move vertical line left
          e.preventDefault();
          arrowUsedWithModifier = true;
          verticalLine2X = Math.max(0, verticalLine2X - 0.01);
        } else {
          goToPrevious();
        }
        break;
      case "ArrowRight":
        if (heldKeys.has("v")) {
          // Move vertical line right
          e.preventDefault();
          arrowUsedWithModifier = true;
          verticalLine2X = Math.min(1, verticalLine2X + 0.01);
        } else {
          goToNext();
        }
        break;
      case "ArrowUp":
        if (heldKeys.has("h")) {
          // Move horizontal line up
          e.preventDefault();
          arrowUsedWithModifier = true;
          horizontalLine2Y = Math.max(0, horizontalLine2Y - 0.01);
        }
        break;
      case "ArrowDown":
        if (heldKeys.has("h")) {
          // Move horizontal line down
          e.preventDefault();
          arrowUsedWithModifier = true;
          horizontalLine2Y = Math.min(1, horizontalLine2Y + 0.01);
        }
        break;
      case " ":
      case "Spacebar":
        e.preventDefault();
        revealUI();
        if (isPaused) {
          resumeTimer();
        } else {
          pauseTimer();
        }
        break;
      case "r":
      case "R":
        revealUI();
        resetCurrentTimer();
        break;
      case "f":
      case "F":
        e.preventDefault();
        revealUI();
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

  function handleKeyup(e: KeyboardEvent) {
    // Handle V/H toggle on keyup (only if arrows weren't used for movement)
    if ((e.key === "v" || e.key === "V") && !e.ctrlKey && !e.metaKey) {
      if (!arrowUsedWithModifier) {
        showVerticalLines = !showVerticalLines;
        if (showVerticalLines) showPlumbTool = true;
      }
      arrowUsedWithModifier = false;
    }
    if ((e.key === "h" || e.key === "H") && !e.ctrlKey && !e.metaKey) {
      if (!arrowUsedWithModifier) {
        showHorizontalLines = !showHorizontalLines;
        if (showHorizontalLines) showPlumbTool = true;
      }
      arrowUsedWithModifier = false;
    }

    // Remove key from held keys set
    heldKeys.delete(e.key.toLowerCase());
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

  // Sync plumbColor with current color preset
  $effect(() => {
    plumbColor = colorPresets[currentColorIndex].color;
  });

  // Calculate image bounds for grid overlay
  $effect(() => {
    // Track these dependencies
    currentIndex;
    practiceImages;
    imageElementRef;
    imageContainerRef;
    uiLocked;

    const updateImageBounds = () => {
      if (!imageElementRef || !imageContainerRef) {
        imageBounds = { left: 0, top: 0, width: 0, height: 0 };
        return;
      }

      const containerRect = imageContainerRef.getBoundingClientRect();
      const imgRect = imageElementRef.getBoundingClientRect();

      imageBounds = {
        left: imgRect.left - containerRect.left,
        top: imgRect.top - containerRect.top,
        width: imgRect.width,
        height: imgRect.height,
      };
    };

    // Update on dependencies change
    updateImageBounds();

    // Also update on window resize
    const handleResize = () => updateImageBounds();
    window.addEventListener("resize", handleResize);

    return () => window.removeEventListener("resize", handleResize);
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
    const entries: TimerEntry[] = [];
    const images: Image[] = [];
    let poseNumber = 1;

    // Generate images for each stage with its specific tags
    for (let stageIndex = 0; stageIndex < preset.stages.length; stageIndex++) {
      const stage = preset.stages[stageIndex];
      let stageImages: Image[];

      // Check if stage has specific tags
      if (stage.tagIds && stage.tagIds.length > 0) {
        // Use stage-specific tags
        stageImages = await getImagesByTags(stage.tagIds);
        if (stageImages.length === 0) {
          toast.warning(
            `No images found for stage ${stageIndex + 1} tags. Using all library images.`
          );
          stageImages = await getLibraryImages();
        }
      } else {
        // Use all library images
        stageImages = await getLibraryImages();
      }

      if (stageImages.length === 0) {
        toast.warning("No images in library. Please add images first.");
        return;
      }

      // Shuffle and select images for this stage
      const shuffled = [...stageImages].sort(() => Math.random() - 0.5);
      for (let i = 0; i < stage.imageCount; i++) {
        const imgIndex = i % shuffled.length; // Loop if needed
        entries.push({
          imageId: shuffled[imgIndex].id,
          duration: stage.duration,
          stageIndex,
          poseNumber,
        });
        images.push(shuffled[imgIndex]);
        poseNumber++;
      }
    }

    if (entries.length === 0) {
      toast.warning("Could not generate session. Please check your settings.");
      return;
    }

    practiceImages = images;
    timerEntries = entries;
    currentStageIndex = 0;
    setupMode = "choose";
    startPractice();
  }

  async function generateQuickSession() {
    if (quickConfig.stages.length === 0) {
      toast.warning("Please add at least one stage to your session.");
      return;
    }

    const entries: TimerEntry[] = [];
    const images: Image[] = [];
    let poseNumber = 1;

    // Generate images for each stage with its specific tags
    for (
      let stageIndex = 0;
      stageIndex < quickConfig.stages.length;
      stageIndex++
    ) {
      const stage = quickConfig.stages[stageIndex];
      let stageImages: Image[];

      // Use stage-specific tags if available, otherwise use global tags
      const tagsToUse =
        stage.tagIds && stage.tagIds.length > 0
          ? stage.tagIds
          : quickConfig.selectedTags.length > 0
            ? quickConfig.selectedTags
            : [];

      if (tagsToUse.length > 0) {
        stageImages = await getImagesByTags(tagsToUse);
      } else {
        stageImages = await getLibraryImages();
      }

      if (stageImages.length === 0) {
        toast.warning(
          `No images found for Stage ${stageIndex + 1}. Please adjust tag filters.`
        );
        return;
      }

      // Shuffle images for this stage
      const shuffled = [...stageImages].sort(() => Math.random() - 0.5);

      // Generate entries for this stage
      for (let i = 0; i < stage.imageCount; i++) {
        const imageIndex = i % shuffled.length; // Cycle through if needed
        entries.push({
          imageId: shuffled[imageIndex].id,
          duration: stage.duration,
          stageIndex,
          poseNumber,
        });
        images.push(shuffled[imageIndex]);
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
    quickConfig.stages.push({ imageCount: 10, duration: 60, tagIds: [] });
    quickConfig = { ...quickConfig };
  }

  function removeQuickStage(index: number) {
    quickConfig.stages.splice(index, 1);
    quickConfig = { ...quickConfig };
  }

  function toggleStageTag(stageIndex: number, tagId: string) {
    const stage = quickConfig.stages[stageIndex];
    if (!stage.tagIds) stage.tagIds = [];

    const index = stage.tagIds.indexOf(tagId);
    if (index >= 0) {
      stage.tagIds.splice(index, 1);
    } else {
      stage.tagIds.push(tagId);
      markTagAsRecent(tagId);
    }
    quickConfig = { ...quickConfig };
  }

  function saveCurrentSession() {
    if (quickConfig.stages.length === 0) {
      toast.warning("No stages to save. Add at least one stage first.");
      return;
    }

    const sessionName = prompt("Enter a name for this session:");
    if (!sessionName || !sessionName.trim()) return;

    const newSession: CustomSession = {
      id: Date.now().toString(),
      name: sessionName.trim(),
      stages: JSON.parse(JSON.stringify(quickConfig.stages)), // Deep copy
      createdAt: Date.now(),
    };

    customSessions.push(newSession);
    customSessions = [...customSessions];
    saveCustomSessions(customSessions);

    // Also add to classroom presets
    const newPreset = convertCustomSessionToPreset(newSession);
    classroomPresets.push(newPreset);
    classroomPresets = [...classroomPresets];
    saveClassroomPresets(classroomPresets);

    toast.success(`Session "${sessionName}" saved!`);
  }

  function loadCustomSession(session: CustomSession) {
    quickConfig.stages = JSON.parse(JSON.stringify(session.stages)); // Deep copy
    quickConfig = { ...quickConfig };
    toast.success(`Loaded session "${session.name}"`);
  }

  function loadPresetForEditing(preset: ClassroomPreset) {
    // Load preset stages into quick config for editing
    quickConfig.stages = JSON.parse(JSON.stringify(preset.stages)); // Deep copy
    quickConfig = { ...quickConfig };
    setupMode = "quick";
    toast.info(`Editing "${preset.name}" - make changes and save when done`);
  }

  function deleteCustomSession(sessionId: string) {
    const session = customSessions.find((s) => s.id === sessionId);
    if (!session) return;

    if (!confirm(`Delete session "${session.name}"?`)) return;

    customSessions = customSessions.filter((s) => s.id !== sessionId);
    saveCustomSessions(customSessions);

    // Also remove from classroom presets
    deleteClassroomPreset(sessionId);
  }

  function toggleQuickTag(tagId: string) {
    const index = quickConfig.selectedTags.indexOf(tagId);
    if (index >= 0) {
      quickConfig.selectedTags.splice(index, 1);
    } else {
      quickConfig.selectedTags.push(tagId);
      markTagAsRecent(tagId);
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
  onkeyup={handleKeyup}
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
          <div class="flex items-center justify-center gap-3 mb-3">
            <h1 class="text-4xl font-bold text-center text-base-content">
              Timer Mode
            </h1>
            <button
              class="btn btn-circle btn-ghost"
              onclick={() => (showHelpModal = true)}
              title="Show help and keyboard shortcuts"
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
                  d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </button>
          </div>
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
                    <p class="text-sm text-base-content/70">
                      {classroomPresets.length} preset{classroomPresets.length ===
                      1
                        ? ""
                        : "s"}
                    </p>
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
                  <div class="flex items-start justify-between gap-4">
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

                    <div class="flex gap-2">
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
                      <button
                        class="btn btn-outline"
                        onclick={() => loadPresetForEditing(preset)}
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
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                          />
                        </svg>
                        Edit
                      </button>
                      <button
                        class="btn btn-ghost btn-square"
                        onclick={() => deleteClassroomPreset(preset.id)}
                        aria-label="Delete preset"
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
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </div>
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
              <div class="flex items-center justify-between mb-3">
                <h3 class="card-title text-lg">
                  Filter Images by Tags (optional)
                </h3>
                {#if quickConfig.selectedTags.length > 0}
                  <button
                    class="btn btn-sm btn-ghost"
                    onclick={() => {
                      quickConfig.selectedTags = [];
                    }}
                  >
                    Clear all
                  </button>
                {/if}
              </div>
              <p class="text-sm text-base-content/70 mb-4">
                Select tags to filter which images appear in your session. Leave
                empty to use all library images.
              </p>

              <!-- Search Bar -->
              <div class="form-control mb-4">
                <div class="input-group">
                  <span class="bg-base-300">
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
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                  </span>
                  <input
                    type="text"
                    placeholder="Search tags..."
                    class="input input-bordered w-full"
                    bind:value={tagSearchQuery}
                  />
                  {#if tagSearchQuery}
                    <button
                      class="btn btn-square"
                      onclick={() => (tagSearchQuery = "")}
                      aria-label="Clear search"
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
                  {/if}
                </div>
              </div>

              <!-- Recent Tags -->
              {#if recentTags.length > 0 && !tagSearchQuery}
                <div class="mb-4">
                  <div class="flex items-center gap-2 mb-2">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="h-4 w-4 text-base-content/60"
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
                    <span class="text-sm font-semibold text-base-content/70"
                      >Recently Used</span
                    >
                  </div>
                  <div class="flex flex-wrap gap-1.5">
                    {#each recentTags as tag}
                      <button
                        class="btn btn-sm"
                        class:btn-primary={quickConfig.selectedTags.includes(
                          tag.id
                        )}
                        class:btn-ghost={!quickConfig.selectedTags.includes(
                          tag.id
                        )}
                        onclick={() => toggleQuickTag(tag.id)}
                      >
                        {tag.name}
                      </button>
                    {/each}
                  </div>
                </div>
                <div class="divider my-2"></div>
              {/if}

              <!-- Tags by Category or Filtered -->
              {#if tagSearchQuery}
                <!-- Search Results -->
                {#if filteredTags.length > 0}
                  <div class="flex flex-wrap gap-1.5 max-h-64 overflow-y-auto">
                    {#each filteredTags as tag}
                      <button
                        class="btn btn-sm"
                        class:btn-primary={quickConfig.selectedTags.includes(
                          tag.id
                        )}
                        class:btn-ghost={!quickConfig.selectedTags.includes(
                          tag.id
                        )}
                        onclick={() => toggleQuickTag(tag.id)}
                      >
                        {tag.name}
                        {#if tag.parentId}
                          <span class="text-xs opacity-60">
                            ({tag.parentId})
                          </span>
                        {/if}
                      </button>
                    {/each}
                  </div>
                {:else}
                  <div class="text-center py-8 text-base-content/50">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="h-12 w-12 mx-auto mb-2 opacity-50"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <p>No tags found matching "{tagSearchQuery}"</p>
                  </div>
                {/if}
              {:else}
                <!-- Categorized Tags -->
                <div class="space-y-2">
                  {#each tagsByCategory as category}
                    <details class="collapse collapse-arrow bg-base-300">
                      <summary
                        class="collapse-title text-sm font-medium min-h-0 py-3"
                      >
                        {category.name}
                        <span class="badge badge-sm ml-2"
                          >{category.tags.length}</span
                        >
                        {#if category.tags.some( (t) => quickConfig.selectedTags.includes(t.id) )}
                          <span class="badge badge-primary badge-sm ml-1">
                            {category.tags.filter((t) =>
                              quickConfig.selectedTags.includes(t.id)
                            ).length} selected
                          </span>
                        {/if}
                      </summary>
                      <div class="collapse-content">
                        <div class="flex flex-wrap gap-1.5 pt-2">
                          {#each category.tags as tag}
                            <button
                              class="btn btn-xs"
                              class:btn-primary={quickConfig.selectedTags.includes(
                                tag.id
                              )}
                              class:btn-ghost={!quickConfig.selectedTags.includes(
                                tag.id
                              )}
                              onclick={() => toggleQuickTag(tag.id)}
                            >
                              {tag.name}
                            </button>
                          {/each}
                        </div>
                      </div>
                    </details>
                  {/each}
                </div>
              {/if}
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
                    <div class="bg-base-300 p-4 rounded-lg space-y-3">
                      <div class="flex items-center gap-4">
                        <span class="font-semibold text-base-content"
                          >Stage {index + 1}</span
                        >

                        <div class="flex items-center gap-2">
                          <span class="text-sm text-base-content/70"
                            >Images:</span
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

                      <!-- Per-stage tag filtering -->
                      <details class="collapse collapse-arrow bg-base-200">
                        <summary
                          class="collapse-title text-sm min-h-0 py-2 px-3"
                        >
                          <div class="flex items-center gap-2">
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              class="h-4 w-4 text-primary"
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
                            <span class="text-base-content/70">
                              Stage-specific tags
                              {#if stage.tagIds && stage.tagIds.length > 0}
                                <span class="badge badge-primary badge-sm ml-2"
                                  >{stage.tagIds.length}</span
                                >
                              {:else}
                                <span class="text-xs opacity-60 ml-2"
                                  >(uses global tags)</span
                                >
                              {/if}
                            </span>
                          </div>
                          {#if stage.tagIds && stage.tagIds.length > 0}
                            <div class="flex flex-wrap gap-1 mt-1">
                              {#each stage.tagIds.slice(0, 3) as tagId}
                                {@const tag = allTags.find(
                                  (t) => t.id === tagId
                                )}
                                {#if tag}
                                  <span class="badge badge-xs badge-primary"
                                    >{tag.name}</span
                                  >
                                {/if}
                              {/each}
                              {#if stage.tagIds.length > 3}
                                <span class="badge badge-xs">
                                  +{stage.tagIds.length - 3} more
                                </span>
                              {/if}
                            </div>
                          {/if}
                        </summary>
                        <div class="collapse-content">
                          <div class="pt-2">
                            <p class="text-xs text-base-content/60 mb-2">
                              Select tags to filter images for this stage only.
                              Leave empty to use global tags.
                            </p>

                            <!-- Recent Tags for Stage -->
                            {#if recentTags.length > 0}
                              <div class="mb-3">
                                <p class="text-xs text-base-content/50 mb-1.5">
                                  Recent:
                                </p>
                                <div class="flex flex-wrap gap-1">
                                  {#each recentTags.slice(0, 8) as tag}
                                    <button
                                      class="btn btn-xs"
                                      class:btn-primary={stage.tagIds?.includes(
                                        tag.id
                                      )}
                                      class:btn-ghost={!stage.tagIds?.includes(
                                        tag.id
                                      )}
                                      onclick={() =>
                                        toggleStageTag(index, tag.id)}
                                    >
                                      {tag.name}
                                    </button>
                                  {/each}
                                </div>
                              </div>
                              <div class="divider my-2"></div>
                            {/if}

                            <!-- Categorized Tags for Stage -->
                            <div class="space-y-1 max-h-64 overflow-y-auto">
                              {#each tagsByCategory as category}
                                <details
                                  class="collapse collapse-arrow bg-base-300"
                                >
                                  <summary
                                    class="collapse-title text-xs min-h-0 py-1.5 px-2"
                                  >
                                    {category.name}
                                    {#if category.tags.some( (t) => stage.tagIds?.includes(t.id) )}
                                      <span
                                        class="badge badge-primary badge-xs ml-1"
                                      >
                                        {category.tags.filter((t) =>
                                          stage.tagIds?.includes(t.id)
                                        ).length}
                                      </span>
                                    {/if}
                                  </summary>
                                  <div class="collapse-content">
                                    <div class="flex flex-wrap gap-1 pt-1">
                                      {#each category.tags as tag}
                                        <button
                                          class="btn btn-xs"
                                          class:btn-primary={stage.tagIds?.includes(
                                            tag.id
                                          )}
                                          class:btn-ghost={!stage.tagIds?.includes(
                                            tag.id
                                          )}
                                          onclick={() =>
                                            toggleStageTag(index, tag.id)}
                                        >
                                          {tag.name}
                                        </button>
                                      {/each}
                                    </div>
                                  </div>
                                </details>
                              {/each}
                            </div>

                            {#if stage.tagIds && stage.tagIds.length > 0}
                              <button
                                class="btn btn-xs btn-ghost mt-2 w-full"
                                onclick={() => {
                                  stage.tagIds = [];
                                }}
                              >
                                Clear all stage tags
                              </button>
                            {/if}
                          </div>
                        </div>
                      </details>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          </div>

          <!-- Start Button -->
          <div class="flex justify-end gap-3">
            <button
              class="btn btn-outline"
              onclick={saveCurrentSession}
              disabled={quickConfig.stages.length === 0}
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
                  d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
                />
              </svg>
              Save Session
            </button>
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
              title="Alignment tools"
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
              class="dropdown-content z-[1] menu p-3 shadow bg-base-100 rounded-box w-72 max-h-[70vh] overflow-y-auto"
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
                    <span class="label-text">Random Angle Colors</span>
                    <input
                      type="checkbox"
                      bind:checked={randomColors}
                      class="checkbox checkbox-sm"
                    />
                  </label>
                </div>

                <div class="form-control">
                  <label class="label" for="color-preset-selector">
                    <span class="label-text"
                      >Line/Grid Color{randomColors
                        ? " (Plumb/Grid Only)"
                        : ""}</span
                    >
                  </label>
                  <select
                    id="color-preset-selector"
                    bind:value={currentColorIndex}
                    class="select select-bordered select-sm w-full"
                  >
                    {#each colorPresets as preset, index}
                      <option value={index}>
                        {preset.name} - {preset.color}
                      </option>
                    {/each}
                  </select>
                  <div class="mt-2 flex items-center gap-2">
                    <div
                      class="w-12 h-8 rounded border-2 border-base-content"
                      style="background-color: {plumbColor};"
                    ></div>
                    <span class="text-xs opacity-60">Press C to cycle</span>
                  </div>
                </div>

                <div class="form-control">
                  <label class="label cursor-pointer justify-start gap-2">
                    <input
                      type="checkbox"
                      bind:checked={lineOutline}
                      class="checkbox checkbox-sm"
                    />
                    <span class="label-text"
                      >Contrasting Outline (for visibility)</span
                    >
                  </label>
                </div>

                <div class="form-control">
                  <label class="label" for="line-opacity-slider">
                    <span class="label-text"
                      >Line Opacity: {(lineOpacity * 100).toFixed(0)}%</span
                    >
                  </label>
                  <input
                    id="line-opacity-slider"
                    type="range"
                    min="0.1"
                    max="1"
                    step="0.1"
                    bind:value={lineOpacity}
                    class="range range-sm"
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

                <div class="divider my-0"></div>
                <div class="text-xs font-bold opacity-60">GRID OVERLAY</div>

                <div class="form-control">
                  <label class="label" for="grid-size-select">
                    <span class="label-text">Grid Size (G)</span>
                  </label>
                  <select
                    id="grid-size-select"
                    class="select select-sm select-bordered w-full"
                    bind:value={gridMode}
                    disabled={gridLocked}
                  >
                    <option value={0}>Off</option>
                    <option value={1}>Fine (32×32)</option>
                    <option value={2}>Medium (16×16)</option>
                    <option value={3}>Coarse (8×8)</option>
                  </select>
                </div>

                <div class="form-control">
                  <label class="label cursor-pointer">
                    <span class="label-text">Show Diagonals (D)</span>
                    <input
                      type="checkbox"
                      bind:checked={showDiagonals}
                      disabled={gridMode === 0}
                      class="checkbox checkbox-sm"
                    />
                  </label>
                </div>

                <div class="form-control">
                  <label class="label" for="grid-line-width">
                    <span class="label-text">Line Width: {gridLineWidth}px</span
                    >
                  </label>
                  <input
                    id="grid-line-width"
                    type="range"
                    min="1"
                    max="5"
                    bind:value={gridLineWidth}
                    disabled={gridMode === 0}
                    class="range range-sm"
                  />
                  <div class="flex justify-between text-xs opacity-60 px-2">
                    <span>1</span>
                    <span>2</span>
                    <span>3</span>
                    <span>4</span>
                    <span>5</span>
                  </div>
                </div>

                <div class="form-control">
                  <label class="label cursor-pointer">
                    <span class="label-text">Lock Grid</span>
                    <input
                      type="checkbox"
                      bind:checked={gridLocked}
                      class="checkbox checkbox-sm"
                    />
                  </label>
                </div>

                <div class="text-xs opacity-60 mt-2">
                  <div><strong>V</strong> - Toggle vertical lines</div>
                  <div><strong>H</strong> - Toggle horizontal lines</div>
                  <div><strong>A</strong> - Toggle angle mode</div>
                  <div><strong>Alt+A</strong> - Clear all angles</div>
                  <div><strong>G</strong> - Cycle grid (off → 32 → 16 → 8)</div>
                  <div><strong>D</strong> - Toggle diagonals</div>
                  <div><strong>C</strong> - Cycle line/grid color</div>
                  <div><strong>+/-</strong> - Grid line width</div>
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
            bind:this={imageElementRef}
            src={convertFileSrc(currentImage.fullPath)}
            alt={currentImage.filename}
            class="max-w-full max-h-full object-contain"
            onload={() => {
              // Recalculate bounds when image loads
              if (imageElementRef && imageContainerRef) {
                const containerRect = imageContainerRef.getBoundingClientRect();
                const imgRect = imageElementRef.getBoundingClientRect();
                imageBounds = {
                  left: imgRect.left - containerRect.left,
                  top: imgRect.top - containerRect.top,
                  width: imgRect.width,
                  height: imgRect.height,
                };
              }
            }}
          />

          <!-- Plumb Line & Angle Overlay -->
          {#if showPlumbTool && imageContainerRef && imageBounds.width > 0 && imageBounds.height > 0}
            <svg
              class="absolute pointer-events-auto"
              style="z-index: 5; left: {imageBounds.left}px; top: {imageBounds.top}px; width: {imageBounds.width}px; height: {imageBounds.height}px;"
              onpointermove={handlePlumbPointerMove}
              onpointerdown={handlePlumbPointerDown}
              onpointerup={handlePlumbPointerUp}
            >
              <!-- Vertical Lines -->
              {#if showVerticalLines}
                {#if lineOutline}
                  <!-- Outline for center vertical line -->
                  <line
                    x1="50%"
                    y1="0"
                    x2="50%"
                    y2="100%"
                    stroke={getOutlineColor(plumbColor)}
                    stroke-width="5"
                    stroke-dasharray="10 5"
                    opacity={lineOpacity * 0.5}
                  />
                {/if}
                <!-- Center vertical line -->
                <line
                  x1="50%"
                  y1="0"
                  x2="50%"
                  y2="100%"
                  stroke={plumbColor}
                  stroke-width="2"
                  stroke-dasharray="10 5"
                  opacity={lineOpacity}
                />

                {#if lineOutline}
                  <!-- Outline for draggable vertical line -->
                  <line
                    x1="{verticalLine2X * 100}%"
                    y1="0"
                    x2="{verticalLine2X * 100}%"
                    y2="100%"
                    stroke={getOutlineColor(plumbColor)}
                    stroke-width="5"
                    opacity={lineOpacity * 0.5}
                    style="cursor: ew-resize;"
                    data-drag-target="vertical-line"
                  />
                {/if}
                <!-- Draggable vertical line -->
                <line
                  x1="{verticalLine2X * 100}%"
                  y1="0"
                  x2="{verticalLine2X * 100}%"
                  y2="100%"
                  stroke={plumbColor}
                  stroke-width="2"
                  opacity={lineOpacity}
                  style="cursor: ew-resize;"
                  data-drag-target="vertical-line"
                />

                <!-- Drag handle for vertical line -->
                {#if lineOutline}
                  <circle
                    cx="{verticalLine2X * 100}%"
                    cy="50%"
                    r="10"
                    fill={getOutlineColor(plumbColor)}
                    opacity={lineOpacity * 0.5}
                    style="cursor: ew-resize;"
                    data-drag-target="vertical-line"
                  />
                {/if}
                <circle
                  cx="{verticalLine2X * 100}%"
                  cy="50%"
                  r="8"
                  fill={plumbColor}
                  opacity={lineOpacity}
                  style="cursor: ew-resize;"
                  data-drag-target="vertical-line"
                />
              {/if}

              <!-- Horizontal Lines -->
              {#if showHorizontalLines}
                {#if lineOutline}
                  <!-- Outline for center horizontal line -->
                  <line
                    x1="0"
                    y1="50%"
                    x2="100%"
                    y2="50%"
                    stroke={getOutlineColor(plumbColor)}
                    stroke-width="5"
                    stroke-dasharray="10 5"
                    opacity={lineOpacity * 0.5}
                  />
                {/if}
                <!-- Center horizontal line -->
                <line
                  x1="0"
                  y1="50%"
                  x2="100%"
                  y2="50%"
                  stroke={plumbColor}
                  stroke-width="2"
                  stroke-dasharray="10 5"
                  opacity={lineOpacity}
                />

                {#if lineOutline}
                  <!-- Outline for draggable horizontal line -->
                  <line
                    x1="0"
                    y1="{horizontalLine2Y * 100}%"
                    x2="100%"
                    y2="{horizontalLine2Y * 100}%"
                    stroke={getOutlineColor(plumbColor)}
                    stroke-width="5"
                    opacity={lineOpacity * 0.5}
                    style="cursor: ns-resize;"
                    data-drag-target="horizontal-line"
                  />
                {/if}
                <!-- Draggable horizontal line -->
                <line
                  x1="0"
                  y1="{horizontalLine2Y * 100}%"
                  x2="100%"
                  y2="{horizontalLine2Y * 100}%"
                  stroke={plumbColor}
                  stroke-width="2"
                  opacity={lineOpacity}
                  style="cursor: ns-resize;"
                  data-drag-target="horizontal-line"
                />

                <!-- Drag handle for horizontal line -->
                {#if lineOutline}
                  <circle
                    cx="50%"
                    cy="{horizontalLine2Y * 100}%"
                    r="10"
                    fill={getOutlineColor(plumbColor)}
                    opacity={lineOpacity * 0.5}
                    style="cursor: ns-resize;"
                    data-drag-target="horizontal-line"
                  />
                {/if}
                <circle
                  cx="50%"
                  cy="{horizontalLine2Y * 100}%"
                  r="8"
                  fill={plumbColor}
                  opacity={lineOpacity}
                  style="cursor: ns-resize;"
                  data-drag-target="horizontal-line"
                />
              {/if}

              <!-- Angle Lines -->
              {#each angleLines as angleLine, i (angleLine.id)}
                {@const dx = angleLine.pointB.x - angleLine.pointA.x}
                {@const dy = angleLine.pointB.y - angleLine.pointA.y}
                {@const rawAngle =
                  ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360}
                {@const angle = rawAngle > 180 ? 360 - rawAngle : rawAngle}

                <!-- Line connecting points -->
                <line
                  x1="{angleLine.pointA.x * 100}%"
                  y1="{angleLine.pointA.y * 100}%"
                  x2="{angleLine.pointB.x * 100}%"
                  y2="{angleLine.pointB.y * 100}%"
                  stroke={angleLine.color}
                  stroke-width="3"
                  opacity="0.9"
                />

                <!-- Point A -->
                <circle
                  cx="{angleLine.pointA.x * 100}%"
                  cy="{angleLine.pointA.y * 100}%"
                  r="6"
                  fill={angleLine.color}
                  opacity="0.9"
                  style="cursor: move;"
                  data-drag-target="angle-point-a-{angleLine.id}"
                />
                <text
                  x="{angleLine.pointA.x * 100}%"
                  y="{angleLine.pointA.y * 100}%"
                  dx="10"
                  dy="-10"
                  fill={angleLine.color}
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
                  fill={angleLine.color}
                  opacity="0.9"
                  style="cursor: move;"
                  data-drag-target="angle-point-b-{angleLine.id}"
                />
                <text
                  x="{angleLine.pointB.x * 100}%"
                  y="{angleLine.pointB.y * 100}%"
                  dx="10"
                  dy="-10"
                  fill={angleLine.color}
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
                  fill={angleLine.color}
                  font-size="18"
                  font-weight="bold"
                  style="background: rgba(0,0,0,0.5); padding: 2px 4px;"
                >
                  {angle.toFixed(1)}°
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
                    fill={currentAngleLine.color}
                    opacity="0.9"
                  />
                  <text
                    x="{currentAngleLine.pointA.x * 100}%"
                    y="{currentAngleLine.pointA.y * 100}%"
                    dx="10"
                    dy="-10"
                    fill={currentAngleLine.color}
                    font-size="14"
                    font-weight="bold"
                  >
                    A
                  </text>
                {/if}
              {/if}
            </svg>
          {/if}

          <!-- Grid Overlay -->
          {#if gridMode > 0 && imageContainerRef && imageBounds.width > 0 && imageBounds.height > 0}
            {@const cellCount = gridSizes[gridMode as 1 | 2 | 3].cells}
            {@const cellSize =
              Math.max(imageBounds.width, imageBounds.height) / cellCount}
            <svg
              class="absolute pointer-events-none"
              style="z-index: 4; left: {imageBounds.left}px; top: {imageBounds.top}px; width: {imageBounds.width}px; height: {imageBounds.height}px;"
            >
              {#if lineOutline}
                <!-- Outline for vertical grid lines -->
                {#each Array(Math.ceil(imageBounds.width / cellSize)) as _, i}
                  {@const x = (i + 1) * cellSize}
                  {#if x < imageBounds.width}
                    <line
                      x1={x}
                      y1="0"
                      x2={x}
                      y2={imageBounds.height}
                      stroke={getOutlineColor(plumbColor)}
                      stroke-width={gridLineWidth + 2}
                      opacity={lineOpacity * 0.3}
                    />
                  {/if}
                {/each}
              {/if}

              <!-- Vertical grid lines -->
              {#each Array(Math.ceil(imageBounds.width / cellSize)) as _, i}
                {@const x = (i + 1) * cellSize}
                {#if x < imageBounds.width}
                  <line
                    x1={x}
                    y1="0"
                    x2={x}
                    y2={imageBounds.height}
                    stroke={plumbColor}
                    stroke-width={gridLineWidth}
                    opacity={lineOpacity * 0.6}
                  />
                {/if}
              {/each}

              {#if lineOutline}
                <!-- Outline for horizontal grid lines -->
                {#each Array(Math.ceil(imageBounds.height / cellSize)) as _, i}
                  {@const y = (i + 1) * cellSize}
                  {#if y < imageBounds.height}
                    <line
                      x1="0"
                      y1={y}
                      x2={imageBounds.width}
                      y2={y}
                      stroke={getOutlineColor(plumbColor)}
                      stroke-width={gridLineWidth + 2}
                      opacity={lineOpacity * 0.3}
                    />
                  {/if}
                {/each}
              {/if}

              <!-- Horizontal grid lines -->
              {#each Array(Math.ceil(imageBounds.height / cellSize)) as _, i}
                {@const y = (i + 1) * cellSize}
                {#if y < imageBounds.height}
                  <line
                    x1="0"
                    y1={y}
                    x2={imageBounds.width}
                    y2={y}
                    stroke={plumbColor}
                    stroke-width={gridLineWidth}
                    opacity={lineOpacity * 0.6}
                  />
                {/if}
              {/each}

              <!-- Diagonal lines -->
              {#if showDiagonals}
                {#if lineOutline}
                  <!-- Outline for top-left to bottom-right diagonal -->\n
                  <line
                    x1="0"
                    y1="0"
                    x2="100%"
                    y2="100%"
                    stroke={getOutlineColor(plumbColor)}
                    stroke-width={gridLineWidth + 2}
                    opacity={lineOpacity * 0.3}
                    stroke-dasharray="5 5"
                  />
                  <!-- Outline for top-right to bottom-left diagonal -->
                  <line
                    x1="100%"
                    y1="0"
                    x2="0"
                    y2="100%"
                    stroke={getOutlineColor(plumbColor)}
                    stroke-width={gridLineWidth + 2}
                    opacity={lineOpacity * 0.3}
                    stroke-dasharray="5 5"
                  />
                {/if}
                <!-- Top-left to bottom-right -->
                <line
                  x1="0"
                  y1="0"
                  x2="100%"
                  y2="100%"
                  stroke={plumbColor}
                  stroke-width={gridLineWidth}
                  opacity={lineOpacity * 0.7}
                  stroke-dasharray="5 5"
                />
                <!-- Top-right to bottom-left -->
                <line
                  x1="100%"
                  y1="0"
                  x2="0"
                  y2="100%"
                  stroke={plumbColor}
                  stroke-width={gridLineWidth}
                  opacity={lineOpacity * 0.7}
                  stroke-dasharray="5 5"
                />
              {/if}
            </svg>
          {/if}
        {/if}
      </div>

      <!-- Tool Status Indicators (Bottom Right Corner) -->
      {#if showPlumbTool || gridMode > 0}
        <div
          class="absolute z-20 flex flex-col gap-2 items-end pointer-events-none"
          class:bottom-[220px]={uiLocked}
          class:bottom-4={!uiLocked}
          class:right-4={true}
        >
          {#if showVerticalLines}
            <div
              class="badge badge-sm gap-1 bg-base-100/90 text-base-content border-base-300 shadow-lg"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-3 w-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="2"
              >
                <line
                  x1="12"
                  y1="0"
                  x2="12"
                  y2="24"
                  stroke="currentColor"
                  stroke-width="2"
                />
              </svg>
              Vertical
            </div>
          {/if}
          {#if showHorizontalLines}
            <div
              class="badge badge-sm gap-1 bg-base-100/90 text-base-content border-base-300 shadow-lg"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-3 w-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="2"
              >
                <line
                  x1="0"
                  y1="12"
                  x2="24"
                  y2="12"
                  stroke="currentColor"
                  stroke-width="2"
                />
              </svg>
              Horizontal
            </div>
          {/if}
          {#if angleMode}
            <div
              class="badge badge-sm gap-1 bg-base-100/90 text-base-content border-base-300 shadow-lg"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-3 w-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="2"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M3 21l7-7m0 0l7-7m-7 7V3m0 11h11"
                />
              </svg>
              Angle Mode
            </div>
          {/if}
          {#if angleLines.length > 0}
            <div
              class="badge badge-sm gap-1 bg-base-100/90 text-base-content border-base-300 shadow-lg"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-3 w-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="2"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"
                />
              </svg>
              {angleLines.length} Angle{angleLines.length === 1 ? "" : "s"}
            </div>
          {/if}

          <!-- Grid indicators -->
          {#if gridMode > 0}
            <div
              class="badge badge-sm gap-1 bg-base-100/90 text-base-content border-base-300 shadow-lg"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-3 w-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="2"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"
                />
              </svg>
              Grid: {gridSizes[gridMode as 1 | 2 | 3].label}
            </div>
          {/if}
          {#if showDiagonals && gridMode > 0}
            <div
              class="badge badge-sm gap-1 bg-base-100/90 text-base-content border-base-300 shadow-lg"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-3 w-3"
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
              Diagonals
            </div>
          {/if}
          {#if gridLocked && gridMode > 0}
            <div
              class="badge badge-sm gap-1 bg-warning/90 text-warning-content border-warning shadow-lg"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-3 w-3"
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
              Grid Locked
            </div>
          {/if}
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
          <span>L Lock UI</span>
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
                {#if setupMode === "quick" && quickConfig.stages.length > 0}
                  <button
                    class="btn btn-success btn-outline"
                    onclick={saveCurrentSession}
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
                        d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
                      />
                    </svg>
                    Save Session
                  </button>
                {/if}
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

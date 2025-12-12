/**
 * Timer page keyboard handler utilities.
 * Modularized keyboard event handling for angle mode, grid tools, navigation, and playback.
 * Provides reusable handlers that can be composed in Svelte components.
 * 
 * @module timerKeyboardHandlers
 */

/**
 * Context object containing all state and callbacks for keyboard handlers.
 * Passed to each handler function to enable stateless keyboard handling.
 */
export interface KeyboardHandlerContext {
  // Angle mode state
  angleMode: boolean;
  currentAngleLine: any;
  angleLines: any[];
  showPlumbTool: boolean;

  // Grid state
  gridMode: 0 | 1 | 2 | 3;
  gridLocked: boolean;
  gridLineWidth: number;
  showDiagonals: boolean;

  // Color state
  currentColorIndex: number;
  colorPresetsLength: number;

  // UI state
  showSetup: boolean;
  uiLocked: boolean;
  isFullscreen: boolean;
  isPaused: boolean;
  isMuted: boolean;
  autoPlayNextImage: boolean;

  // Line control state
  heldKeys: Set<string>;
  arrowUsedWithModifier: boolean;
  dragTarget: string | null;
  verticalLine2X: number;
  horizontalLine2Y: number;
  showVerticalLines: boolean;
  showHorizontalLines: boolean;

  // Callbacks for state updates
  onAngleModeChange: (newValue: boolean) => void;
  onCurrentAngleLineChange: (newValue: any) => void;
  onAngleLinesChange: (newValue: any[]) => void;
  onShowPlumbToolChange: (newValue: boolean) => void;
  onGridModeChange: (newValue: 0 | 1 | 2 | 3) => void;
  onShowDiagonalsChange: (newValue: boolean) => void;
  onGridLineWidthChange: (newValue: number) => void;
  onCurrentColorIndexChange: (newValue: number) => void;
  onUILockedChange: (newValue: boolean) => void;
  onShowVerticalLinesChange: (newValue: boolean) => void;
  onShowHorizontalLinesChange: (newValue: boolean) => void;
  onDragTargetChange: (newValue: string | null) => void;
  onVerticalLine2XChange: (newValue: number) => void;
  onHorizontalLine2YChange: (newValue: number) => void;
  onArrowUsedWithModifierChange: (newValue: boolean) => void;
  onAutoPlayNextImageChange?: (newValue: boolean) => void;
  onResumeTimer?: () => void;
  onPauseTimer?: () => void;
  onRevealUI?: () => void;
  onResetTimer?: () => void;
  onToggleFullscreen?: () => void;
  onExitPractice?: () => void;
}

/**
 * Handles angle mode keyboard controls.
 * Keys: V (vertical), H (horizontal), A (angle toggle), Alt+A (clear all), Delete/Backspace (remove), L (plumb line), Escape (exit)
 * 
 * @param e - The keyboard event
 * @param ctx - Keyboard handler context with state and callbacks
 * @returns true if key was handled, false otherwise
 * 
 * @example
 * ```typescript
 * function onKeyDown(e: KeyboardEvent) {
 *   if (handleAngleModeKeys(e, context)) return;
 *   // Handle other keys...
 * }
 * ```
 */
export function handleAngleModeKeys(
  e: KeyboardEvent,
  ctx: KeyboardHandlerContext
): boolean {
  if (ctx.showSetup) return false;

  // V key - vertical lines toggle (only prevent default, toggle on keyup)
  if (e.key === "v" || e.key === "V") {
    if (!e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      return true;
    }
  }

  // H key - horizontal lines toggle (only prevent default, toggle on keyup)
  if (e.key === "h" || e.key === "H") {
    if (!e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      return true;
    }
  }

  // A key - angle mode toggle or clear all angles with Alt+A
  if (e.key === "a" || e.key === "A") {
    if (e.altKey) {
      // Alt+A - Clear all angles
      e.preventDefault();
      ctx.onAngleLinesChange([]);
      ctx.onCurrentAngleLineChange(null);
      return true;
    }
    if (!e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      ctx.onAngleModeChange(!ctx.angleMode);
      if (!ctx.angleMode) {
        ctx.onShowPlumbToolChange(true);
      }
      return true;
    }
  }

  // Delete/Backspace - remove last angle or current in-progress angle
  if (e.key === "Delete" || e.key === "Backspace") {
    if (ctx.currentAngleLine) {
      e.preventDefault();
      ctx.onCurrentAngleLineChange(null);
      return true;
    }
    if (ctx.angleLines.length > 0) {
      e.preventDefault();
      ctx.onAngleLinesChange(ctx.angleLines.slice(0, -1));
      return true;
    }
  }

  // L key - toggle UI lock
  if (e.key === "l" || e.key === "L") {
    if (!e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      ctx.onUILockedChange(!ctx.uiLocked);
      return true;
    }
  }

  // Escape - exit angle mode
  if (e.key === "Escape") {
    if (ctx.angleMode) {
      e.preventDefault();
      ctx.onAngleModeChange(false);
      ctx.onCurrentAngleLineChange(null);
      return true;
    }
  }

  return false;
}

/**
 * Handles grid tool keyboard shortcuts.
 * Keys: G (cycle grid modes 0-3), D (toggle diagonals), C (cycle colors), +/= (increase width), - (decrease width)
 * 
 * @param e - The keyboard event
 * @param ctx - Keyboard handler context with state and callbacks
 * @returns true if key was handled, false otherwise
 * 
 * @example
 * ```typescript
 * function onKeyDown(e: KeyboardEvent) {
 *   if (handleGridToolKeys(e, context)) return;
 *   // Handle other keys...
 * }
 * ```
 */
export function handleGridToolKeys(
  e: KeyboardEvent,
  ctx: KeyboardHandlerContext
): boolean {
  if (ctx.showSetup) return false;

  // G key - cycle through grid modes: 0 -> 1 -> 2 -> 3 -> 0
  if (e.key === "g" || e.key === "G") {
    if (!e.ctrlKey && !e.metaKey && !ctx.gridLocked) {
      e.preventDefault();
      ctx.onGridModeChange(((ctx.gridMode + 1) % 4) as 0 | 1 | 2 | 3);
      return true;
    }
  }

  // D key - toggle diagonals (only if grid is active)
  if (e.key === "d" || e.key === "D") {
    if (!e.ctrlKey && !e.metaKey && ctx.gridMode > 0) {
      e.preventDefault();
      ctx.onShowDiagonalsChange(!ctx.showDiagonals);
      return true;
    }
  }

  // C key - cycle through color presets
  if (e.key === "c" || e.key === "C") {
    if (!e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      ctx.onCurrentColorIndexChange(
        (ctx.currentColorIndex + 1) % ctx.colorPresetsLength
      );
      return true;
    }
  }

  // = or + key - increase grid line width (only if grid is active)
  if (e.key === "=" || e.key === "+") {
    if (!e.ctrlKey && !e.metaKey && ctx.gridMode > 0) {
      e.preventDefault();
      ctx.onGridLineWidthChange(Math.min(5, ctx.gridLineWidth + 1));
      return true;
    }
  }

  // - key - decrease grid line width (only if grid is active)
  if (e.key === "-" || e.key === "_") {
    if (!e.ctrlKey && !e.metaKey && ctx.gridMode > 0) {
      e.preventDefault();
      ctx.onGridLineWidthChange(Math.max(1, ctx.gridLineWidth - 1));
      return true;
    }
  }

  return false;
}

/**
 * Handles arrow key navigation with modifiers for line movement.
 * When V/H keys are held, arrow keys move vertical/horizontal lines by 1% increments.
 * 
 * @param e - The keyboard event
 * @param ctx - Keyboard handler context with state and callbacks
 * @returns true if key was handled, false otherwise
 * 
 * @example
 * ```typescript
 * // Hold V, then press Left/Right to move vertical line
 * // Hold H, then press Up/Down to move horizontal line
 * function onKeyDown(e: KeyboardEvent) {
 *   if (handleNavigationKeys(e, context)) return;
 *   // Handle other keys...
 * }
 * ```
 */
export function handleNavigationKeys(
  e: KeyboardEvent,
  ctx: KeyboardHandlerContext
): boolean {
  if (ctx.showSetup) return false;

  switch (e.key) {
    case "ArrowLeft":
      if (ctx.heldKeys.has("v")) {
        // Move vertical line left
        e.preventDefault();
        ctx.onArrowUsedWithModifierChange(true);
        ctx.onDragTargetChange("vertical-line");
        ctx.onVerticalLine2XChange(
          Math.max(0, ctx.verticalLine2X - 0.01)
        );
        setTimeout(() => {
          ctx.onDragTargetChange(null);
        }, 100);
        return true;
      }
      return false;

    case "ArrowRight":
      if (ctx.heldKeys.has("v")) {
        // Move vertical line right
        e.preventDefault();
        ctx.onArrowUsedWithModifierChange(true);
        ctx.onDragTargetChange("vertical-line");
        ctx.onVerticalLine2XChange(
          Math.min(1, ctx.verticalLine2X + 0.01)
        );
        setTimeout(() => {
          ctx.onDragTargetChange(null);
        }, 100);
        return true;
      }
      return false;

    case "ArrowUp":
      if (ctx.heldKeys.has("h")) {
        // Move horizontal line up
        e.preventDefault();
        ctx.onArrowUsedWithModifierChange(true);
        ctx.onDragTargetChange("horizontal-line");
        ctx.onHorizontalLine2YChange(
          Math.max(0, ctx.horizontalLine2Y - 0.01)
        );
        setTimeout(() => {
          ctx.onDragTargetChange(null);
        }, 100);
        return true;
      }
      return false;

    case "ArrowDown":
      if (ctx.heldKeys.has("h")) {
        // Move horizontal line down
        e.preventDefault();
        ctx.onArrowUsedWithModifierChange(true);
        ctx.onDragTargetChange("horizontal-line");
        ctx.onHorizontalLine2YChange(
          Math.min(1, ctx.horizontalLine2Y + 0.01)
        );
        setTimeout(() => {
          ctx.onDragTargetChange(null);
        }, 100);
        return true;
      }
      return false;

    default:
      return false;
  }
}

/**
 * Handles playback control shortcuts.
 * Keys: Space (pause/resume), R (reset), F (fullscreen), M (mute), Escape (exit fullscreen/practice)
 * 
 * @param e - The keyboard event
 * @param ctx - Keyboard handler context with state and callbacks
 * @returns true if key was handled, false otherwise
 * 
 * @example
 * ```typescript
 * function onKeyDown(e: KeyboardEvent) {
 *   if (handlePlaybackKeys(e, context)) return;
 *   // Handle other keys...
 * }
 * ```
 */
export function handlePlaybackKeys(
  e: KeyboardEvent,
  ctx: KeyboardHandlerContext
): boolean {
  if (ctx.showSetup) return false;

  switch (e.key) {
    case " ":
    case "Spacebar":
      e.preventDefault();
      ctx.onRevealUI?.();
      if (ctx.isPaused) {
        ctx.onResumeTimer?.();
      } else {
        ctx.onPauseTimer?.();
      }
      return true;

    case "r":
    case "R":
      ctx.onRevealUI?.();
      ctx.onResetTimer?.();
      return true;

    case "f":
    case "F":
      e.preventDefault();
      ctx.onRevealUI?.();
      ctx.onToggleFullscreen?.();
      return true;

    case "m":
    case "M":
      e.preventDefault();
      ctx.onRevealUI?.();
      // Mute toggle handled separately
      return true;

    case "n":
    case "N":
      e.preventDefault();
      ctx.onRevealUI?.();
      ctx.onAutoPlayNextImageChange?.(
        !ctx.autoPlayNextImage
      );
      return true;

    case "Escape":
      if (ctx.isFullscreen) {
        ctx.onToggleFullscreen?.();
      } else {
        ctx.onExitPractice?.();
      }
      return true;

    default:
      return false;
  }
}

/**
 * Handles V/H key release logic for toggling line visibility.
 * Only toggles if arrows weren't used for movement (prevents accidental toggles).
 * Call this in keyup event handler.
 * 
 * @param e - The keyboard event
 * @param ctx - Keyboard handler context with state and callbacks
 * @param arrowUsedWithModifier - Whether arrow keys were used for line movement
 * @returns true if key was handled, false otherwise
 * 
 * @example
 * ```typescript
 * function onKeyUp(e: KeyboardEvent) {
 *   if (handleLineModifierKeyUp(e, context, arrowUsedWithModifier)) {
 *     setArrowUsedWithModifier(false);
 *     return;
 *   }
 * }
 * ```
 */
export function handleLineModifierKeyUp(
  e: KeyboardEvent,
  ctx: KeyboardHandlerContext,
  arrowUsedWithModifier: boolean
): boolean {
  // V key - vertical lines toggle on keyup (only if arrows weren't used for movement)
  if ((e.key === "v" || e.key === "V") && !e.ctrlKey && !e.metaKey) {
    if (!arrowUsedWithModifier) {
      ctx.onShowVerticalLinesChange(!ctx.showVerticalLines);
      if (!ctx.showVerticalLines) {
        ctx.onShowPlumbToolChange(true);
      }
    }
    return true;
  }

  // H key - horizontal lines toggle on keyup (only if arrows weren't used for movement)
  if ((e.key === "h" || e.key === "H") && !e.ctrlKey && !e.metaKey) {
    if (!arrowUsedWithModifier) {
      ctx.onShowHorizontalLinesChange(!ctx.showHorizontalLines);
      if (!ctx.showHorizontalLines) {
        ctx.onShowPlumbToolChange(true);
      }
    }
    return true;
  }

  return false;
}

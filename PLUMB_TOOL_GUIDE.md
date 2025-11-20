# Plumb Line & Angle Measurement Tool

## Overview

A professional desktop-only alignment and measurement overlay tool for the Timer/Practice Mode. Helps artists check vertical/horizontal alignment and measure angles directly on reference images during practice sessions.

## Features

### 1. **Vertical & Horizontal Plumb Lines**

- **Center reference lines**: Fixed vertical and horizontal lines at 50% (dashed)
- **Draggable guide lines**: Secondary vertical/horizontal lines that can be positioned anywhere
- **Visual handles**: Circular drag handles appear when lines are unlocked
- **Relative positioning**: Lines use percentage-based coordinates (0-1) for any image size

### 2. **Two-Point Angle Measurement**

- **Click to place points**: Click once for Point A, click again for Point B
- **Multiple angle lines**: Add as many measurement lines as needed
- **Triple angle display**: Shows degrees from vertical, horizontal, and absolute angle
- **Draggable points**: Move points A and B to adjust measurements
- **Visual labels**: Clear A/B labels on each point

### 3. **Teaching Mode**

- **CHECK ALIGNMENT**: Freezes display with prominent overlay for 15 seconds
- **Perfect for instruction**: Teacher can pause and point out alignment issues
- **Auto-dismisses**: Returns to practice after 15 seconds

### 4. **Customization**

- **Color picker**: Choose any color for overlay lines (default: red #FF0000)
- **Lock mode**: Prevent accidental line movement during measurement
- **Clear controls**: Remove individual or all angle measurements

## Keyboard Shortcuts

| Key            | Action                               |
| -------------- | ------------------------------------ |
| `V`            | Toggle vertical plumb lines on/off   |
| `H`            | Toggle horizontal plumb lines on/off |
| `A`            | Toggle angle measurement mode on/off |
| `Ctrl+L`       | Toggle all plumb tools on/off        |
| `Ctrl+Shift+L` | Lock/unlock tool editing             |
| `Ctrl+Shift+A` | Show "CHECK ALIGNMENT" overlay (15s) |
| `Delete`       | Remove last angle measurement        |
| `Backspace`    | Remove last angle measurement        |
| `Esc`          | Exit angle mode (when in angle mode) |

## UI Controls

### Tools Dropdown (Top Bar)

Located in the practice session top bar, next to the UI lock button:

1. **Vertical Lines (V)** - Checkbox to show/hide vertical plumb lines
2. **Horizontal Lines (H)** - Checkbox to show/hide horizontal plumb lines
3. **Angle Mode (A)** - Checkbox to enable angle measurement clicks
4. **Lock Tools** - Prevent dragging/editing (Ctrl+Shift+L)
5. **Line Color** - Color picker for all overlay elements
6. **Clear All Angles** - Remove all angle measurements at once
7. **CHECK ALIGNMENT** - Trigger 15-second freeze overlay
8. **Keyboard Reference** - Quick guide to all shortcuts

## Usage Guide

### Checking Vertical Alignment

1. Press `V` or check "Vertical Lines" in Tools menu
2. Drag the solid vertical line to align with subject's vertical reference
3. Compare with center dashed line (50%) for symmetry checks

### Checking Horizontal Alignment

1. Press `H` or check "Horizontal Lines" in Tools menu
2. Drag the solid horizontal line to align with subject's horizontal reference
3. Use center dashed line for level comparison

### Measuring Angles

1. Press `A` or check "Angle Mode" in Tools menu
2. Click on image to place Point A
3. Click again to place Point B (completes the angle line)
4. View three angle measurements displayed at midpoint:
   - **First number**: Degrees from vertical
   - **Second number**: Degrees from horizontal
   - **Third number**: Absolute angle
5. Drag points A or B to adjust measurement
6. Press `Delete` to remove last angle, or use "Clear All Angles" button

### Teaching with Alignment Check

1. Set up plumb lines or angle measurements
2. Press `Ctrl+Shift+A` or click "CHECK ALIGNMENT" button
3. Large red "CHECK ALIGNMENT" text appears with dark overlay
4. Timer automatically pauses
5. Overlay dismisses after 15 seconds

### Locking Tools

1. Position all lines and angles as desired
2. Press `Ctrl+Shift+L` or check "Lock Tools"
3. Lines become non-interactive (no more accidental drags)
4. Unlock to make adjustments

## Technical Details

### Architecture

- **SVG overlay**: Positioned absolutely over image container
- **Percentage coordinates**: All points stored as 0-1 values for scale independence
- **Pointer events**: Uses pointer API for unified mouse/touch handling
- **Reactive state**: Svelte 5 runes ensure instant UI updates

### State Variables

```typescript
showPlumbTool: boolean          // Master toggle
showVerticalLines: boolean      // Vertical plumb visibility
showHorizontalLines: boolean    // Horizontal plumb visibility
verticalLine2X: number          // X position (0-1) of draggable vertical
horizontalLine2Y: number        // Y position (0-1) of draggable horizontal
angleMode: boolean              // Enable angle click placement
currentAngleLine: AngleLine     // Angle being drawn
angleLines: AngleLine[]         // Completed angle measurements
plumbLocked: boolean            // Prevent editing
plumbColor: string              // Hex color for all lines
showAlignmentCheck: boolean     // 15s freeze overlay
```

### Angle Calculation

```typescript
// From vertical (0° = straight up/down)
angleFromVertical = |atan2(dx, -dy) * 180/π|

// From horizontal (0° = straight left/right)
angleFromHorizontal = |atan2(dy, dx) * 180/π|

// Absolute angle
absoluteAngle = |atan2(dy, dx) * 180/π|
```

## Desktop-Only Note

This feature is designed specifically for desktop use with precise mouse control. Tauri's desktop environment provides optimal performance for the SVG overlay rendering and pointer tracking.

## Integration with Practice Mode

- **Non-intrusive**: Only appears when activated via keyboard or UI
- **Auto-hide compatible**: Works seamlessly with UI auto-hide system
- **Fullscreen support**: Overlay scales correctly in fullscreen mode
- **UI lock support**: Respects UI lock positioning (top-[73px] bottom-[205px])
- **Z-index layer**: Sits above image (z-5), below drawing canvas

## Future Enhancements

- Snap-to-15° angle constraints (holding Shift)
- Preset angle lines (30°, 45°, 60°, 90°)
- Save/load common alignment setups
- Grid overlay option
- Ruler/measurement lines with pixel/unit display

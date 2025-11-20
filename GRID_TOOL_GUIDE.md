# Grid Overlay Tool

## Overview

A professional grid overlay system for checking proportions and alignments in reference images during practice sessions. Uses the industry-standard 8/16/32 cell divisions used by Watts Atelier, Proko, Marco Bucci, and professional figure-drawing classes.

## Features

### Grid Sizes

Three professional grid densities that cycle with the G key:

1. **Fine Grid (32×32)** - For precise measurements and detail work
2. **Medium Grid (16×16)** - Most commonly used for figure drawing
3. **Coarse Grid (8×8)** - Quick proportion checks and rule-of-thirds

### Diagonal Lines

Optional X-shaped diagonal lines from corner to corner:

- Activated with **D** key when grid is visible
- Useful for dynamic symmetry and compositional balance
- Dashed lines to distinguish from grid

### Grid Lock

Prevents accidental grid toggling:

- Toggle with checkbox in Tools menu
- When locked, G key is disabled
- Grid size can still be changed via dropdown

## Keyboard Shortcuts

| Key | Action                                      |
| --- | ------------------------------------------- |
| `G` | Cycle grid: Off → 32×32 → 16×16 → 8×8 → Off |
| `D` | Toggle diagonal lines (when grid active)    |

## Visual Design

- **Line width**: 1px for clean, non-intrusive overlay
- **Opacity**: 40% for grid lines, 50% for diagonals
- **Color**: Uses same color picker as plumb lines
- **Square cells**: Grid maintains perfect squares regardless of image aspect ratio
- **Z-index**: Sits below plumb lines (z-4) but above image

## UI Indicators

Status badges appear in bottom-right corner when grid is active:

- **Grid: 32×32 / 16×16 / 8×8** - Shows current grid size in primary blue
- **Diagonals** - Appears when diagonal lines are enabled
- **Grid Locked** - Warning badge when grid lock is active

## Usage Guide

### Basic Grid Usage

1. Press `G` to enable grid (starts at 32×32)
2. Press `G` again to cycle: 32×32 → 16×16 → 8×8 → Off
3. Use grid lines to check proportions and placement

### Using Diagonals

1. Enable any grid size with `G`
2. Press `D` to toggle diagonal lines
3. Use diagonals for:
   - Dynamic symmetry checks
   - Finding focal points
   - Compositional balance

### Locking the Grid

1. Open Tools dropdown in top bar
2. Check "Lock Grid" option
3. Grid size is now fixed
4. Uncheck to allow cycling with G key

### Changing Grid via Menu

1. Open Tools dropdown
2. Select desired grid size from "Grid Size" dropdown:
   - Off
   - Fine (32×32)
   - Medium (16×16)
   - Coarse (8×8)

## Professional Applications

### 32×32 Fine Grid

- Detailed anatomical measurements
- Precise feature placement (eyes, nose, mouth)
- Small detail alignment
- Character design work

### 16×16 Medium Grid

- Standard figure drawing sessions
- Full-body proportions (8 heads tall = 2 cells per head)
- General composition
- Most versatile for study

### 8×8 Coarse Grid

- Quick gesture proportion checks
- Rule of thirds composition (3 cells = 1/3)
- Large form blocking
- Speed sketching reference

### Diagonals

- Dynamic symmetry (Golden ratio divisions)
- Leading lines and eye flow
- Baroque diagonal composition
- Checking weight distribution in poses

## Integration

- **Non-intrusive**: Only appears when activated
- **Works with plumb lines**: Can be used simultaneously
- **Respects UI lock**: Adjusts position when UI is locked
- **Fullscreen compatible**: Grid scales correctly in fullscreen mode
- **Per-image reset**: Angle lines clear on image change, grid persists

## Technical Details

### Grid Calculation

```typescript
cellCount = 32 | 16 | 8
gridLinePosition = (cellIndex / cellCount) * 100%
```

### Cell Characteristics

- Perfect squares maintained via percentage-based positioning
- Grid stretches to fill entire image bounds
- Cells remain square even on portrait/landscape images
- Lines calculated dynamically based on container size

## Tips

- **Start coarse, refine fine**: Begin with 8×8 for big shapes, move to 32×32 for details
- **Use with plumb lines**: Combine grid with vertical/horizontal lines for maximum precision
- **Lock when set**: Lock grid once you've found the ideal size to avoid accidental changes
- **Diagonals for energy**: Add diagonals to check dynamic poses and movement

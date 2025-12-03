# Quick-Sketch Timer

A professional figure drawing practice application built with Tauri 2 + SvelteKit. Designed for artists who want structured timed practice sessions with their reference image library.

## Overview

Quick-Sketch Timer helps artists organize reference images, create custom practice sessions, and maintain focused drawing practice with built-in timers and professional classroom presets. Features a warm, minimalist art gallery aesthetic that stays out of your way while you work.

## Core Features

### 📚 Library Management

**Organize Your References**

- **Tag System** - Hierarchical categories and tags for flexible organization
  - Create categories (e.g., "Poses", "Anatomy", "Lighting")
  - Add tags within categories (e.g., "Standing", "Sitting", "Dynamic")
  - Bulk tag editor for efficient organization
  - Recent tags for quick access
- **Pack-Based Import** - Add entire folders of images as named packs
- **Smart Filtering** - Filter by categories, tags, and packs simultaneously
- **Search** - Find images by filename or metadata
- **Multiple Views**
  - Grid view with adjustable thumbnail sizes
  - Detailed list view with metadata
  - Full-screen image viewer with keyboard navigation
- **Selection System**
  - Multi-select with Ctrl+Click
  - Range select with Shift+Click
  - Right-click selection painting
  - Select mode toggle for easier batch selection
- **Bulk Operations**
  - Delete multiple images
  - Apply tags to selection
  - Export selections to Timer mode

### ⏱️ Timer Mode - Professional Practice Sessions

**Three Ways to Practice**

#### 1. Classroom Mode (6 Professional Presets)

Battle-tested session structures used by art schools:

- **Classic Warm-Up** (~30 min)

  - 12 poses × 30 seconds
  - 10 poses × 1 minute
  - 8 poses × 2 minutes
  - 6 poses × 5 minutes

- **Standard 1-Hour Class** (60-75 min)

  - 10 × 30s → 8 × 1m → 6 × 2m → 5 × 5m → 2 × 10m → 1 × 20m

- **Beginner Friendly** (~50 min)

  - Gentle progression: 10 × 1m → 8 × 2m → 6 × 5m → 2 × 10m

- **Gesture Bootcamp** (30 min)

  - Fast-paced: 20 × 30s → 15 × 1m → 10 × 2m

- **Long Pose Focus** (90 min)

  - 6 × 1m → 4 × 5m → 2 × 10m → 1 × 45m

- **Portrait & Features** (60 min)
  - 10 × 1m faces → 8 × 3m portraits → 10 × 2m hands/feet

#### 2. Quick Custom Session

Build your own practice on the fly:

- Select tags from your library (or use all images)
- Create multiple stages with custom durations
- Set image count per stage
- Save custom sessions as reusable presets

#### 3. Legacy Mode

Traditional workflow:

- Select images in Library tab
- Jump to Timer to set individual durations
- Perfect for curated practice sets

**During Practice**

- **Auto-Advance Timer** - Counts down and automatically moves to next pose
- **Audio Cues** - Chime between poses, victory fanfare on completion
- **Stage Thumbnails** - Visual progress through current stage
- **Keyboard Shortcuts**
  - `←` `→` - Navigate between poses
  - `Space` - Pause/Resume
  - `R` - Reset current timer
  - `F` - Toggle fullscreen
  - `M` - Mute/Unmute audio
  - `L` - Lock/Unlock UI auto-hide
  - `Esc` - Exit practice
- **Teacher Controls** - Extend current pose (+1/+5/+10 minutes)
- **UI Modes**
  - Immersive: Auto-hide controls after 2 seconds
  - Locked: Keep controls visible
  - Fullscreen: Use entire screen

**Drawing Tools (Optional)**

- **Plumb/Angle Tool** - Draw measurement lines on reference to analyze angles and proportions
- **Grid Lines** - Horizontal and vertical guide lines (drag to reposition, arrow keys for fine adjustment)

**After Completing a Session**

- **Continue Practice** - Instantly restart with identical settings
- **Modify & Restart** - Return to setup to change pack/duration
- **Done** - Back to Timer main menu

### 📦 Packs Tab - Bulk Image Management

**Browse and Add from Folders**

- **Folder Navigation** - Browse your file system with recent packs history
- **Breadcrumb Navigation** - Quick jumps to parent folders
- **Image Preview** - Grid and carousel views before importing
- **Batch Selection**
  - Left-click: View in carousel
  - Right-click or Right-drag: Paint selection/deselection
  - Ctrl+A: Toggle select all
  - Load 50 more or Load all buttons
- **Add to Library** - Confirm import with custom pack name and tags
- **Session State** - Folder, selections, and scroll position persist when switching tabs

### ⚙️ Settings

- **Mute Audio** - Toggle audio cues globally
- **Delete Confirmations** - Show/hide warnings for destructive actions
- **Theme** - Warm art gallery aesthetic with terracotta accents

## Design Philosophy

- **Warm, Minimal Aesthetic** - Cream, terracotta, and warm charcoal color palette
- **Unobtrusive** - Stay focused on your art, not the interface
- **Keyboard-First** - Everything accessible via keyboard
- **Offline-First** - All data stored locally in IndexedDB
- **Fast & Responsive** - Optimized image loading and rendering

## Technical Stack

- **Frontend** - SvelteKit 5 (Svelte Runes API)
- **Desktop** - Tauri 2
- **Styling** - TailwindCSS + DaisyUI
- **Storage** - IndexedDB for images and metadata
- **Icons** - Heroicons via inline SVG

## Development

### Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) with:

- [Svelte](https://marketplace.visualstudio.com/items?itemName=svelte.svelte-vscode)
- [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode)
- [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

### Running the App

```bash
# Install dependencies
npm install

# Run in development mode
npm run tauri dev

# Build for production
npm run tauri build
```

## Use Cases

- **Art Students** - Structured practice with classroom presets
- **Professional Artists** - Custom sessions targeting specific skills
- **Life Drawing Groups** - Share session presets and manage pose libraries
- **Solo Practice** - Disciplined timed practice without distractions
- **Anatomy Study** - Organize references by body parts/angles with tags
- **Portfolio Prep** - Quick pose references during sketching sessions

## License

[Add your license here]

## Contributing

[Add contribution guidelines here]

# DrawStack

Artist Reference Organizer - A Tauri 2 + SvelteKit desktop application for managing and practicing with reference image packs.

## Features

### Library Management
- **Image Library** - Browse your reference images in grid or list view
- **Pack Import** - Import entire image packs from local folders
- **Hierarchical Tags** - Create custom tag trees for organizing references
- **Tag Filtering** - Advanced multi-tag filtering with recently used tags
- **Search & Suggestions** - Smart search with tag suggestions
- **Selection System** - Right-click selection with visual feedback
- **Image Viewer** - Full-screen image viewing with navigation

### Timer Mode - Professional Practice Sessions

#### Classroom Mode (6 Built-in Presets)
Pre-configured professional sessions used by real art schools:
- **Classic Warm-Up** (~30 min) - 12×30s → 10×1m → 8×2m → 6×5m
- **Standard 1-Hour Class** (60-75 min) - Full progression from 30s warm-ups to 20m pieces
- **Beginner Friendly** (~50 min) - Gentle progression for new students
- **Gesture Bootcamp** (30 min) - Fast-paced 10s to 2m exercises
- **Long Pose Focus** (90 min) - Extended practice with 45m final piece
- **Portrait & Features** (60 min) - Face studies + hands/feet detail work

#### Quick Custom Session
Build your own practice sessions on the fly:
- Filter images by tags (any combination)
- Add multiple timed stages
- Set custom image counts and durations per stage
- Uses all library images if no tags selected

#### Practice Session Features
- **Auto-advance timer** with audio chimes between poses
- **Victory celebration** with fanfare and stats at session end
- **Stage-based thumbnails** - Only shows current stage images
- **Teacher controls** - Extend pose time (+1/+5/+10 minutes)
- **UI lock mode** - Keep controls visible with adjusted image sizing
- **Immersive mode** - Auto-hide UI with full-screen images
- **Fullscreen support** - Use entire screen resolution
- **Keyboard shortcuts** - ←→ navigate, Space pause/resume, R reset, F fullscreen, Esc exit
- **Progress tracking** - Shows pose number, stage description, and progress bar

### Storage & Performance
- **IndexedDB** - Fast, offline-first data persistence
- **Image thumbnails** - Quick loading and browsing
- **Tag usage tracking** - Recently used tags for faster filtering

### UI/UX
- **Dark theme** - Modern interface with TailwindCSS + daisyUI
- **Responsive design** - Adapts to different window sizes
- **Visual feedback** - Selection indicators, hover states, transitions
- **Accessibility** - Keyboard navigation, ARIA labels

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Svelte](https://marketplace.visualstudio.com/items?itemName=svelte.svelte-vscode) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer).

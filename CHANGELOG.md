# DrawStack Changelog

## [1.1.0] - 2026-01-31

### Added

- **Grayscale Mode (K)** - Toggle image to grayscale to focus on values and form without color distraction
- **Flip/Mirror Controls**
  - **X key** - Flip image horizontally (persists across image changes)
  - **Y key** - Flip image vertically (persists across image changes)
- **Zoom & Pan Features**
  - **Ctrl+Scroll** - Zoom in/out (50%-300% range)
  - **Middle-Click-Drag** - Pan around zoomed image
  - **0 key** - Reset zoom and pan to defaults
  - Zoom slider in Tools dropdown with percentage display
  - "Reset View" button for quick reset
- **Line Opacity Control**
  - **[ / ] keys** - Adjust grid and V/H line opacity (10% increments)
  - Existing opacity slider now has keyboard shortcuts for quick adjustments

### Improved

- **Grid and Reference Line Tracking** - Grid overlay and V/H plumb lines now follow image transforms (zoom, flip, pan) perfectly
  - Lines stay locked to image during all transformations
  - No more floating or misaligned overlays
- Enhanced Tools dropdown with new "IMAGE TOOLS" section
- Status indicators in corner show active transforms (Flipped H/V, Zoom level, Grayscale)
- Updated help/keyboard shortcuts with all new controls

### Technical

- Implemented CSS transforms on image and overlays for smooth, GPU-accelerated transformations
- Added pointer capture for smooth middle-button panning
- Transform state resets on image navigation (zoom/pan only; flips persist)
- Pan boundaries clamped to prevent image disappearing completely

---

## [1.0.9] - 2026-01-05

### Fixed

- **Custom Pack Names** - Fixed critical issue where custom pack names entered in the "Add to Library" dialog were not being saved to the database. Custom names now properly persist and display in the library's Active Tags.
- Pack name updates now sync in real-time to the database when the user edits the name in the dialog

### Improved

- Enhanced pack management workflow with better tag persistence
- Real-time database synchronization for pack name changes

### Technical

- Refactored tag update logic to use `updateTag()` instead of `addTag()` when modifying existing tags
- Added reactive effects to persist pack name changes immediately to IndexedDB

---

## [1.0.8] - 2025-12-12

### Added

- Auto-updater system with improved UX and visual feedback
- Better error handling for update notifications

### Improved

- Enhanced visual feedback during application updates
- Improved notification system for release updates

---

## [1.0.7] - 2025-12-01

### Added

- Tag usage statistics and sorting
- Recent tags quick access feature

### Fixed

- Tag filtering improvements
- Better handling of hierarchical tag relationships

---

## [1.0.6] - 2025-11-15

### Added

- Bulk tagging system for efficient organization
- Tag Categories (Gender, Pose, etc.)
- Customizable tag hierarchy

### Improved

- Tag selection UI in the "Add to Library" dialog
- Performance optimizations for large tag sets

---

## [1.0.5] - 2025-11-01

### Added

- Right-click selection painting for images
- Multi-select improvements
- Range selection with Shift+Click

### Fixed

- Selection state persistence across tab switches
- Image grid scrolling improvements

---

## [1.0.4] - 2025-10-15

### Added

- Pack history with recent packs sidebar
- Breadcrumb navigation for folder structure
- Session state persistence

### Improved

- Folder navigation UX
- Better handling of large image collections

---

## [1.0.3] - 2025-10-01

### Added

- Full-screen image viewer with keyboard navigation
- Image carousel for quick previews
- Keyboard shortcuts for timer controls

### Fixed

- Timer auto-advance reliability
- Audio cue timing improvements

---

## [1.0.2] - 2025-09-15

### Added

- Grid and list view options
- Adjustable thumbnail sizes
- Image search functionality

### Improved

- Library loading performance
- Search speed and accuracy

---

## [1.0.1] - 2025-09-01

### Added

- Settings panel with audio toggle
- Confirmation dialog settings
- Theme preferences

### Fixed

- Audio playback on different systems
- Settings persistence

---

## [1.0.0] - 2025-08-15

### Initial Release

- Complete library management system
  - Tag-based organization with hierarchical categories
  - Pack-based bulk import from folders
  - Smart filtering and search
- Timer mode with 6 professional classroom presets
  - Classic Warm-Up (~30 min)
  - Standard 1-Hour Class (60-75 min)
  - Beginner Friendly (~50 min)
  - Gesture Bootcamp (30 min)
  - Long Pose Focus (90 min)
  - Portrait & Features (60 min)
- Custom session creation and saving
- Legacy mode for individual image selection
- Professional practice features
  - Auto-advance timer with countdown
  - Audio cues between poses
  - Teacher controls for extending poses
  - Keyboard shortcuts for all major functions
  - Multiple UI modes (Immersive, Locked, Fullscreen)
- Drawing tools
  - Plumb/Angle measurement tool
  - Grid lines with repositioning
- Packs tab for folder browsing and bulk import
- Settings and preferences
- Offline-first design with IndexedDB storage
- Warm, minimalist art gallery aesthetic
- Full keyboard navigation support

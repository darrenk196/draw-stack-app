/**
 * Application-wide constants for Draw Stack
 * Centralized configuration and default values
 */

// ========== LocalStorage Keys ==========
export const STORAGE_KEYS = {
  // Library page
  CUSTOM_CATEGORIES: 'customCategories',
  TAG_CATEGORIES: 'tagCategories',
  HIDDEN_CATEGORIES: 'hiddenCategories',
  PAGINATION: 'library-items-per-page',
  SORT_ORDER: 'library-sort-order',
  DELETE_WARNING: 'library-skip-delete-warning',
  TAG_DELETE_WARNING: 'library-skip-tag-delete-warning',
} as const;

// ========== Pagination Settings ==========
export const PAGINATION = {
  DEFAULT_ITEMS_PER_PAGE: 50,
  PROGRESSIVE_THRESHOLD: 100, // Start progressive rendering above this count
  CHUNK_SIZE: 100, // Load this many images per chunk
  OPTIONS: [
    { value: 10, label: '10' },
    { value: 20, label: '20' },
    { value: 50, label: '50' },
    { value: 100, label: '100' },
    { value: 'all' as const, label: 'All' },
  ],
} as const;

// ========== Tag System ==========
export const TAG_SYSTEM = {
  MAX_RECENT_TAGS: 10,
} as const;

// ========== Default Tag Categories ==========
export const DEFAULT_TAG_CATEGORIES: Array<{ name: string; tags: string[] }> = [
  {
    name: 'Gender',
    tags: ['Male', 'Female'],
  },
  {
    name: 'Pose',
    tags: [
      'Standing',
      'Sitting',
      'Walking',
      'Running',
      'Lying',
      'Kneeling',
      'Action',
      'Crouching',
      'Jumping',
    ],
  },
  {
    name: 'View Angle',
    tags: [
      'Front View',
      'Side View',
      'Back View',
      '3/4 View',
      'Top View',
      'Bottom View',
    ],
  },
  {
    name: 'Art Style',
    tags: ['Realistic', 'Anime', 'Cartoon', 'Abstract', 'Sketch'],
  },
  {
    name: 'Character Type',
    tags: ['Human', 'Animal', 'Fantasy', 'Robot', 'Monster'],
  },
  {
    name: 'Clothing',
    tags: [
      'Casual',
      'Formal',
      'Athletic',
      'Swimwear',
      'Armor',
      'Robes',
      'Uniform',
      'Traditional',
    ],
  },
  {
    name: 'Body Parts',
    tags: [
      'Hands',
      'Feet',
      'Face',
      'Torso',
      'Arms',
      'Legs',
      'Head',
      'Full Body',
    ],
  },
  {
    name: 'Lighting',
    tags: [
      'Bright',
      'Dark',
      'Backlit',
      'Natural',
      'Dramatic',
      'Soft',
      'Studio',
    ],
  },
  {
    name: 'Environment',
    tags: [
      'Indoor',
      'Outdoor',
      'Nature',
      'Urban',
      'Studio',
      'Fantasy Setting',
      'Abstract BG',
    ],
  },
] as const;

// ========== UI Constants ==========
export const UI = {
  DEBOUNCE_MS: 150,
  GRID_COLUMNS: {
    LIBRARY: 8,
    PACKS: 6,
  },
} as const;

// ========== Application Info ==========
export const APP = {
  VERSION: '0.1.2-beta',
  NAME: 'Draw Stack',
} as const;

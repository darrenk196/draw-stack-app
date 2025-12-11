/**
 * IndexedDB database layer for Draw Stack application.
 * Manages packs, images, tags, and their relationships using IndexedDB.
 * Provides CRUD operations and specialized queries for the app.
 * 
 * Database schema:
 * - packs: Image pack metadata
 * - images: Image records with pack/library associations
 * - tags: Hierarchical tag structure
 * - imageTags: Many-to-many image-tag relationships
 * - tagUsage: Tag usage statistics
 * 
 * @module db
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

/**
 * Image pack representing a folder of imported images.
 */
export interface Pack {
  id: string;
  name: string;
  source: string;
  imageCount: number;
  importedAt: number;
  folderPath: string;
  isExpanded?: boolean;
}

/**
 * Image record with pack and library associations.
 * Images can belong to a pack, be in the library, or both.
 */
export interface Image {
  /** Unique image identifier */
  id: string;
  /** Pack ID if image belongs to a pack, null for library-only images */
  packId: string | null;
  /** Image filename */
  filename: string;
  /** Original file path before import */
  originalPath: string;
  /** Path to thumbnail image */
  thumbnailPath: string;
  /** Full path to image file */
  fullPath: string;
  /** Whether image is in the user's library */
  isInLibrary: boolean;
  /** Timestamp when added to library (null if not in library) */
  addedToLibraryAt: number | null;
}

/**
 * Hierarchical tag for organizing images.
 * Tags can have parent tags to form a category tree.
 */
export interface Tag {
  /** Unique tag identifier */
  id: string;
  /** Tag display name */
  name: string;
  /** Parent tag ID for hierarchical organization, null for top-level tags */
  parentId: string | null;
  /** Timestamp when tag was created */
  createdAt: number;
}

/**
 * Many-to-many relationship between images and tags.
 */
export interface ImageTag {
  /** Image ID */
  imageId: string;
  /** Tag ID */
  tagId: string;
}

/**
 * Tag usage statistics for sorting tags by frequency.
 */
export interface TagUsage {
  /** Tag ID */
  tagId: string;
  /** Last time tag was used (timestamp) */
  lastUsed: number;
  /** Number of times tag has been used */
  usageCount: number;
}

/**
 * Application settings key-value pair.
 */
export interface AppSetting {
  /** Setting key */
  key: string;
  /** Setting value (JSON stringified) */
  value: string;
}

/**
 * Type-safe application settings object.
 */
export interface AppSettings {
  /** Default timer duration in seconds */
  defaultTimerDuration: number;
  /** Auto-play next image when timer ends */
  autoPlayNextImage: boolean;
  /** Maximum number of search results to display */
  searchResultLimit: number;
  /** Confirmation dialog strictness level */
  confirmationDialogStrictness: 'always' | 'normal' | 'minimal';
}

/**
 * Default application settings.
 */
export const DEFAULT_SETTINGS: AppSettings = {
  defaultTimerDuration: 60, // 1 minute
  autoPlayNextImage: false,
  searchResultLimit: 100,
  confirmationDialogStrictness: 'normal',
};

interface DrawStackDB extends DBSchema {
  packs: {
    key: string;
    value: Pack;
    indexes: {
      'by-imported': number;
    };
  };
  images: {
    key: string;
    value: Image;
    indexes: {
      'by-pack': string;
      'by-library': number;
    };
  };
  tags: {
    key: string;
    value: Tag;
    indexes: {
      'by-parent': string;
      'by-name': string;
    };
  };
  imageTags: {
    key: [string, string];
    value: ImageTag;
    indexes: {
      'by-image': string;
      'by-tag': string;
    };
  };
  tagUsage: {
    key: string;
    value: TagUsage;
    indexes: {
      'by-last-used': number;
    };
  };
  settings: {
    key: string;
    value: AppSetting;
  };
}

const DB_NAME = 'drawstack-db';
const DB_VERSION = 4;

let dbInstance: IDBPDatabase<DrawStackDB> | null = null;
let dbPromise: Promise<IDBPDatabase<DrawStackDB>> | null = null;

export async function getDB(): Promise<IDBPDatabase<DrawStackDB>> {
  // Return cached instance immediately
  if (dbInstance) return dbInstance;

  // If connection is in progress, wait for it
  if (dbPromise) return dbPromise;

  // Start new connection
  dbPromise = openDB<DrawStackDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, newVersion, transaction) {
      console.log(`Database upgrade: ${oldVersion} -> ${newVersion}`);
      // Version 1: Create initial stores
      if (oldVersion < 1) {
        // Packs store
        const packsStore = db.createObjectStore('packs', { keyPath: 'id' });
        packsStore.createIndex('by-imported', 'importedAt');

        // Images store
        const imagesStore = db.createObjectStore('images', { keyPath: 'id' });
        imagesStore.createIndex('by-pack', 'packId');
        imagesStore.createIndex('by-library', 'addedToLibraryAt');

        // Tags store
        const tagsStore = db.createObjectStore('tags', { keyPath: 'id' });
        tagsStore.createIndex('by-parent', 'parentId');
        tagsStore.createIndex('by-name', 'name');

        // ImageTags junction store
        const imageTagsStore = db.createObjectStore('imageTags', { keyPath: ['imageId', 'tagId'] });
        imageTagsStore.createIndex('by-image', 'imageId');
        imageTagsStore.createIndex('by-tag', 'tagId');
      }

      // Version 2: Add TagUsage store
      if (oldVersion < 2) {
        const tagUsageStore = db.createObjectStore('tagUsage', { keyPath: 'tagId' });
        tagUsageStore.createIndex('by-last-used', 'lastUsed');
      }

      // Version 3: Recreate by-library index to use addedToLibraryAt
      if (oldVersion < 3) {
        const imagesStore = transaction.objectStore('images');
        // Delete old index if it exists
        if (imagesStore.indexNames.contains('by-library')) {
          imagesStore.deleteIndex('by-library');
        }
        // Create new index on addedToLibraryAt
        imagesStore.createIndex('by-library', 'addedToLibraryAt');
      }
      
      // Version 4: Add settings store for user preferences
      if (oldVersion < 4) {
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      }
    },
  });

  dbInstance = await dbPromise;
  dbPromise = null;
  return dbInstance;
}

// ============= Pack Operations =============

export async function addPack(pack: Pack): Promise<void> {
  const db = await getDB();
  await db.add('packs', pack);
}

export async function getAllPacks(): Promise<Pack[]> {
  const db = await getDB();
  return db.getAll('packs');
}

export async function getPack(id: string): Promise<Pack | undefined> {
  const db = await getDB();
  return db.get('packs', id);
}

export async function updatePack(pack: Pack): Promise<void> {
  const db = await getDB();
  await db.put('packs', pack);
}

export async function deletePack(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('packs', id);
}

// ============= Image Operations =============

export async function addImage(image: Image): Promise<void> {
  const db = await getDB();
  await db.add('images', image);
}

export interface TransactionResult {
  success: number;
  failed: number;
  duplicates: number;
  errors: Array<{ itemId: string; error: string }>;
}

export async function addImages(images: Image[]): Promise<TransactionResult> {
  const result: TransactionResult = {
    success: 0,
    failed: 0,
    duplicates: 0,
    errors: [],
  };

  try {
    const db = await getDB();
    const tx = db.transaction('images', 'readwrite');
    
    console.log('addImages: Starting transaction for', images.length, 'images');
    
    // Process each image with proper error handling
    const promises = images.map(img => 
      tx.store.add(img)
        .then(() => {
          result.success++;
          console.log('addImages: Successfully added image:', img.id);
        })
        .catch((err: any) => {
          if (err.name === 'ConstraintError') {
            result.duplicates++;
            console.warn('Duplicate image skipped:', img.id);
          } else {
            result.failed++;
            const errorMsg = err instanceof Error ? err.message : String(err);
            result.errors.push({ itemId: img.id, error: errorMsg });
            console.error('Error adding image:', img.id, err);
          }
        })
    );

    // Wait for all operations and transaction to complete
    await Promise.all([...promises, tx.done]);
    
    console.log(`addImages: Transaction completed - Success: ${result.success}, Failed: ${result.failed}, Duplicates: ${result.duplicates}`);
    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('addImages: Transaction failed:', error);
    result.errors.push({ itemId: 'batch', error: errorMsg });
    throw new Error(`Transaction failed: ${errorMsg}`);
  }
}

export async function getImage(id: string): Promise<Image | undefined> {
  const db = await getDB();
  return db.get('images', id);
}

export async function getImagesByPack(packId: string): Promise<Image[]> {
  const db = await getDB();
  return db.getAllFromIndex('images', 'by-pack', packId);
}

export async function getLibraryImages(): Promise<Image[]> {
  const db = await getDB();
  console.log('getLibraryImages: Querying database...');
  // Get all images and filter by isInLibrary (simpler and more reliable)
  const allImages = await db.getAll('images');
  console.log('getLibraryImages: Total images in DB:', allImages.length);
  const libraryImages = allImages.filter(img => img.isInLibrary === true);
  console.log('getLibraryImages: Library images found:', libraryImages.length);
  console.log('getLibraryImages: Sample images:', libraryImages.slice(0, 3));
  return libraryImages;
}

export async function updateImage(image: Image): Promise<void> {
  const db = await getDB();
  await db.put('images', image);
}

export async function updateImages(images: Image[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('images', 'readwrite');
  await Promise.all([
    ...images.map(img => tx.store.put(img)),
    tx.done
  ]);
}

export async function deleteImage(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('images', id);
}

// Bulk delete images and their tag associations (and decrement usage counts)
export async function deleteImages(imageIds: string[]): Promise<TransactionResult> {
  const result: TransactionResult = {
    success: 0,
    failed: 0,
    duplicates: 0,
    errors: [],
  };

  try {
    const db = await getDB();
    const tx = db.transaction(['images', 'imageTags', 'tagUsage'], 'readwrite');
    const imagesStore = tx.objectStore('images');
    const imageTagsStore = tx.objectStore('imageTags');
    const tagUsageStore = tx.objectStore('tagUsage');

    for (const imageId of imageIds) {
      try {
        // Get all tag associations for this image
        const associatedTags: ImageTag[] = await imageTagsStore.index('by-image').getAll(imageId);
        for (const it of associatedTags) {
          try {
            // Remove image-tag association
            await imageTagsStore.delete([it.imageId, it.tagId]);
            // Decrement usage count if present
            const usage = await tagUsageStore.get(it.tagId);
            if (usage) {
              const newCount = Math.max(usage.usageCount - 1, 0);
              if (newCount === 0) {
                await tagUsageStore.delete(it.tagId);
              } else {
                await tagUsageStore.put({ tagId: it.tagId, lastUsed: usage.lastUsed, usageCount: newCount });
              }
            }
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.warn(`Failed to update tag usage for ${it.tagId}:`, err);
            result.errors.push({ itemId: it.tagId, error: `Tag usage update: ${errorMsg}` });
          }
        }
        // Delete the image itself
        await imagesStore.delete(imageId);
        result.success++;
        console.log('Deleted image:', imageId);
      } catch (err) {
        result.failed++;
        const errorMsg = err instanceof Error ? err.message : String(err);
        result.errors.push({ itemId: imageId, error: errorMsg });
        console.error('Error deleting image:', imageId, err);
      }
    }

    await tx.done;
    console.log(`Deleted images: Success: ${result.success}, Failed: ${result.failed}`);
    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('deleteImages: Transaction failed:', error);
    result.errors.push({ itemId: 'batch', error: errorMsg });
    throw new Error(`Delete transaction failed: ${errorMsg}`);
  }
}

// ============= Tag Operations =============

export async function addTag(tag: Tag): Promise<void> {
  const db = await getDB();
  await db.add('tags', tag);
}

export async function getAllTags(): Promise<Tag[]> {
  const db = await getDB();
  return db.getAll('tags');
}

export async function getTag(id: string): Promise<Tag | undefined> {
  const db = await getDB();
  return db.get('tags', id);
}

export async function getChildTags(parentId: string | null): Promise<Tag[]> {
  const db = await getDB();
  return db.getAllFromIndex('tags', 'by-parent', parentId ?? '');
}

export async function updateTag(tag: Tag): Promise<void> {
  const db = await getDB();
  await db.put('tags', tag);
}

export async function deleteTag(id: string): Promise<void> {
  const db = await getDB();
  
  // Delete all child tags recursively
  const childTags = await getChildTags(id);
  for (const child of childTags) {
    await deleteTag(child.id);
  }
  
  // Delete all image associations
  const imageTags = await getImageTagsByTag(id);
  for (const it of imageTags) {
    await removeImageTag(it.imageId, it.tagId);
  }
  
  // Delete tag usage tracking
  await db.delete('tagUsage', id).catch(() => {});
  
  await db.delete('tags', id);
}

export async function deleteTagsByCategory(categoryName: string): Promise<void> {
  const db = await getDB();
  const allTags = await getAllTags();
  const tagsToDelete = allTags.filter(tag => tag.parentId === categoryName);
  
  // Delete each tag (this will also remove image associations)
  for (const tag of tagsToDelete) {
    await deleteTag(tag.id);
  }
}

// ============= ImageTag Operations =============

export async function addImageTag(imageId: string, tagId: string): Promise<void> {
  const db = await getDB();
  // Use put() instead of add() to avoid ConstraintError if the tag already exists
  await db.put('imageTags', { imageId, tagId });
}

export async function addImageTags(imageId: string, tagIds: string[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('imageTags', 'readwrite');
  await Promise.all([
    // Use put() instead of add() to avoid ConstraintError if tags already exist
    ...tagIds.map(tagId => tx.store.put({ imageId, tagId })),
    tx.done
  ]);
}

export async function removeImageTag(imageId: string, tagId: string): Promise<void> {
  const db = await getDB();
  await db.delete('imageTags', [imageId, tagId]);
}

export async function getImageTagsByImage(imageId: string): Promise<ImageTag[]> {
  const db = await getDB();
  return db.getAllFromIndex('imageTags', 'by-image', imageId);
}

export async function getImageTagsByTag(tagId: string): Promise<ImageTag[]> {
  const db = await getDB();
  return db.getAllFromIndex('imageTags', 'by-tag', tagId);
}

export async function getTagsForImage(imageId: string): Promise<Tag[]> {
  const imageTags = await getImageTagsByImage(imageId);
  const tags = await Promise.all(
    imageTags.map(it => getTag(it.tagId))
  );
  return tags.filter((tag): tag is Tag => tag !== undefined);
}

export async function getImagesForTag(tagId: string): Promise<Image[]> {
  const imageTags = await getImageTagsByTag(tagId);
  const images = await Promise.all(
    imageTags.map(it => getImage(it.imageId))
  );
  return images.filter((img): img is Image => img !== undefined);
}

export async function getImagesByTags(tagIds: string[]): Promise<Image[]> {
  if (tagIds.length === 0) {
    return getLibraryImages();
  }
  
  const db = await getDB();
  const allImages = await getLibraryImages();
  
  // Filter images that have ALL of the specified tags
  const filteredImages: Image[] = [];
  
  for (const image of allImages) {
    const imageTags = await getImageTagsByImage(image.id);
    const imageTagIds = imageTags.map(it => it.tagId);
    
    // Check if image has all required tags
    const hasAllTags = tagIds.every(tagId => imageTagIds.includes(tagId));
    if (hasAllTags) {
      filteredImages.push(image);
    }
  }
  
  return filteredImages;
}

/**
 * Batch get tags for multiple images (optimized)
 * More efficient than calling getTagsForImage individually
 */
export async function getTagsForImages(imageIds: string[]): Promise<Map<string, Tag[]>> {
  const db = await getDB();
  const allTags = await getAllTags();
  const tagsMap = new Map(allTags.map(t => [t.id, t]));
  
  const result = new Map<string, Tag[]>();
  
  // Get all image-tag associations
  const allImageTags = await db.getAll('imageTags');
  
  // Group by image ID
  for (const imageId of imageIds) {
    const tags = allImageTags
      .filter(it => it.imageId === imageId)
      .map(it => tagsMap.get(it.tagId))
      .filter((tag): tag is Tag => tag !== undefined);
    
    result.set(imageId, tags);
  }
  
  return result;
}

/**
 * Get tag index for fast lookups
 * Returns a Map of tag name to tag for quick search
 */
export async function getTagIndex(): Promise<Map<string, Tag>> {
  const tags = await getAllTags();
  const index = new Map<string, Tag>();
  
  for (const tag of tags) {
    index.set(tag.name.toLowerCase(), tag);
  }
  
  return index;
}

/**
 * Search tags by name (with index for performance)
 */
export async function searchTags(query: string): Promise<Tag[]> {
  const allTags = await getAllTags();
  const lowerQuery = query.toLowerCase();
  
  // Exact match first
  const exactMatch = allTags.filter(
    t => t.name.toLowerCase() === lowerQuery
  );
  
  if (exactMatch.length > 0) {
    return exactMatch;
  }
  
  // Partial match
  return allTags.filter(t =>
    t.name.toLowerCase().includes(lowerQuery)
  );
}

// ============= Utility Functions =============

export async function getLibraryCount(): Promise<number> {
  const images = await getLibraryImages();
  return images.length;
}

export async function getPackCount(): Promise<number> {
  const packs = await getAllPacks();
  return packs.length;
}

export function buildTagPath(tag: Tag, allTags: Tag[]): string {
  const path: string[] = [tag.name];
  let currentTag = tag;
  
  while (currentTag.parentId) {
    const parent = allTags.find(t => t.id === currentTag.parentId);
    if (!parent) break;
    path.unshift(parent.name);
    currentTag = parent;
  }
  
  return path.join('/');
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// ============= Tag Usage Operations =============

export async function updateTagUsage(tagId: string): Promise<void> {
  try {
    const db = await getDB();
    const existing = await db.get('tagUsage', tagId);
    
    if (existing) {
      await db.put('tagUsage', {
        tagId,
        lastUsed: Date.now(),
        usageCount: existing.usageCount + 1,
      });
      console.log('Updated tag usage:', tagId, 'count:', existing.usageCount + 1);
    } else {
      await db.put('tagUsage', {
        tagId,
        lastUsed: Date.now(),
        usageCount: 1,
      });
      console.log('Created tag usage:', tagId);
    }
  } catch (error) {
    console.error('Failed to update tag usage:', error);
    // Don't throw - tag usage tracking is not critical
  }
}

export async function getRecentlyUsedTags(limit: number = 10): Promise<Tag[]> {
  try {
    const db = await getDB();
    
    // Get all tag usage records
    const allUsage = await db.getAll('tagUsage');
    
    // Sort by lastUsed descending
    const sortedUsage = allUsage.sort((a, b) => b.lastUsed - a.lastUsed);
    
    // Get the actual tag objects and clean up orphaned usage records
    const tags: Tag[] = [];
    const orphanedUsageIds: string[] = [];
    
    for (const usage of sortedUsage) {
      const tag = await getTag(usage.tagId);
      if (tag) {
        tags.push(tag);
        if (tags.length >= limit) break;
      } else {
        // Tag doesn't exist anymore, mark for cleanup
        orphanedUsageIds.push(usage.tagId);
      }
    }
    
    // Clean up orphaned usage records asynchronously
    if (orphanedUsageIds.length > 0) {
      Promise.all(
        orphanedUsageIds.map(id => db.delete('tagUsage', id).catch(() => {}))
      ).catch(() => {});
    }
    
    return tags;
  } catch (error) {
    console.error('Failed to get recently used tags:', error);
    return [];
  }
}

export async function getTagsInUse(): Promise<Set<string>> {
  try {
    const db = await getDB();
    
    // Get all imageTags to find which tags are actually used
    const allImageTags = await db.getAll('imageTags');
    
    // Create a set of tag IDs that are in use
    const tagsInUse = new Set<string>();
    allImageTags.forEach(imageTag => {
      tagsInUse.add(imageTag.tagId);
    });
    
    return tagsInUse;
  } catch (error) {
    console.error('Failed to get tags in use:', error);
    return new Set();
  }
}

export async function clearAllData(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['packs', 'images', 'tags', 'imageTags', 'tagUsage'], 'readwrite');
  
  await Promise.all([
    tx.objectStore('packs').clear(),
    tx.objectStore('images').clear(),
    tx.objectStore('tags').clear(),
    tx.objectStore('imageTags').clear(),
    tx.objectStore('tagUsage').clear(),
  ]);
  
  await tx.done;
  console.log('All database data cleared');
}

// Debug function to completely reset database
export async function resetDatabase(): Promise<void> {
  // Close existing connection
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    dbPromise = null;
  }
  
  // Delete the database
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => {
      console.log('Database deleted successfully');
      resolve();
    };
    request.onerror = () => {
      console.error('Error deleting database');
      reject(request.error);
    };
    request.onblocked = () => {
      console.warn('Database deletion blocked - close all tabs using this database');
    };
  });
  
  // Clear localStorage
  if (typeof localStorage !== 'undefined') {
    localStorage.clear();
    console.log('localStorage cleared');
  }
  
  // Reinitialize
  console.log('Reinitializing database...');
  await getDB();
  console.log('Database reset complete');
}

// Clean up orphaned data (tagUsage entries for deleted tags, imageTags for deleted images/tags)
export async function cleanupOrphanedData(): Promise<void> {
  try {
    const db = await getDB();
    
    // Get all valid tag IDs
    const allTags = await getAllTags();
    const validTagIds = new Set(allTags.map(t => t.id));
    
    // Clean up tagUsage
    const allUsage = await db.getAll('tagUsage');
    const orphanedUsage = allUsage.filter(u => !validTagIds.has(u.tagId));
    
    // Clean up imageTags
    const allImageTags = await db.getAll('imageTags');
    const allImages = await db.getAll('images');
    const validImageIds = new Set(allImages.map(i => i.id));
    const orphanedImageTags = allImageTags.filter(
      it => !validTagIds.has(it.tagId) || !validImageIds.has(it.imageId)
    );
    
    // Delete orphaned records
    const tx = db.transaction(['tagUsage', 'imageTags'], 'readwrite');
    
    await Promise.all([
      ...orphanedUsage.map(u => tx.objectStore('tagUsage').delete(u.tagId)),
      ...orphanedImageTags.map(it => 
        tx.objectStore('imageTags').delete([it.imageId, it.tagId])
      ),
    ]);
    
    await tx.done;
    
    console.log(`Cleaned up ${orphanedUsage.length} orphaned tag usage records and ${orphanedImageTags.length} orphaned image-tag associations`);
  } catch (error) {
    console.error('Failed to clean up orphaned data:', error);
  }
}

// ============= Settings Operations =============

/**
 * Get all settings as a type-safe object.
 * Returns DEFAULT_SETTINGS for any missing values.
 */
export async function getSettings(): Promise<AppSettings> {
  try {
    const db = await getDB();
    const allSettings = await db.getAll('settings');
    
    const settings: AppSettings = { ...DEFAULT_SETTINGS };
    
    for (const setting of allSettings) {
      try {
        const value = JSON.parse(setting.value);
        if (setting.key in settings) {
          (settings as any)[setting.key] = value;
        }
      } catch (error) {
        console.error(`Failed to parse setting ${setting.key}:`, error);
      }
    }
    
    return settings;
  } catch (error) {
    console.error('Failed to get settings:', error);
    return DEFAULT_SETTINGS;
  }
}

/**
 * Get a single setting value.
 * Returns default value if setting doesn't exist.
 */
export async function getSetting<K extends keyof AppSettings>(
  key: K
): Promise<AppSettings[K]> {
  try {
    const db = await getDB();
    const setting = await db.get('settings', key);
    
    if (setting) {
      return JSON.parse(setting.value);
    }
    
    return DEFAULT_SETTINGS[key];
  } catch (error) {
    console.error(`Failed to get setting ${key}:`, error);
    return DEFAULT_SETTINGS[key];
  }
}

/**
 * Update a single setting.
 */
export async function updateSetting<K extends keyof AppSettings>(
  key: K,
  value: AppSettings[K]
): Promise<void> {
  try {
    const db = await getDB();
    await db.put('settings', {
      key,
      value: JSON.stringify(value),
    });
    console.log(`Updated setting ${key}:`, value);
  } catch (error) {
    console.error(`Failed to update setting ${key}:`, error);
    throw error;
  }
}

/**
 * Update multiple settings at once.
 */
export async function updateSettings(settings: Partial<AppSettings>): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction('settings', 'readwrite');
    
    for (const [key, value] of Object.entries(settings)) {
      await tx.store.put({
        key,
        value: JSON.stringify(value),
      });
    }
    
    await tx.done;
    console.log('Updated settings:', settings);
  } catch (error) {
    console.error('Failed to update settings:', error);
    throw error;
  }
}

/**
 * Reset all settings to defaults.
 */
export async function resetSettings(): Promise<void> {
  try {
    const db = await getDB();
    await db.clear('settings');
    console.log('Reset all settings to defaults');
  } catch (error) {
    console.error('Failed to reset settings:', error);
    throw error;
  }
}

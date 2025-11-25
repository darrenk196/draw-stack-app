import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export interface Pack {
  id: string;
  name: string;
  source: string;
  imageCount: number;
  importedAt: number;
  folderPath: string;
  isExpanded?: boolean;
}

export interface Image {
  id: string;
  packId: string | null;
  filename: string;
  originalPath: string;
  thumbnailPath: string;
  fullPath: string;
  isInLibrary: boolean;
  addedToLibraryAt: number | null;
}

export interface Tag {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: number;
}

export interface ImageTag {
  imageId: string;
  tagId: string;
}

export interface TagUsage {
  tagId: string;
  lastUsed: number;
  usageCount: number;
}

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
}

const DB_NAME = 'drawstack-db';
const DB_VERSION = 3;

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

export async function addImages(images: Image[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('images', 'readwrite');
  
  console.log('addImages: Starting transaction for', images.length, 'images');
  console.log('addImages: Sample image data:', images[0]);
  
  // Use Promise.all with tx.done to ensure all operations complete
  await Promise.all([
    ...images.map(img => 
      tx.store.add(img).then(() => {
        console.log('addImages: Successfully added image:', img.id);
      }).catch((err: any) => {
        if (err.name === 'ConstraintError') {
          console.warn('Duplicate image skipped:', img.id);
        } else {
          console.error('Error adding image:', img.id, err);
          throw err;
        }
      })
    ),
    tx.done
  ]);
  
  console.log(`addImages: Transaction completed for ${images.length} images`);
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
export async function deleteImages(imageIds: string[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['images', 'imageTags', 'tagUsage'], 'readwrite');
  const imagesStore = tx.objectStore('images');
  const imageTagsStore = tx.objectStore('imageTags');
  const tagUsageStore = tx.objectStore('tagUsage');

  for (const imageId of imageIds) {
    // Get all tag associations for this image
    const associatedTags: ImageTag[] = await imageTagsStore.index('by-image').getAll(imageId);
    for (const it of associatedTags) {
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
    }
    // Delete the image itself
    await imagesStore.delete(imageId);
  }

  await tx.done;
  console.log('Deleted images:', imageIds.length);
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
    
    // Take top N
    const topUsage = sortedUsage.slice(0, limit);
    
    // Get the actual tag objects
    const tags = await Promise.all(
      topUsage.map(usage => getTag(usage.tagId))
    );
    
    return tags.filter((tag): tag is Tag => tag !== undefined);
  } catch (error) {
    console.error('Failed to get recently used tags:', error);
    return [];
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
  
  // Reinitialize
  console.log('Reinitializing database...');
  await getDB();
  console.log('Database reset complete');
}

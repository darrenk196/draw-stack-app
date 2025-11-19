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
const DB_VERSION = 2;

let dbInstance: IDBPDatabase<DrawStackDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<DrawStackDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<DrawStackDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, newVersion, transaction) {
      // Version 1: Create initial stores
      if (oldVersion < 1) {
        // Packs store
        const packsStore = db.createObjectStore('packs', { keyPath: 'id' });
        packsStore.createIndex('by-imported', 'importedAt');

        // Images store
        const imagesStore = db.createObjectStore('images', { keyPath: 'id' });
        imagesStore.createIndex('by-pack', 'packId');
        imagesStore.createIndex('by-library', 'isInLibrary');

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
    },
  });

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
  
  // Batch adds without waiting for each one - much faster
  for (const img of images) {
    tx.store.add(img).catch(err => {
      // Ignore duplicate key errors during import
      if (err.name !== 'ConstraintError') {
        console.error('Error adding image:', err);
      }
    });
  }
  
  await tx.done;
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
  // Get all images and filter by isInLibrary boolean
  const allImages = await db.getAll('images');
  return allImages.filter(img => img.isInLibrary === true);
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
  
  await db.delete('tags', id);
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

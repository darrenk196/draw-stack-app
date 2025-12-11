/**
 * Centralized error handling and messages for Draw Stack
 * Ensures consistent error reporting across the app
 */

export type ErrorSeverity = 'error' | 'warning' | 'info';

export interface ValidationError {
  field: string;
  message: string;
}

export class ValidationResult {
  public errors: ValidationError[] = [];
  public isValid = true;

  addError(field: string, message: string): void {
    this.errors.push({ field, message });
    this.isValid = false;
  }

  getErrorMessage(): string {
    if (this.isValid) return '';
    return this.errors.map(e => `${e.field}: ${e.message}`).join('\n');
  }
}

/**
 * Error messages - centralized strings for consistency
 */
export const ERROR_MESSAGES = {
  // Database operations
  DB_ADD_FAILED: 'Failed to add item to database',
  DB_UPDATE_FAILED: 'Failed to update item in database',
  DB_DELETE_FAILED: 'Failed to delete item from database',
  DB_QUERY_FAILED: 'Failed to query database',
  DB_TRANSACTION_FAILED: 'Database operation cancelled - some items may not have been saved',
  DB_CONNECTION_FAILED: 'Failed to connect to database',

  // Import/Export
  IMPORT_INVALID_FORMAT: 'Invalid backup file format',
  IMPORT_MISSING_IMAGES: 'Backup file missing images data',
  IMPORT_MISSING_TAGS: 'Backup file missing tags data',
  IMPORT_PARSE_ERROR: 'Failed to parse backup file',
  IMPORT_READ_ERROR: 'Failed to read backup file',
  IMPORT_PARTIAL_SUCCESS: 'Import completed with errors - some items could not be imported',
  EXPORT_FAILED: 'Failed to export library',

  // Image operations
  IMAGE_INVALID_ID: 'Image ID is missing or invalid',
  IMAGE_INVALID_FILENAME: 'Image filename is missing or invalid',
  IMAGE_INVALID_PATH: 'Image path is missing or invalid',
  IMAGE_DUPLICATE: 'Image already exists in library',
  IMAGE_NOT_FOUND: 'Image not found',
  IMAGE_DELETE_FAILED: 'Failed to delete image',

  // Tag operations
  TAG_INVALID_NAME: 'Tag name is missing or invalid',
  TAG_DUPLICATE: 'Tag already exists in this category',
  TAG_DELETE_FAILED: 'Failed to delete tag',
  TAG_UPDATE_FAILED: 'Failed to update tag',

  // File operations
  FILE_READ_FAILED: 'Failed to read file',
  FILE_WRITE_FAILED: 'Failed to write file',
  FILE_NOT_FOUND: 'File not found',
  DIRECTORY_NOT_FOUND: 'Directory not found',

  // Settings
  SETTINGS_LOAD_FAILED: 'Failed to load settings',
  SETTINGS_SAVE_FAILED: 'Failed to save settings',
  LIBRARY_PATH_INVALID: 'Invalid library path',

  // General
  OPERATION_CANCELLED: 'Operation cancelled',
  OPERATION_TIMEOUT: 'Operation took too long and was cancelled',
  UNEXPECTED_ERROR: 'An unexpected error occurred',
};

export const SUCCESS_MESSAGES = {
  LIBRARY_EXPORTED: 'Library exported successfully',
  LIBRARY_IMPORTED: 'Library imported successfully',
  LIBRARY_CLEARED: 'Library cleared successfully',
  APP_RESET: 'App reset successfully',
  SETTINGS_SAVED: 'Settings saved successfully',
  LIBRARY_PATH_UPDATED: 'Library path updated',
  CATEGORIES_RESTORED: 'Default categories restored',
};

/**
 * Validate image data structure
 */
export function validateImage(image: any): ValidationResult {
  const result = new ValidationResult();

  if (!image.id || typeof image.id !== 'string') {
    result.addError('id', ERROR_MESSAGES.IMAGE_INVALID_ID);
  }
  if (!image.filename || typeof image.filename !== 'string') {
    result.addError('filename', ERROR_MESSAGES.IMAGE_INVALID_FILENAME);
  }
  if (!image.fullPath || typeof image.fullPath !== 'string') {
    result.addError('fullPath', ERROR_MESSAGES.IMAGE_INVALID_PATH);
  }

  return result;
}

/**
 * Validate tag data structure
 */
export function validateTag(tag: any): ValidationResult {
  const result = new ValidationResult();

  if (!tag.id || typeof tag.id !== 'string') {
    result.addError('id', 'Tag ID is missing or invalid');
  }
  if (!tag.name || typeof tag.name !== 'string') {
    result.addError('name', ERROR_MESSAGES.TAG_INVALID_NAME);
  }
  if (tag.name && tag.name.trim().length === 0) {
    result.addError('name', ERROR_MESSAGES.TAG_INVALID_NAME);
  }

  return result;
}

/**
 * Validate backup file structure
 */
export function validateBackupData(data: any): ValidationResult {
  const result = new ValidationResult();

  if (!data.images || !Array.isArray(data.images)) {
    result.addError('images', ERROR_MESSAGES.IMPORT_MISSING_IMAGES);
  }
  if (!data.tags || !Array.isArray(data.tags)) {
    result.addError('tags', ERROR_MESSAGES.IMPORT_MISSING_TAGS);
  }

  // Validate individual items
  if (Array.isArray(data.images)) {
    data.images.forEach((img: any, index: number) => {
      const validation = validateImage(img);
      if (!validation.isValid) {
        result.addError(`images[${index}]`, validation.getErrorMessage());
      }
    });
  }

  if (Array.isArray(data.tags)) {
    data.tags.forEach((tag: any, index: number) => {
      const validation = validateTag(tag);
      if (!validation.isValid) {
        result.addError(`tags[${index}]`, validation.getErrorMessage());
      }
    });
  }

  return result;
}

/**
 * Format error message for user display
 */
export function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return ERROR_MESSAGES.UNEXPECTED_ERROR;
}

/**
 * Safe async wrapper with error handling and user feedback
 */
export async function safeAsync<T>(
  operation: () => Promise<T>,
  onError?: (error: unknown) => void,
  context?: string
): Promise<T | null> {
  try {
    return await operation();
  } catch (error) {
    const message = `${context ? context + ': ' : ''}${formatErrorMessage(error)}`;
    console.error(message, error);
    onError?.(error);
    return null;
  }
}

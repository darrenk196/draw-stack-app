/**
 * Centralized error handling and messages for Draw Stack
 * Ensures consistent error reporting across the app
 */

export type ErrorSeverity = 'error' | 'warning' | 'info';

/**
 * Error codes for different categories of errors
 */
export enum ErrorCode {
  // Database errors
  DB_CONNECTION_FAILED = 'DB_CONNECTION_FAILED',
  DB_ADD_FAILED = 'DB_ADD_FAILED',
  DB_UPDATE_FAILED = 'DB_UPDATE_FAILED',
  DB_DELETE_FAILED = 'DB_DELETE_FAILED',
  DB_QUERY_FAILED = 'DB_QUERY_FAILED',
  DB_TRANSACTION_FAILED = 'DB_TRANSACTION_FAILED',

  // Image errors
  IMAGE_INVALID_ID = 'IMAGE_INVALID_ID',
  IMAGE_INVALID_FILENAME = 'IMAGE_INVALID_FILENAME',
  IMAGE_INVALID_PATH = 'IMAGE_INVALID_PATH',
  IMAGE_DUPLICATE = 'IMAGE_DUPLICATE',
  IMAGE_NOT_FOUND = 'IMAGE_NOT_FOUND',
  IMAGE_DELETE_FAILED = 'IMAGE_DELETE_FAILED',
  IMAGE_LOAD_FAILED = 'IMAGE_LOAD_FAILED',

  // Tag errors
  TAG_INVALID_NAME = 'TAG_INVALID_NAME',
  TAG_INVALID_ID = 'TAG_INVALID_ID',
  TAG_DUPLICATE = 'TAG_DUPLICATE',
  TAG_DELETE_FAILED = 'TAG_DELETE_FAILED',
  TAG_UPDATE_FAILED = 'TAG_UPDATE_FAILED',
  TAG_NOT_FOUND = 'TAG_NOT_FOUND',

  // Import/Export errors
  IMPORT_INVALID_FORMAT = 'IMPORT_INVALID_FORMAT',
  IMPORT_MISSING_DATA = 'IMPORT_MISSING_DATA',
  IMPORT_PARSE_ERROR = 'IMPORT_PARSE_ERROR',
  IMPORT_READ_ERROR = 'IMPORT_READ_ERROR',
  IMPORT_PARTIAL_SUCCESS = 'IMPORT_PARTIAL_SUCCESS',
  IMPORT_FAILED = 'IMPORT_FAILED',
  EXPORT_FAILED = 'EXPORT_FAILED',

  // File operations
  FILE_READ_FAILED = 'FILE_READ_FAILED',
  FILE_WRITE_FAILED = 'FILE_WRITE_FAILED',
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  DIRECTORY_NOT_FOUND = 'DIRECTORY_NOT_FOUND',

  // Settings
  SETTINGS_LOAD_FAILED = 'SETTINGS_LOAD_FAILED',
  SETTINGS_SAVE_FAILED = 'SETTINGS_SAVE_FAILED',
  LIBRARY_PATH_INVALID = 'LIBRARY_PATH_INVALID',

  // Validation errors
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  INVALID_INPUT = 'INVALID_INPUT',

  // General
  OPERATION_CANCELLED = 'OPERATION_CANCELLED',
  OPERATION_TIMEOUT = 'OPERATION_TIMEOUT',
  UNEXPECTED_ERROR = 'UNEXPECTED_ERROR',
}

/**
 * Custom base error class for Draw Stack
 */
export class AppError extends Error {
  code: ErrorCode;
  originalError?: unknown;
  context?: string;

  constructor(code: ErrorCode, message: string, originalError?: unknown, context?: string) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.originalError = originalError;
    this.context = context;
  }

  getFullMessage(): string {
    if (this.context) {
      return `${this.context}: ${this.message}`;
    }
    return this.message;
  }
}

/**
 * Database-specific error
 */
export class DatabaseError extends AppError {
  constructor(message: string, code: ErrorCode = ErrorCode.DB_QUERY_FAILED, originalError?: unknown) {
    super(code, message, originalError, 'Database');
    this.name = 'DatabaseError';
  }
}

/**
 * Image-specific error
 */
export class ImageError extends AppError {
  imageId?: string;

  constructor(message: string, code: ErrorCode = ErrorCode.IMAGE_LOAD_FAILED, imageId?: string, originalError?: unknown) {
    super(code, message, originalError, 'Image');
    this.name = 'ImageError';
    this.imageId = imageId;
  }
}

/**
 * Tag-specific error
 */
export class TagError extends AppError {
  tagId?: string;

  constructor(message: string, code: ErrorCode = ErrorCode.TAG_NOT_FOUND, tagId?: string, originalError?: unknown) {
    super(code, message, originalError, 'Tag');
    this.name = 'TagError';
    this.tagId = tagId;
  }
}

/**
 * Validation error
 */
export class ValidationError extends AppError {
  field?: string;

  constructor(message: string, field?: string, code: ErrorCode = ErrorCode.VALIDATION_FAILED, originalError?: unknown) {
    super(code, message, originalError, 'Validation');
    this.name = 'ValidationError';
    this.field = field;
  }
}

/**
 * Import/Export error
 */
export class ImportExportError extends AppError {
  failedItems?: number;

  constructor(message: string, code: ErrorCode = ErrorCode.IMPORT_FAILED, failedItems?: number, originalError?: unknown) {
    super(code, message, originalError, 'Import/Export');
    this.name = 'ImportExportError';
    this.failedItems = failedItems;
  }
}

/**
 * Validation error field structure for form validation results
 */
export interface ValidationFieldError {
  field: string;
  message: string;
}

export class ValidationResult {
  public errors: ValidationFieldError[] = [];
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
  IMPORT_FAILED: 'Failed to import library',
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
 * Handles both standard Error objects and custom AppError classes
 */
export function formatErrorMessage(error: unknown): string {
  if (error instanceof AppError) {
    return error.getFullMessage();
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return ERROR_MESSAGES.UNEXPECTED_ERROR;
}

/**
 * Check if an error is a specific type of AppError
 */
export function isAppError(error: unknown, code?: ErrorCode): error is AppError {
  if (!(error instanceof AppError)) return false;
  if (code) return error.code === code;
  return true;
}

/**
 * Check if an error is a specific type
 */
export function isDatabaseError(error: unknown): error is DatabaseError {
  return error instanceof DatabaseError;
}

export function isImageError(error: unknown): error is ImageError {
  return error instanceof ImageError;
}

export function isTagError(error: unknown): error is TagError {
  return error instanceof TagError;
}

/**
 * Get user-friendly error message based on error code
 */
export function getUserFriendlyMessage(code: ErrorCode): string {
  const codeToMessage: Record<ErrorCode, string> = {
    // Database
    [ErrorCode.DB_CONNECTION_FAILED]: ERROR_MESSAGES.DB_CONNECTION_FAILED,
    [ErrorCode.DB_ADD_FAILED]: ERROR_MESSAGES.DB_ADD_FAILED,
    [ErrorCode.DB_UPDATE_FAILED]: ERROR_MESSAGES.DB_UPDATE_FAILED,
    [ErrorCode.DB_DELETE_FAILED]: ERROR_MESSAGES.DB_DELETE_FAILED,
    [ErrorCode.DB_QUERY_FAILED]: ERROR_MESSAGES.DB_QUERY_FAILED,
    [ErrorCode.DB_TRANSACTION_FAILED]: ERROR_MESSAGES.DB_TRANSACTION_FAILED,

    // Image
    [ErrorCode.IMAGE_INVALID_ID]: ERROR_MESSAGES.IMAGE_INVALID_ID,
    [ErrorCode.IMAGE_INVALID_FILENAME]: ERROR_MESSAGES.IMAGE_INVALID_FILENAME,
    [ErrorCode.IMAGE_INVALID_PATH]: ERROR_MESSAGES.IMAGE_INVALID_PATH,
    [ErrorCode.IMAGE_DUPLICATE]: ERROR_MESSAGES.IMAGE_DUPLICATE,
    [ErrorCode.IMAGE_NOT_FOUND]: ERROR_MESSAGES.IMAGE_NOT_FOUND,
    [ErrorCode.IMAGE_DELETE_FAILED]: ERROR_MESSAGES.IMAGE_DELETE_FAILED,
    [ErrorCode.IMAGE_LOAD_FAILED]: 'Failed to load image',

    // Tag
    [ErrorCode.TAG_INVALID_NAME]: ERROR_MESSAGES.TAG_INVALID_NAME,
    [ErrorCode.TAG_INVALID_ID]: 'Tag ID is invalid',
    [ErrorCode.TAG_DUPLICATE]: ERROR_MESSAGES.TAG_DUPLICATE,
    [ErrorCode.TAG_DELETE_FAILED]: ERROR_MESSAGES.TAG_DELETE_FAILED,
    [ErrorCode.TAG_UPDATE_FAILED]: ERROR_MESSAGES.TAG_UPDATE_FAILED,
    [ErrorCode.TAG_NOT_FOUND]: 'Tag not found',

    // Import/Export
    [ErrorCode.IMPORT_INVALID_FORMAT]: ERROR_MESSAGES.IMPORT_INVALID_FORMAT,
    [ErrorCode.IMPORT_MISSING_DATA]: 'Backup file is missing required data',
    [ErrorCode.IMPORT_PARSE_ERROR]: ERROR_MESSAGES.IMPORT_PARSE_ERROR,
    [ErrorCode.IMPORT_READ_ERROR]: ERROR_MESSAGES.IMPORT_READ_ERROR,
    [ErrorCode.IMPORT_PARTIAL_SUCCESS]: ERROR_MESSAGES.IMPORT_PARTIAL_SUCCESS,
    [ErrorCode.IMPORT_FAILED]: ERROR_MESSAGES.IMPORT_FAILED,
    [ErrorCode.EXPORT_FAILED]: ERROR_MESSAGES.EXPORT_FAILED,

    // File
    [ErrorCode.FILE_READ_FAILED]: ERROR_MESSAGES.FILE_READ_FAILED,
    [ErrorCode.FILE_WRITE_FAILED]: ERROR_MESSAGES.FILE_WRITE_FAILED,
    [ErrorCode.FILE_NOT_FOUND]: ERROR_MESSAGES.FILE_NOT_FOUND,
    [ErrorCode.DIRECTORY_NOT_FOUND]: ERROR_MESSAGES.DIRECTORY_NOT_FOUND,

    // Settings
    [ErrorCode.SETTINGS_LOAD_FAILED]: ERROR_MESSAGES.SETTINGS_LOAD_FAILED,
    [ErrorCode.SETTINGS_SAVE_FAILED]: ERROR_MESSAGES.SETTINGS_SAVE_FAILED,
    [ErrorCode.LIBRARY_PATH_INVALID]: ERROR_MESSAGES.LIBRARY_PATH_INVALID,

    // Validation
    [ErrorCode.VALIDATION_FAILED]: 'Validation failed',
    [ErrorCode.INVALID_INPUT]: 'Invalid input provided',

    // General
    [ErrorCode.OPERATION_CANCELLED]: ERROR_MESSAGES.OPERATION_CANCELLED,
    [ErrorCode.OPERATION_TIMEOUT]: ERROR_MESSAGES.OPERATION_TIMEOUT,
    [ErrorCode.UNEXPECTED_ERROR]: ERROR_MESSAGES.UNEXPECTED_ERROR,
  };

  return codeToMessage[code] || ERROR_MESSAGES.UNEXPECTED_ERROR;
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

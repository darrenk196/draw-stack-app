/**
 * Centralized error handling and messages for Draw Stack.
 * Provides typed error classes, validation utilities, and user-friendly error messages.
 * Ensures consistent error reporting across the app.
 * 
 * @module errors
 */

/**
 * Severity level for error reporting.
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
 * Base error class for all application errors.
 * Provides error code, context, and original error tracking.
 * 
 * @example
 * ```typescript
 * throw new AppError(
 *   ErrorCode.VALIDATION_FAILED,
 *   'Invalid image data',
 *   originalError,
 *   'Image Import'
 * );
 * ```
 */
export class AppError extends Error {
  /** Error code for categorization */
  code: ErrorCode;
  /** Original error that caused this error */
  originalError?: unknown;
  /** Context where the error occurred */
  context?: string;

  /**
   * Creates a new application error.
   * 
   * @param code - Error code enum value
   * @param message - Human-readable error message
   * @param originalError - Original error if this is a wrapped error
   * @param context - Context string (e.g., 'Database', 'Image Import')
   */
  constructor(code: ErrorCode, message: string, originalError?: unknown, context?: string) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.originalError = originalError;
    this.context = context;
  }

  /**
   * Gets the full error message including context.
   * 
   * @returns Formatted error message with context prefix if available
   */
  getFullMessage(): string {
    if (this.context) {
      return `${this.context}: ${this.message}`;
    }
    return this.message;
  }
}

/**
 * Database-specific error for SQL operations.
 * Automatically sets context to 'Database'.
 * 
 * @example
 * ```typescript
 * throw new DatabaseError(
 *   'Failed to insert image record',
 *   ErrorCode.DB_ADD_FAILED,
 *   sqlError
 * );
 * ```
 */
export class DatabaseError extends AppError {
  constructor(message: string, code: ErrorCode = ErrorCode.DB_QUERY_FAILED, originalError?: unknown) {
    super(code, message, originalError, 'Database');
    this.name = 'DatabaseError';
  }
}

/**
 * Image-specific error for image operations.
 * Includes optional imageId for tracking which image failed.
 * 
 * @example
 * ```typescript
 * throw new ImageError(
 *   'Image file not found',
 *   ErrorCode.IMAGE_NOT_FOUND,
 *   'img_123',
 *   originalError
 * );
 * ```
 */
export class ImageError extends AppError {
  /** ID of the image that caused the error */
  imageId?: string;

  constructor(message: string, code: ErrorCode = ErrorCode.IMAGE_LOAD_FAILED, imageId?: string, originalError?: unknown) {
    super(code, message, originalError, 'Image');
    this.name = 'ImageError';
    this.imageId = imageId;
  }
}

/**
 * Tag-specific error for tag operations.
 * Includes optional tagId for tracking which tag failed.
 * 
 * @example
 * ```typescript
 * throw new TagError(
 *   'Tag already exists',
 *   ErrorCode.TAG_DUPLICATE,
 *   'tag_456'
 * );
 * ```
 */
export class TagError extends AppError {
  /** ID of the tag that caused the error */
  tagId?: string;

  constructor(message: string, code: ErrorCode = ErrorCode.TAG_NOT_FOUND, tagId?: string, originalError?: unknown) {
    super(code, message, originalError, 'Tag');
    this.name = 'TagError';
    this.tagId = tagId;
  }
}

/**
 * Validation error for form and data validation.
 * Includes optional field name to identify which field failed validation.
 * 
 * @example
 * ```typescript
 * throw new ValidationError(
 *   'Email format is invalid',
 *   'email',
 *   ErrorCode.INVALID_INPUT
 * );
 * ```
 */
export class ValidationError extends AppError {
  /** Name of the field that failed validation */
  field?: string;

  constructor(message: string, field?: string, code: ErrorCode = ErrorCode.VALIDATION_FAILED, originalError?: unknown) {
    super(code, message, originalError, 'Validation');
    this.name = 'ValidationError';
    this.field = field;
  }
}

/**
 * Import/Export error for backup/restore operations.
 * Tracks number of failed items in partial failures.
 * 
 * @example
 * ```typescript
 * throw new ImportExportError(
 *   'Import partially failed',
 *   ErrorCode.IMPORT_PARTIAL_SUCCESS,
 *   5 // 5 items failed
 * );
 * ```
 */
export class ImportExportError extends AppError {
  /** Number of items that failed during import/export */
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

/**
 * Result object for form/data validation.
 * Accumulates multiple field errors and provides formatted messages.
 * 
 * @example
 * ```typescript
 * const result = new ValidationResult();
 * if (!tag.name) result.addError('name', 'Name is required');
 * if (result.isValid) {
 *   // Proceed with save
 * } else {
 *   toast.error(result.getErrorMessage());
 * }
 * ```
 */
export class ValidationResult {
  /** Array of field-specific errors */
  public errors: ValidationFieldError[] = [];
  /** Whether validation passed (no errors) */
  public isValid = true;

  /**
   * Adds a validation error for a specific field.
   * 
   * @param field - Field name that failed validation
   * @param message - Error message describing the validation failure
   */
  addError(field: string, message: string): void {
    this.errors.push({ field, message });
    this.isValid = false;
  }

  /**
   * Gets a formatted error message with all field errors.
   * 
   * @returns Newline-separated error messages, or empty string if valid
   */
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
 * Validates image data structure for required fields.
 * Checks id, filename, and fullPath are present and correct types.
 * 
 * @param image - Image object to validate
 * @returns ValidationResult with any errors found
 * 
 * @example
 * ```typescript
 * const result = validateImage(imageData);
 * if (!result.isValid) {
 *   toast.error(result.getErrorMessage());
 * }
 * ```
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
 * Validates tag data structure for required fields.
 * Checks id and name are present, correct types, and name is not empty.
 * 
 * @param tag - Tag object to validate
 * @returns ValidationResult with any errors found
 * 
 * @example
 * ```typescript
 * const result = validateTag(tagData);
 * if (!result.isValid) {
 *   throw new ValidationError(result.getErrorMessage());
 * }
 * ```
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
 * Validates backup/export file structure.
 * Checks for required images and tags arrays, then validates each item.
 * 
 * @param data - Backup data object to validate
 * @returns ValidationResult with detailed errors for each invalid item
 * 
 * @example
 * ```typescript
 * const backupData = JSON.parse(fileContent);
 * const result = validateBackupData(backupData);
 * if (!result.isValid) {
 *   throw new ImportExportError(result.getErrorMessage());
 * }
 * ```
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
 * Formats any error into a user-friendly message string.
 * Handles AppError (with context), Error, string, and unknown types.
 * 
 * @param error - Error of any type to format
 * @returns User-friendly error message string
 * 
 * @example
 * ```typescript
 * try {
 *   await riskyOperation();
 * } catch (error) {
 *   toast.error(formatErrorMessage(error));
 * }
 * ```
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
 * Type guard to check if an error is an AppError.
 * Optionally checks for a specific error code.
 * 
 * @param error - Error to check
 * @param code - Optional error code to match
 * @returns true if error is AppError (and matches code if provided)
 * 
 * @example
 * ```typescript
 * if (isAppError(error, ErrorCode.IMAGE_NOT_FOUND)) {
 *   // Handle specific error code
 * }
 * ```
 */
export function isAppError(error: unknown, code?: ErrorCode): error is AppError {
  if (!(error instanceof AppError)) return false;
  if (code) return error.code === code;
  return true;
}

/**
 * Type guards for specific error classes.
 * Useful for narrowing error types in catch blocks.
 * 
 * @param error - Error to check
 * @returns true if error is the specific error type
 * 
 * @example
 * ```typescript
 * try {
 *   await db.query();
 * } catch (error) {
 *   if (isDatabaseError(error)) {
 *     console.log('DB error:', error.code);
 *   }
 * }
 * ```
 */
export function isDatabaseError(error: unknown): error is DatabaseError {
  return error instanceof DatabaseError;
}

/**
 * Type guard for ImageError.
 * @param error - Error to check
 */
export function isImageError(error: unknown): error is ImageError {
  return error instanceof ImageError;
}

/**
 * Type guard for TagError.
 * @param error - Error to check
 */
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

/**
 * Toast notification utilities for Draw Stack.
 * Provides a consistent interface for displaying toast notifications throughout the app.
 * Built on top of svelte-sonner for beautiful, accessible toast messages.
 * 
 * @module toast
 */

import { toast as sonnerToast } from 'svelte-sonner';

/**
 * Toast notification API for user feedback.
 * All toasts are automatically positioned and styled consistently.
 * 
 * @example
 * ```typescript
 * import { toast } from '$lib/toast';
 * 
 * toast.success('Image added to library');
 * toast.error('Failed to delete image');
 * toast.warning('This operation cannot be undone');
 * toast.info('Processing 50 images...');
 * 
 * // For async operations
 * toast.promise(
 *   deleteImages(ids),
 *   {
 *     loading: 'Deleting images...',
 *     success: 'Images deleted successfully',
 *     error: 'Failed to delete images'
 *   }
 * );
 * ```
 */
export const toast = {
  /**
   * Shows a success toast notification.
   * @param message - The success message to display
   */
  success: (message: string) => {
    sonnerToast.success(message);
  },
  
  /**
   * Shows an error toast notification.
   * @param message - The error message to display
   */
  error: (message: string) => {
    sonnerToast.error(message);
  },
  
  /**
   * Shows a warning toast notification.
   * @param message - The warning message to display
   */
  warning: (message: string) => {
    sonnerToast.warning(message);
  },
  
  /**
   * Shows an informational toast notification.
   * @param message - The info message to display
   */
  info: (message: string) => {
    sonnerToast.info(message);
  },
  
  /**
   * Shows a toast with loading state that updates based on promise resolution.
   * Automatically transitions from loading → success/error based on promise outcome.
   * 
   * @param promise - The promise to track
   * @param messages - Messages to display for each state
   * @returns The original promise for chaining
   * 
   * @example
   * ```typescript
   * await toast.promise(
   *   deleteImages(selectedIds),
   *   {
   *     loading: 'Deleting images...',
   *     success: 'Images deleted',
   *     error: 'Delete failed'
   *   }
   * );
   * ```
   */
  promise: <T>(
    promise: Promise<T>,
    messages: {
      loading: string;
      success: string;
      error: string;
    }
  ) => {
    return sonnerToast.promise(promise, messages);
  }
};

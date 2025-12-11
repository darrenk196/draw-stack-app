/**
 * Focus trap utilities for accessible modal dialogs.
 * Ensures keyboard navigation stays within modal when active, meeting WCAG requirements.
 * 
 * @module focusTrap
 */

/**
 * Creates a focus trap within the specified element.
 * Traps Tab/Shift+Tab navigation to cycle through focusable elements only.
 * 
 * @param element - The container element to trap focus within
 * @returns Cleanup function to remove event listeners, or null if no focusable elements
 * 
 * @example
 * ```typescript
 * const cleanup = createFocusTrap(modalElement);
 * // Later...
 * cleanup?.();
 * ```
 */
export function createFocusTrap(element: HTMLElement) {
  const focusableElements = getFocusableElements(element);
  
  if (focusableElements.length === 0) {
    return null;
  }

  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Tab') return;

    if (event.shiftKey) {
      // Shift + Tab
      if (document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      }
    } else {
      // Tab
      if (document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }
  };

  element.addEventListener('keydown', handleKeyDown);

  // Return cleanup function
  return () => {
    element.removeEventListener('keydown', handleKeyDown);
  };
}

/**
 * Retrieves all focusable elements within a container.
 * Includes links, buttons, inputs, textareas, selects, and elements with tabindex >= 0.
 * 
 * @param element - The container element to search within
 * @returns Array of focusable HTML elements in DOM order
 * 
 * @example
 * ```typescript
 * const modal = document.querySelector('.modal');
 * const focusable = getFocusableElements(modal);
 * focusable[0]?.focus(); // Focus first element
 * ```
 */
export function getFocusableElements(element: HTMLElement): HTMLElement[] {
  const focusableSelectors = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'textarea:not([disabled])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');

  return Array.from(element.querySelectorAll(focusableSelectors)) as HTMLElement[];
}

/**
 * Svelte action that traps focus within a modal dialog.
 * Automatically focuses the first focusable element on mount.
 * Ensures Tab/Shift+Tab cycles through only the modal's focusable elements.
 * 
 * @param node - The modal container element
 * @returns Svelte action object with destroy method
 * 
 * @example
 * ```svelte
 * <div class="modal" use:focusTrap>
 *   <button>Close</button>
 *   <input type="text" />
 *   <button>Submit</button>
 * </div>
 * ```
 */
export function focusTrap(node: HTMLElement) {
  let cleanup: (() => void) | null = null;

  const handleMount = () => {
    cleanup = createFocusTrap(node);
    // Focus first element by default
    const focusable = getFocusableElements(node);
    if (focusable.length > 0) {
      focusable[0].focus();
    }
  };

  const handleDestroy = () => {
    cleanup?.();
  };

  // Use setTimeout to ensure DOM is ready
  setTimeout(handleMount, 0);

  return {
    destroy: handleDestroy,
  };
}

/**
 * Svelte action that closes a modal when clicking the backdrop.
 * Only triggers when clicking the backdrop itself, not child elements.
 * 
 * @param node - The backdrop element (usually the modal overlay)
 * @param options - Configuration object
 * @param options.onClose - Callback function to close the modal
 * @returns Svelte action object with destroy method
 * 
 * @example
 * ```svelte
 * <div class="modal-backdrop" use:closeOnBackdropClick={{ onClose: () => showModal = false }}>
 *   <div class="modal-content">
 *     <!-- Content here won't trigger close -->
 *   </div>
 * </div>
 * ```
 */
export function closeOnBackdropClick(
  node: HTMLElement,
  { onClose }: { onClose: () => void }
) {
  const handleClick = (event: MouseEvent) => {
    // Only close if clicking on the backdrop itself, not child elements
    if (event.target === node) {
      onClose();
    }
  };

  node.addEventListener('click', handleClick);

  return {
    destroy() {
      node.removeEventListener('click', handleClick);
    },
  };
}

/**
 * Svelte action that closes a modal when pressing the Escape key.
 * Prevents default Escape key behavior and triggers the close callback.
 * 
 * @param node - The modal element to attach the listener to
 * @param options - Configuration object
 * @param options.onClose - Callback function to close the modal
 * @returns Svelte action object with destroy method
 * 
 * @example
 * ```svelte
 * <div class="modal" use:closeOnEscape={{ onClose: () => showModal = false }}>
 *   <h2>Press Escape to close</h2>
 * </div>
 * ```
 */
export function closeOnEscape(
  node: HTMLElement,
  { onClose }: { onClose: () => void }
) {
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  };

  node.addEventListener('keydown', handleKeyDown);

  return {
    destroy() {
      node.removeEventListener('keydown', handleKeyDown);
    },
  };
}

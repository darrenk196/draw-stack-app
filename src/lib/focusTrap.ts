/**
 * Focus trap utilities for accessible modal dialogs
 * Ensures keyboard navigation stays within modal when active
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
 * Svelte action for focus trap on modal dialogs
 * Usage: <div use:focusTrap>...</div>
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
 * Svelte action to close modal on backdrop click
 * Only closes if clicking directly on backdrop element
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
 * Svelte action to close modal on Escape key
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

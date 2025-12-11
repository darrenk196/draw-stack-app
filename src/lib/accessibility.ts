/**
 * Accessibility utilities and helpers for Draw Stack
 * Helps ensure WCAG AA compliance throughout the app
 */

/**
 * Skip to main content link - should be first focusable element in layout
 * Usage: Add <a use:skipToMain href="#main-content">Skip to main content</a>
 */
export function skipToMain(element: HTMLAnchorElement) {
  element.addEventListener('click', (e) => {
    e.preventDefault();
    const main = document.querySelector('main') || document.querySelector('[role="main"]');
    if (main) {
      main.focus();
      main.scrollIntoView({ behavior: 'smooth' });
    }
  });

  return {
    destroy() {
      // Cleanup if needed
    },
  };
}

/**
 * Announce screen reader messages
 */
export class ScreenReaderAnnouncer {
  private liveRegion: HTMLDivElement | null = null;

  constructor() {
    this.createLiveRegion();
  }

  private createLiveRegion(): void {
    const region = document.createElement('div');
    region.setAttribute('aria-live', 'polite');
    region.setAttribute('aria-atomic', 'true');
    region.className = 'sr-only';
    region.style.position = 'absolute';
    region.style.width = '1px';
    region.style.height = '1px';
    region.style.padding = '0';
    region.style.margin = '-1px';
    region.style.overflow = 'hidden';
    region.style.clip = 'rect(0,0,0,0)';
    region.style.whiteSpace = 'nowrap';
    region.style.borderWidth = '0';
    document.body.appendChild(region);
    this.liveRegion = region;
  }

  announce(message: string, priority: 'polite' | 'assertive' = 'polite'): void {
    if (this.liveRegion) {
      this.liveRegion.setAttribute('aria-live', priority);
      this.liveRegion.textContent = message;

      // Clear after announcement
      setTimeout(() => {
        if (this.liveRegion) {
          this.liveRegion.textContent = '';
        }
      }, 1000);
    }
  }

  destroy(): void {
    if (this.liveRegion && this.liveRegion.parentNode) {
      this.liveRegion.parentNode.removeChild(this.liveRegion);
      this.liveRegion = null;
    }
  }
}

/**
 * Check if element is visible to screen readers
 */
export function isScreenReaderVisible(element: HTMLElement): boolean {
  if (!element) return false;

  // Check if display: none
  if (getComputedStyle(element).display === 'none') return false;

  // Check if visibility: hidden
  if (getComputedStyle(element).visibility === 'hidden') return false;

  // Check if aria-hidden="true"
  if (element.getAttribute('aria-hidden') === 'true') return false;

  // Check if visually hidden but accessible (sr-only)
  const style = getComputedStyle(element);
  if (
    style.position === 'absolute' &&
    style.width === '1px' &&
    style.height === '1px'
  ) {
    return true; // sr-only is still accessible
  }

  return true;
}

/**
 * Generate accessible table headers
 */
export function getTableAccessibilityProps(
  rowIndex: number,
  colIndex: number,
  isHeader: boolean
): Record<string, string> {
  return {
    role: isHeader ? 'columnheader' : 'cell',
    'aria-rowindex': String(rowIndex + 1),
    'aria-colindex': String(colIndex + 1),
  };
}

/**
 * Accessible button props builder
 */
export function getButtonAccessibilityProps(
  label: string,
  disabled: boolean = false,
  ariaPressed?: boolean
): Record<string, string | boolean> {
  return {
    'aria-label': label,
    disabled,
    ...(ariaPressed !== undefined && { 'aria-pressed': String(ariaPressed) }),
  };
}

/**
 * Generate accessible list item props
 */
export function getListItemAccessibilityProps(
  index: number,
  total: number
): Record<string, string | number> {
  return {
    role: 'listitem',
    'aria-posinset': index + 1,
    'aria-setsize': total,
  };
}

/**
 * Create accessible dialog overlay attributes
 */
export function getDialogAccessibilityProps(
  title: string,
  describedBy?: string
): Record<string, string> {
  return {
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': `dialog-title-${Date.now()}`,
    ...(describedBy && { 'aria-describedby': describedBy }),
  };
}

/**
 * Validate color contrast ratio (WCAG compliance)
 * Returns true if contrast meets WCAG AA standards (4.5:1 for normal text)
 */
export function validateContrast(
  color1: string,
  color2: string,
  minRatio: number = 4.5
): boolean {
  const luminance1 = getLuminance(hexToRgb(color1));
  const luminance2 = getLuminance(hexToRgb(color2));

  const lighter = Math.max(luminance1, luminance2);
  const darker = Math.min(luminance1, luminance2);

  const ratio = (lighter + 0.05) / (darker + 0.05);
  return ratio >= minRatio;
}

/**
 * Helper: Convert hex color to RGB
 */
function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16),
      ]
    : [0, 0, 0];
}

/**
 * Helper: Calculate relative luminance
 */
function getLuminance([r, g, b]: [number, number, number]): number {
  const [rs, gs, bs] = [r, g, b].map(x => {
    x = x / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

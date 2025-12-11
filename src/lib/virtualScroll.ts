/**
 * Virtual scrolling utilities for efficient rendering of large lists/grids.
 * Only renders visible items + buffer to improve performance with 10K+ items.
 * Calculates visible range based on scroll position and item heights.
 * 
 * @module virtualScroll
 */

/**
 * Configuration for the virtual scroller.
 */
export interface VirtualScrollerConfig {
  itemHeight: number;
  containerHeight: number;
  bufferSize?: number; // Number of items to render outside viewport
}

/**
 * State representing the current virtual scroll viewport.
 */
export interface VirtualScrollerState {
  /** Starting index of visible items (includes buffer) */
  visibleStart: number;
  /** Ending index of visible items (includes buffer) */
  visibleEnd: number;
  /** Y-axis offset for positioning visible items container */
  offsetY: number;
  /** Total scrollable height for all items */
  scrollableHeight: number;
}

/**
 * Virtual scroller class for calculating visible ranges.
 * Handles scroll position tracking and visible range calculations.
 * 
 * @example
 * ```typescript
 * const scroller = new VirtualScroller({
 *   itemHeight: 160,
 *   containerHeight: 800,
 *   bufferSize: 3
 * });
 * scroller.setTotalItems(10000);
 * scroller.setScrollTop(1600);
 * const range = scroller.getVisibleRange();
 * ```
 */
export class VirtualScroller {
  private config: Required<VirtualScrollerConfig>;
  private totalItems = 0;
  private scrollTop = 0;

  /**
   * Creates a new virtual scroller instance.
   * 
   * @param config - Virtual scroller configuration
   */
  constructor(config: VirtualScrollerConfig) {
    this.config = {
      ...config,
      bufferSize: config.bufferSize || 3,
    };
  }

  /**
   * Updates the total number of items in the list.
   * 
   * @param count - Total number of items
   */
  setTotalItems(count: number): void {
    this.totalItems = count;
  }

  /**
   * Updates the current scroll position.
   * 
   * @param scrollTop - Current scroll top value in pixels
   */
  setScrollTop(scrollTop: number): void {
    this.scrollTop = Math.max(0, scrollTop);
  }

  /**
   * Calculates the visible range of items including buffer.
   * 
   * @returns State object with visible indices, offset, and scrollable height
   */
  getVisibleRange(): VirtualScrollerState {
    const visibleItemsInViewport = Math.ceil(
      this.config.containerHeight / this.config.itemHeight
    );

    // Calculate index based on scroll position
    const startIndex = Math.floor(
      this.scrollTop / this.config.itemHeight
    );

    // Add buffer on both sides
    const bufferedStart = Math.max(
      0,
      startIndex - this.config.bufferSize
    );
    const bufferedEnd = Math.min(
      this.totalItems,
      startIndex + visibleItemsInViewport + this.config.bufferSize
    );

    return {
      visibleStart: bufferedStart,
      visibleEnd: bufferedEnd,
      offsetY: bufferedStart * this.config.itemHeight,
      scrollableHeight: this.totalItems * this.config.itemHeight,
    };
  }

  /**
   * Slices the full items array to only the visible range.
   * 
   * @param items - Full array of items
   * @returns Subset of items that should be rendered
   */
  getVisibleItems<T>(items: T[]): T[] {
    const range = this.getVisibleRange();
    return items.slice(range.visibleStart, range.visibleEnd);
  }
}

/**
 * Svelte action for virtual scrolling.
 * Automatically calculates visible range on scroll and calls onScroll callback.
 * 
 * @param node - The scrollable container element
 * @param options - Virtual scroll configuration
 * @param options.totalItems - Total number of items in the list
 * @param options.itemHeight - Height of each item in pixels
 * @param options.containerHeight - Height of the scrollable container in pixels
 * @param options.bufferSize - Number of items to render outside viewport (default: 3)
 * @param options.onScroll - Callback with visible start/end indices
 * @returns Svelte action object with update and destroy methods
 * 
 * @example
 * ```svelte
 * <div
 *   use:virtualScroll={{
 *     totalItems: images.length,
 *     itemHeight: 160,
 *     containerHeight: 800,
 *     bufferSize: 3,
 *     onScroll: (start, end) => { visibleRange = { start, end }; }
 *   }}
 * >
 *   <!-- Visible items -->
 * </div>
 * ```
 */
export function virtualScroll(
  node: HTMLElement,
  {
    totalItems,
    itemHeight,
    containerHeight,
    onScroll,
    bufferSize = 3,
  }: {
    totalItems: number;
    itemHeight: number;
    containerHeight: number;
    bufferSize?: number;
    onScroll: (start: number, end: number) => void;
  }
) {
  const scroller = new VirtualScroller({
    itemHeight,
    containerHeight,
    bufferSize,
  });

  scroller.setTotalItems(totalItems);

  const handleScroll = (event: Event) => {
    const target = event.target as HTMLElement;
    scroller.setScrollTop(target.scrollTop);
    const range = scroller.getVisibleRange();
    onScroll(range.visibleStart, range.visibleEnd);
  };

  node.addEventListener('scroll', handleScroll);

  return {
    update({
      totalItems: newTotal,
      itemHeight: newHeight,
      containerHeight: newContainer,
    }: {
      totalItems: number;
      itemHeight: number;
      containerHeight: number;
    }) {
      scroller.setTotalItems(newTotal);
      if (newHeight !== itemHeight || newContainer !== containerHeight) {
        // Config changed, may need to recalculate
        const range = scroller.getVisibleRange();
        onScroll(range.visibleStart, range.visibleEnd);
      }
    },
    destroy() {
      node.removeEventListener('scroll', handleScroll);
    },
  };
}

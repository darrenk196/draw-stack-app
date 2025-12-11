/**
 * Virtual scrolling utilities for efficient rendering of large lists/grids
 * Only renders visible items to improve performance
 */

export interface VirtualScrollerConfig {
  itemHeight: number;
  containerHeight: number;
  bufferSize?: number; // Number of items to render outside viewport
}

export interface VirtualScrollerState {
  visibleStart: number;
  visibleEnd: number;
  offsetY: number;
  scrollableHeight: number;
}

export class VirtualScroller {
  private config: Required<VirtualScrollerConfig>;
  private totalItems = 0;
  private scrollTop = 0;

  constructor(config: VirtualScrollerConfig) {
    this.config = {
      ...config,
      bufferSize: config.bufferSize || 3,
    };
  }

  /**
   * Update total items
   */
  setTotalItems(count: number): void {
    this.totalItems = count;
  }

  /**
   * Update scroll position
   */
  setScrollTop(scrollTop: number): void {
    this.scrollTop = Math.max(0, scrollTop);
  }

  /**
   * Get visible range with buffer
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
   * Get items that should be rendered
   */
  getVisibleItems<T>(items: T[]): T[] {
    const range = this.getVisibleRange();
    return items.slice(range.visibleStart, range.visibleEnd);
  }
}

/**
 * Svelte action for virtual scrolling
 * Usage: <div use:virtualScroll={{totalItems: 1000, itemHeight: 200, onScroll}}>
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

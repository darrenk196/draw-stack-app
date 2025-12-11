/**
 * Pagination utilities for large image libraries
 * Implements efficient chunked loading instead of loading all images at once
 */

export interface PaginationState {
  currentPage: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface PaginatedData<T> {
  items: T[];
  pagination: PaginationState;
}

/**
 * Calculate pagination state
 */
export function calculatePagination(
  totalItems: number,
  currentPage: number,
  pageSize: number
): PaginationState {
  const totalPages = Math.ceil(totalItems / pageSize);
  const validPage = Math.min(Math.max(currentPage, 1), totalPages || 1);

  return {
    currentPage: validPage,
    pageSize,
    totalItems,
    totalPages,
  };
}

/**
 * Get items for a specific page
 */
export function paginate<T>(
  items: T[],
  pageNumber: number,
  pageSize: number
): T[] {
  const startIndex = (pageNumber - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  return items.slice(startIndex, endIndex);
}

/**
 * Paginated loader for lazy-loading content
 */
export class PaginatedLoader<T> {
  private allItems: T[] = [];
  private currentPage = 1;
  private pageSize: number;
  private loadCallback: () => Promise<T[]>;

  constructor(pageSize: number, loadCallback: () => Promise<T[]>) {
    this.pageSize = pageSize;
    this.loadCallback = loadCallback;
  }

  /**
   * Initialize by loading all items
   */
  async initialize(): Promise<void> {
    this.allItems = await this.loadCallback();
    this.currentPage = 1;
  }

  /**
   * Get current page of items
   */
  getCurrentPage(): T[] {
    return paginate(this.allItems, this.currentPage, this.pageSize);
  }

  /**
   * Get total count
   */
  getTotalCount(): number {
    return this.allItems.length;
  }

  /**
   * Get pagination state
   */
  getPaginationState(): PaginationState {
    return calculatePagination(
      this.allItems.length,
      this.currentPage,
      this.pageSize
    );
  }

  /**
   * Move to next page
   */
  nextPage(): boolean {
    const state = this.getPaginationState();
    if (this.currentPage < state.totalPages) {
      this.currentPage++;
      return true;
    }
    return false;
  }

  /**
   * Move to previous page
   */
  previousPage(): boolean {
    if (this.currentPage > 1) {
      this.currentPage--;
      return true;
    }
    return false;
  }

  /**
   * Go to specific page
   */
  goToPage(pageNumber: number): boolean {
    const state = this.getPaginationState();
    if (pageNumber >= 1 && pageNumber <= state.totalPages) {
      this.currentPage = pageNumber;
      return true;
    }
    return false;
  }

  /**
   * Reload items
   */
  async reload(): Promise<void> {
    await this.initialize();
  }
}

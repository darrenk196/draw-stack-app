/**
 * Pagination utilities for large image libraries.
 * Implements efficient chunked loading to display manageable subsets of data.
 * Alternative to virtual scrolling for simpler page-based navigation.
 * 
 * @module pagination
 */

/**
 * Represents the current state of pagination.
 */
export interface PaginationState {
  currentPage: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

/**
 * Container for paginated items with pagination metadata.
 * 
 * @template T - Type of items being paginated
 */
export interface PaginatedData<T> {
  /** Items for the current page */
  items: T[];
  /** Pagination state metadata */
  pagination: PaginationState;
}

/**
 * Calculates pagination state including total pages and validated current page.
 * Ensures current page is within valid range [1, totalPages].
 * 
 * @param totalItems - Total number of items to paginate
 * @param currentPage - Requested page number
 * @param pageSize - Number of items per page
 * @returns Validated pagination state
 * 
 * @example
 * ```typescript
 * const state = calculatePagination(150, 2, 20);
 * // { currentPage: 2, pageSize: 20, totalItems: 150, totalPages: 8 }
 * ```
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
 * Slices an array to get items for a specific page.
 * Returns empty array if page number is out of range.
 * 
 * @param items - Full array of items
 * @param pageNumber - Page number (1-indexed)
 * @param pageSize - Number of items per page
 * @returns Array slice for the specified page
 * 
 * @example
 * ```typescript
 * const allImages = [...]; // 100 images
 * const page1 = paginate(allImages, 1, 20); // Images 0-19
 * const page2 = paginate(allImages, 2, 20); // Images 20-39
 * ```
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
 * Paginated loader for managing large datasets with page-based navigation.
 * Loads all items once, then serves them page by page.
 * 
 * @template T - Type of items being paginated
 * 
 * @example
 * ```typescript
 * const loader = new PaginatedLoader(20, async () => await fetchImages());
 * await loader.initialize();
 * const page1 = loader.getCurrentPage();
 * loader.nextPage();
 * const page2 = loader.getCurrentPage();
 * ```
 */
export class PaginatedLoader<T> {
  private allItems: T[] = [];
  private currentPage = 1;
  private pageSize: number;
  private loadCallback: () => Promise<T[]>;

  /**
   * Creates a new paginated loader.
   * 
   * @param pageSize - Number of items per page
   * @param loadCallback - Async function to load all items
   */
  constructor(pageSize: number, loadCallback: () => Promise<T[]>) {
    this.pageSize = pageSize;
    this.loadCallback = loadCallback;
  }

  /**
   * Initializes the loader by fetching all items.
   * Must be called before using other methods.
   */
  async initialize(): Promise<void> {
    this.allItems = await this.loadCallback();
    this.currentPage = 1;
  }

  /**
   * Gets items for the current page.
   * 
   * @returns Array of items for current page
   */
  getCurrentPage(): T[] {
    return paginate(this.allItems, this.currentPage, this.pageSize);
  }

  /**
   * Gets the total number of items.
   * 
   * @returns Total item count
   */
  getTotalCount(): number {
    return this.allItems.length;
  }

  /**
   * Gets the current pagination state.
   * 
   * @returns Pagination metadata
   */
  getPaginationState(): PaginationState {
    return calculatePagination(
      this.allItems.length,
      this.currentPage,
      this.pageSize
    );
  }

  /**
   * Moves to the next page if available.
   * 
   * @returns true if moved to next page, false if already on last page
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
   * Moves to the previous page if available.
   * 
   * @returns true if moved to previous page, false if already on first page
   */
  previousPage(): boolean {
    if (this.currentPage > 1) {
      this.currentPage--;
      return true;
    }
    return false;
  }

  /**
   * Navigates to a specific page number.
   * 
   * @param pageNumber - Target page number (1-indexed)
   * @returns true if navigation succeeded, false if page number is invalid
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
   * Reloads all items by calling the load callback again.
   */
  async reload(): Promise<void> {
    await this.initialize();
  }
}

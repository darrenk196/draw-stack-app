/**
 * Search and debouncing utilities for improved performance.
 * Provides debounce, throttle, caching, batching, and cancellation utilities.
 * 
 * @module search
 */

/**
 * Callback type for debounce and throttle functions.
 */
export type DebounceCallback<T> = (value: T) => void | Promise<void>;

/**
 * Creates a debounced function that delays invoking callback until after delay milliseconds.
 * Useful for search inputs to avoid excessive API calls.
 * 
 * @param callback - Function to debounce
 * @param delay - Delay in milliseconds
 * @returns Debounced function
 * 
 * @example
 * ```typescript
 * const debouncedSearch = debounce((query: string) => {
 *   performSearch(query);
 * }, 300);
 * 
 * input.addEventListener('input', (e) => debouncedSearch(e.target.value));
 * ```
 */
export function debounce<T>(
  callback: DebounceCallback<T>,
  delay: number
): (value: T) => void {
  let timeoutId: number | undefined;

  return (value: T) => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }

    timeoutId = window.setTimeout(() => {
      callback(value);
      timeoutId = undefined;
    }, delay);
  };
}

/**
 * Creates a throttled function that only invokes callback at most once per limit milliseconds.
 * Useful for scroll/resize handlers to limit execution frequency.
 * 
 * @param callback - Function to throttle
 * @param limit - Minimum time between invocations in milliseconds
 * @returns Throttled function
 * 
 * @example
 * ```typescript
 * const throttledScroll = throttle((scrollY: number) => {
 *   updateScrollPosition(scrollY);
 * }, 100);
 * 
 * window.addEventListener('scroll', () => throttledScroll(window.scrollY));
 * ```
 */
export function throttle<T>(
  callback: DebounceCallback<T>,
  limit: number
): (value: T) => void {
  let inThrottle = false;

  return (value: T) => {
    if (!inThrottle) {
      callback(value);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}

/**
 * Simple in-memory cache for search results with time-to-live (TTL).
 * Automatically expires entries after the specified TTL.
 * 
 * @template K - Key type
 * @template V - Value type
 * 
 * @example
 * ```typescript
 * const cache = new SearchCache<string, Image[]>(5 * 60 * 1000); // 5 min TTL
 * cache.set('query', results);
 * const cached = cache.get('query'); // Returns results or null if expired
 * ```
 */
export class SearchCache<K, V> {
  private cache: Map<K, { value: V; timestamp: number }> = new Map();
  private ttl: number; // Time to live in milliseconds

  /**
   * Creates a new search cache.
   * 
   * @param ttlMs - Time to live in milliseconds (default: 5 minutes)
   */
  constructor(ttlMs: number = 5 * 60 * 1000) {
    // Default: 5 minutes
    this.ttl = ttlMs;
  }

  /**
   * Stores a value in the cache.
   * 
   * @param key - Cache key
   * @param value - Value to cache
   */
  set(key: K, value: V): void {
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
    });
  }

  /**
   * Retrieves a value from the cache.
   * Returns null if key doesn't exist or entry is expired.
   * 
   * @param key - Cache key
   * @returns Cached value or null
   */
  get(key: K): V | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check if expired
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  /**
   * Checks if a key exists and is not expired.
   * 
   * @param key - Cache key
   * @returns true if key exists and is valid
   */
  has(key: K): boolean {
    return this.get(key) !== null;
  }

  /**
   * Clears all cached entries.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Removes all expired entries from the cache.
   * Call periodically to prevent memory growth.
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttl) {
        this.cache.delete(key);
      }
    }
  }
}

/**
 * Executes async operations in batches with concurrency control.
 * Processes items in parallel up to the specified concurrency limit.
 * 
 * @param items - Array of items to process
 * @param handler - Async function to process each item
 * @param concurrency - Maximum number of concurrent operations (default: 5)
 * @returns Promise resolving to array of results
 * 
 * @example
 * ```typescript
 * const results = await batchAsync(
 *   imageUrls,
 *   async (url) => await fetchImage(url),
 *   3
 * );
 * ```
 */
export async function batchAsync<T, R>(
  items: T[],
  handler: (item: T) => Promise<R>,
  concurrency: number = 5
): Promise<R[]> {
  const results: R[] = [];
  const executing: Promise<void>[] = [];

  for (const item of items) {
    const promise = handler(item).then(result => {
      results.push(result);
    });

    executing.push(promise);

    if (executing.length >= concurrency) {
      await Promise.race(executing);
      // Remove completed promises
      const completed = await Promise.race(executing.map((p, idx) => p.then(() => idx)));
      executing.splice(completed, 1);
    }
  }

  await Promise.all(executing);
  return results;
}

/**
 * Cancel token for aborting long-running operations.
 * Useful for cancelling previous searches when a new one starts.
 * 
 * @example
 * ```typescript
 * let cancelToken = new CancelToken();
 * 
 * async function search(query: string) {
 *   cancelToken.cancel(); // Cancel previous search
 *   cancelToken = new CancelToken();
 *   
 *   for (const item of largeArray) {
 *     cancelToken.throwIfCancelled();
 *     await processItem(item);
 *   }
 * }
 * ```
 */
export class CancelToken {
  private cancelled = false;

  /**
   * Marks this token as cancelled.
   */
  cancel(): void {
    this.cancelled = true;
  }

  /**
   * Checks if this token has been cancelled.
   * 
   * @returns true if cancelled
   */
  isCancelled(): boolean {
    return this.cancelled;
  }

  /**
   * Throws an error if this token has been cancelled.
   * Use this in loops to abort early.
   * 
   * @throws Error if cancelled
   */
  throwIfCancelled(): void {
    if (this.cancelled) {
      throw new Error('Operation cancelled');
    }
  }
}

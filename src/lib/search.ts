/**
 * Search and debouncing utilities for improved performance
 */

export type DebounceCallback<T> = (value: T) => void | Promise<void>;

/**
 * Create a debounced function
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
 * Create a throttled function
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
 * Simple in-memory cache for search results
 */
export class SearchCache<K, V> {
  private cache: Map<K, { value: V; timestamp: number }> = new Map();
  private ttl: number; // Time to live in milliseconds

  constructor(ttlMs: number = 5 * 60 * 1000) {
    // Default: 5 minutes
    this.ttl = ttlMs;
  }

  set(key: K, value: V): void {
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
    });
  }

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

  has(key: K): boolean {
    return this.get(key) !== null;
  }

  clear(): void {
    this.cache.clear();
  }

  /**
   * Clean up expired entries
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
 * Batch async operations with concurrency control
 */
export async function batchAsync<T, R>(
  items: T[],
  handler: (item: T) => Promise<R>,
  concurrency: number = 5
): Promise<R[]> {
  const results: R[] = [];
  const executing: Promise<R>[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const promise = Promise.resolve().then(() => handler(item));

    executing.push(promise);

    if (executing.length >= concurrency) {
      await Promise.race(executing);
      // Remove completed promises
      executing.splice(
        executing.findIndex(p => p === (await promise)),
        1
      );
    }

    promise.then(result => results.push(result));
  }

  await Promise.all(executing);
  return results;
}

/**
 * Cancel token for long-running operations
 */
export class CancelToken {
  private cancelled = false;

  cancel(): void {
    this.cancelled = true;
  }

  isCancelled(): boolean {
    return this.cancelled;
  }

  throwIfCancelled(): void {
    if (this.cancelled) {
      throw new Error('Operation cancelled');
    }
  }
}

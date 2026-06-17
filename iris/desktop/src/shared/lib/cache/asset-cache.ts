/**
 * Asset Cache System
 * 
 * Two-tier caching for decrypted content:
 * 1. Memory cache (LRU) - Fast access for recently used items
 * 2. IndexedDB - Persistent storage for larger content
 */

const DB_NAME = 'iris-asset-cache';
const DB_VERSION = 1;
const STORE_NAME = 'assets';

// Cache configuration
const MEMORY_CACHE_MAX_SIZE = 50; // Max items in memory
const MEMORY_CACHE_MAX_BYTES = 100 * 1024 * 1024; // 100MB max memory usage
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour (matches server Cache-Control)

interface CacheEntry {
  id: string;
  data: ArrayBuffer;
  mimeType: string;
  size: number;
  timestamp: number;
  blobUrl?: string;
}

interface MemoryCacheEntry extends CacheEntry {
  blobUrl: string;
}

// Memory cache with LRU eviction
class MemoryCache {
  private cache = new Map<string, MemoryCacheEntry>();
  private currentBytes = 0;

  get(id: string): MemoryCacheEntry | undefined {
    const entry = this.cache.get(id);
    if (entry) {
      // Check TTL
      if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
        this.delete(id);
        return undefined;
      }
      // Move to end for LRU
      this.cache.delete(id);
      this.cache.set(id, entry);
    }
    return entry;
  }

  set(id: string, entry: MemoryCacheEntry): void {
    // Remove old entry if exists
    if (this.cache.has(id)) {
      this.delete(id);
    }

    // Evict if necessary
    while (
      (this.cache.size >= MEMORY_CACHE_MAX_SIZE ||
        this.currentBytes + entry.size > MEMORY_CACHE_MAX_BYTES) &&
      this.cache.size > 0
    ) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.delete(oldestKey);
      }
    }

    this.cache.set(id, entry);
    this.currentBytes += entry.size;
  }

  delete(id: string): boolean {
    const entry = this.cache.get(id);
    if (entry) {
      // Revoke blob URL to free memory
      if (entry.blobUrl) {
        URL.revokeObjectURL(entry.blobUrl);
      }
      this.currentBytes -= entry.size;
      return this.cache.delete(id);
    }
    return false;
  }

  clear(): void {
    for (const entry of this.cache.values()) {
      if (entry.blobUrl) {
        URL.revokeObjectURL(entry.blobUrl);
      }
    }
    this.cache.clear();
    this.currentBytes = 0;
  }

  has(id: string): boolean {
    const entry = this.cache.get(id);
    if (entry && Date.now() - entry.timestamp > CACHE_TTL_MS) {
      this.delete(id);
      return false;
    }
    return this.cache.has(id);
  }

  get size(): number {
    return this.cache.size;
  }

  get bytes(): number {
    return this.currentBytes;
  }
}

// IndexedDB wrapper for persistent cache
class IndexedDBCache {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('Failed to open IndexedDB:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });

    return this.initPromise;
  }

  async get(id: string): Promise<CacheEntry | undefined> {
    await this.init();
    if (!this.db) return undefined;

    return new Promise((resolve) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);

      request.onsuccess = () => {
        const entry = request.result as CacheEntry | undefined;
        if (entry && Date.now() - entry.timestamp > CACHE_TTL_MS) {
          // Expired, delete in background
          this.delete(id).catch(console.error);
          resolve(undefined);
        } else {
          resolve(entry);
        }
      };

      request.onerror = () => {
        console.error('IndexedDB get error:', request.error);
        resolve(undefined);
      };
    });
  }

  async set(entry: CacheEntry): Promise<void> {
    await this.init();
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(entry);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async delete(id: string): Promise<void> {
    await this.init();
    if (!this.db) return;

    return new Promise((resolve) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => {
        console.error('IndexedDB delete error:', request.error);
        resolve();
      };
    });
  }

  async clear(): Promise<void> {
    await this.init();
    if (!this.db) return;

    return new Promise((resolve) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => {
        console.error('IndexedDB clear error:', request.error);
        resolve();
      };
    });
  }

  async cleanExpired(): Promise<number> {
    await this.init();
    if (!this.db) return 0;

    const cutoff = Date.now() - CACHE_TTL_MS;
    let deletedCount = 0;

    return new Promise((resolve) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('timestamp');
      const range = IDBKeyRange.upperBound(cutoff);
      const request = index.openCursor(range);

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          cursor.delete();
          deletedCount++;
          cursor.continue();
        }
      };

      transaction.oncomplete = () => resolve(deletedCount);
      transaction.onerror = () => {
        console.error('IndexedDB cleanup error:', transaction.error);
        resolve(deletedCount);
      };
    });
  }
}

// Main Asset Cache class
class AssetCache {
  private memoryCache = new MemoryCache();
  private indexedDBCache = new IndexedDBCache();
  private pendingFetches = new Map<string, Promise<string | null>>();

  /**
   * Get cached blob URL for an asset
   * Returns immediately if in memory, or fetches from IndexedDB/network
   */
  async getBlobUrl(
    assetId: string,
    fetchFn: () => Promise<ArrayBuffer | null>,
    mimeType: string
  ): Promise<string | null> {
    // 1. Check memory cache
    const memoryEntry = this.memoryCache.get(assetId);
    if (memoryEntry) {
      return memoryEntry.blobUrl;
    }

    // 2. Check if already fetching
    const pending = this.pendingFetches.get(assetId);
    if (pending) {
      return pending;
    }

    // 3. Create fetch promise
    const fetchPromise = this.fetchAndCache(assetId, fetchFn, mimeType);
    this.pendingFetches.set(assetId, fetchPromise);

    try {
      return await fetchPromise;
    } finally {
      this.pendingFetches.delete(assetId);
    }
  }

  private async fetchAndCache(
    assetId: string,
    fetchFn: () => Promise<ArrayBuffer | null>,
    mimeType: string
  ): Promise<string | null> {
    // Check IndexedDB
    const dbEntry = await this.indexedDBCache.get(assetId);
    if (dbEntry) {
      const blobUrl = this.createBlobUrl(dbEntry.data, mimeType);
      this.memoryCache.set(assetId, {
        ...dbEntry,
        blobUrl,
      });
      return blobUrl;
    }

    // Fetch from network
    const data = await fetchFn();
    if (!data) return null;

    const entry: CacheEntry = {
      id: assetId,
      data,
      mimeType,
      size: data.byteLength,
      timestamp: Date.now(),
    };

    // Store in IndexedDB (background)
    this.indexedDBCache.set(entry).catch(console.error);

    // Store in memory
    const blobUrl = this.createBlobUrl(data, mimeType);
    this.memoryCache.set(assetId, {
      ...entry,
      blobUrl,
    });

    return blobUrl;
  }

  private createBlobUrl(data: ArrayBuffer, mimeType: string): string {
    const blob = new Blob([data], { type: mimeType });
    return URL.createObjectURL(blob);
  }

  /**
   * Invalidate cache for a specific asset
   */
  async invalidate(assetId: string): Promise<void> {
    this.memoryCache.delete(assetId);
    await this.indexedDBCache.delete(assetId);
  }

  /**
   * Clear all caches
   */
  async clearAll(): Promise<void> {
    this.memoryCache.clear();
    await this.indexedDBCache.clear();
  }

  /**
   * Clean up expired entries
   */
  async cleanup(): Promise<{ memory: number; db: number }> {
    // Memory cache auto-cleans on access
    const dbDeleted = await this.indexedDBCache.cleanExpired();
    return { memory: 0, db: dbDeleted };
  }

  /**
   * Get cache statistics
   */
  getStats(): { memoryItems: number; memoryBytes: number } {
    return {
      memoryItems: this.memoryCache.size,
      memoryBytes: this.memoryCache.bytes,
    };
  }
}

// Singleton instance
export const assetCache = new AssetCache();

// Cleanup expired entries periodically (every 10 minutes)
let cleanupIntervalId: ReturnType<typeof setInterval> | null = null;

if (typeof window !== 'undefined') {
  cleanupIntervalId = setInterval(() => {
    assetCache.cleanup().catch(console.error);
  }, 10 * 60 * 1000);

  // Clear interval when the page is unloaded to prevent leaks
  window.addEventListener('beforeunload', () => {
    if (cleanupIntervalId !== null) {
      clearInterval(cleanupIntervalId);
      cleanupIntervalId = null;
    }
  });
}

/** Stop the periodic cache cleanup. Useful for testing or manual lifecycle control. */
export function stopCacheCleanup(): void {
  if (cleanupIntervalId !== null) {
    clearInterval(cleanupIntervalId);
    cleanupIntervalId = null;
  }
}

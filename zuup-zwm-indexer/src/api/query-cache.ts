/**
 * TTL-based LRU cache for hot GraphQL/REST queries.
 *
 * Reduces Neo4j load for frequently-read, infrequently-written data
 * (worldState, compositeRisk, fullWorldState, activeObjectives).
 *
 * Writers call invalidate(entityId) after successful writes so the
 * next read gets fresh data instead of a stale cached response.
 */

interface CacheEntry<V> {
  value: V;
  expiresAt: number;
}

export class QueryCache {
  private readonly store = new Map<string, CacheEntry<unknown>>();
  private readonly maxSize: number;
  private readonly defaultTtlMs: number;

  // Stats
  private _hits = 0;
  private _misses = 0;

  constructor(maxSize = 1000, defaultTtlMs = 5_000) {
    this.maxSize = maxSize;
    this.defaultTtlMs = defaultTtlMs;
  }

  /** Get a cached value. Returns undefined on miss or expired entry. */
  get<V>(key: string): V | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      this._misses++;
      return undefined;
    }
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this._misses++;
      return undefined;
    }
    // Move to end (LRU refresh)
    this.store.delete(key);
    this.store.set(key, entry);
    this._hits++;
    return entry.value as V;
  }

  /** Set a cached value with optional custom TTL. */
  set<V>(key: string, value: V, ttlMs?: number): void {
    // Evict oldest if at capacity
    if (this.store.size >= this.maxSize) {
      const firstKey = this.store.keys().next().value;
      if (firstKey !== undefined) this.store.delete(firstKey);
    }
    this.store.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs),
    });
  }

  /** Invalidate a specific cache key. */
  invalidate(key: string): boolean {
    return this.store.delete(key);
  }

  /** Invalidate all keys that start with the given prefix. */
  invalidateByPrefix(prefix: string): number {
    let count = 0;
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
        count++;
      }
    }
    return count;
  }

  /** Invalidate all cache entries related to a specific entity. */
  invalidateEntity(entityId: string): number {
    return this.invalidateByPrefix(entityId + ':')
         + this.invalidateByPrefix('worldState:' + entityId)
         + this.invalidateByPrefix('fullWorldState:' + entityId)
         + this.invalidateByPrefix('compositeRisk:' + entityId);
  }

  /** Clear all cached entries. */
  clear(): void {
    this.store.clear();
  }

  /** Return cache statistics. */
  stats(): { hits: number; misses: number; size: number; hitRate: string } {
    const total = this._hits + this._misses;
    return {
      hits: this._hits,
      misses: this._misses,
      size: this.store.size,
      hitRate: total > 0 ? ((this._hits / total) * 100).toFixed(1) + '%' : '0%',
    };
  }
}

/** Singleton cache instance shared across GraphQL and REST APIs. */
export const queryCache = new QueryCache(
  parseInt(process.env['CACHE_MAX_SIZE'] ?? '1000', 10),
  parseInt(process.env['CACHE_TTL_MS'] ?? '5000', 10),
);

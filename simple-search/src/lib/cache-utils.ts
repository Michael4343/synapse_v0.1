/**
 * Simple caching utilities with TTL support and graceful fallbacks
 */

export interface CachedData<T> {
  data: T
  timestamp: number
  version: string
}

const CACHE_VERSION = '1.0.0'

/**
 * Generic localStorage cache with TTL
 */
export function setCachedData<T>(key: string, data: T, ttlMs: number): void {
  try {
    const cached: CachedData<T> = {
      data,
      timestamp: Date.now(),
      version: CACHE_VERSION
    }
    localStorage.setItem(key, JSON.stringify(cached))
  } catch (error) {
    console.warn(`Failed to cache data for key ${key}:`, error)
  }
}

export function getCachedData<T>(key: string, ttlMs: number): T | null {
  try {
    const item = localStorage.getItem(key)
    if (!item) return null

    const cached: CachedData<T> = JSON.parse(item)

    // Version check
    if (cached.version !== CACHE_VERSION) {
      localStorage.removeItem(key)
      return null
    }

    // TTL check
    if (Date.now() - cached.timestamp > ttlMs) {
      localStorage.removeItem(key)
      return null
    }

    return cached.data
  } catch (error) {
    console.warn(`Failed to retrieve cached data for key ${key}:`, error)
    // Clean up corrupted cache
    try {
      localStorage.removeItem(key)
    } catch {}
    return null
  }
}

export function isCacheStale(key: string, ttlMs: number): boolean {
  try {
    const item = localStorage.getItem(key)
    if (!item) return true

    const cached: CachedData<any> = JSON.parse(item)
    return Date.now() - cached.timestamp > ttlMs
  } catch {
    return true
  }
}

export function clearCachedData(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch (error) {
    console.warn(`Failed to clear cached data for key ${key}:`, error)
  }
}

// Personal feed specific constants
export const PERSONAL_FEED_CACHE_KEY = 'evidentia-personal-feed'
export const PERSONAL_FEED_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours
export const LIST_METADATA_CACHE_KEY = 'evidentia-list-metadata'
export const LIST_METADATA_TTL_MS = 30 * 60 * 1000 // 30 minutes
export const LIST_ITEMS_CACHE_KEY = 'evidentia-list-items'
export const LIST_ITEMS_TTL_MS = 10 * 60 * 1000 // 10 minutes
/**
 * Simple caching utilities for basic localStorage caching
 */

export interface CachedData<T> {
  data: T
  timestamp: number
}

/**
 * Simple localStorage cache with 30-minute TTL
 */
export function setCachedData<T>(key: string, data: T): void {
  try {
    const cached: CachedData<T> = {
      data,
      timestamp: Date.now()
    }
    localStorage.setItem(key, JSON.stringify(cached))
  } catch (error) {
    console.warn(`Failed to cache data for key ${key}:`, error)
  }
}

export function getCachedData<T>(key: string, ttlMs?: number): T | null {
  try {
    const item = localStorage.getItem(key)
    if (!item) return null

    const cached: CachedData<T> = JSON.parse(item)

    // Use provided TTL or default to 30 minutes
    const cacheExpiryMs = ttlMs || (30 * 60 * 1000)
    if (Date.now() - cached.timestamp > cacheExpiryMs) {
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

export function clearCachedData(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch (error) {
    console.warn(`Failed to clear cached data for key ${key}:`, error)
  }
}

// Cache TTL constants
export const PERSONAL_FEED_TTL_MS = 1000 * 60 * 60 * 24 * 7 // 7 days; scheduling logic gates refreshes

// Simple cache keys
export const PERSONAL_FEED_CACHE_KEY = 'evidentia-personal-feed'
export const LIST_METADATA_CACHE_KEY = 'evidentia-list-metadata'
export const LIST_ITEMS_CACHE_KEY = 'evidentia-list-items'

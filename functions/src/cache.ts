import NodeCache from 'node-cache';

/**
 * Cache configuration for different data types
 */
const cacheConfig = {
    statistics: {
        stdTTL: 300, // 5 minutes
        checkperiod: 60
    },
    search: {
        stdTTL: 60, // 1 minute
        checkperiod: 30
    },
    eventConfig: {
        stdTTL: 600, // 10 minutes
        checkperiod: 120
    }
};

// Create cache instances
export const statisticsCache = new NodeCache(cacheConfig.statistics);
export const searchCache = new NodeCache(cacheConfig.search);
export const eventConfigCache = new NodeCache(cacheConfig.eventConfig);

/**
 * Generate cache key for event statistics
 */
export function getStatisticsCacheKey(eventId: string): string {
    return `stats_${eventId}`;
}

/**
 * Generate cache key for search results
 */
export function getSearchCacheKey(eventId: string, query: string): string {
    return `search_${eventId}_${query.toLowerCase()}`;
}

/**
 * Generate cache key for event configuration
 */
export function getEventConfigCacheKey(eventId: string): string {
    return `event_config_${eventId}`;
}

/**
 * Clear all caches (useful for testing or manual invalidation)
 */
export function clearAllCaches(): void {
    statisticsCache.flushAll();
    searchCache.flushAll();
    eventConfigCache.flushAll();
}


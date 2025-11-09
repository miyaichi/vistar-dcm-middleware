const NodeCache = require('node-cache');
const logger = require('../utils/logger');

const DEFAULT_TTL = parseInt(process.env.CACHE_TTL_SECONDS, 10) || 60;
const MAX_ENTRIES = Math.max(parseInt(process.env.CACHE_MAX_ENTRIES, 10) || 100, 0);

const cache = new NodeCache({
  stdTTL: DEFAULT_TTL,
  checkperiod: Math.max(1, Math.floor(DEFAULT_TTL / 2))
});

const adCacheKey = (placementId) => `ad:${placementId}`;

const getCachedAd = (placementId) => cache.get(adCacheKey(placementId));

const enforceMaxEntries = () => {
  if (!MAX_ENTRIES) {
    return;
  }

  const keys = cache.keys();

  if (keys.length <= MAX_ENTRIES) {
    return;
  }

  const overflow = keys.length - MAX_ENTRIES;
  const keysToEvict = keys.slice(0, overflow);
  cache.del(keysToEvict);

  logger.warn('Evicted cache entries due to max size', {
    overflow,
    maxEntries: MAX_ENTRIES,
    evictedKeys: keysToEvict.length
  });
};

const setCachedAd = (placementId, payload, ttl = DEFAULT_TTL) => {
  cache.set(adCacheKey(placementId), payload, ttl);
  enforceMaxEntries();
  logger.debug('Cached stub ad payload', { placementId, ttl });
  return payload;
};

const invalidateAd = (placementId) => cache.del(adCacheKey(placementId));

const clearCache = () => cache.flushAll();

const getStatus = () => {
  const stats = cache.getStats();

  return {
    keys: cache.keys(),
    hits: stats.hits,
    misses: stats.misses,
    size: stats.keys,
    ksize: stats.ksize,
    vsize: stats.vsize,
    defaultTtl: DEFAULT_TTL,
    maxEntries: MAX_ENTRIES
  };
};

module.exports = {
  getCachedAd,
  setCachedAd,
  invalidateAd,
  clearCache,
  getStatus
};

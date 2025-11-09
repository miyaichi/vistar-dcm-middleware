const NodeCache = require('node-cache');
const logger = require('../utils/logger');

const DEFAULT_TTL = parseInt(process.env.CACHE_TTL_SECONDS, 10) || 60;

const cache = new NodeCache({
  stdTTL: DEFAULT_TTL,
  checkperiod: Math.max(1, Math.floor(DEFAULT_TTL / 2))
});

const adCacheKey = (placementId) => `ad:${placementId}`;

const getCachedAd = (placementId) => cache.get(adCacheKey(placementId));

const setCachedAd = (placementId, payload, ttl = DEFAULT_TTL) => {
  cache.set(adCacheKey(placementId), payload, ttl);
  logger.debug('Cached stub ad payload', { placementId, ttl });
  return payload;
};

const getStatus = () => {
  const stats = cache.getStats();

  return {
    keys: cache.keys(),
    hits: stats.hits,
    misses: stats.misses,
    ksize: stats.ksize,
    vsize: stats.vsize,
    defaultTtl: DEFAULT_TTL
  };
};

module.exports = {
  getCachedAd,
  setCachedAd,
  getStatus
};

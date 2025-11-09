const logger = require('../utils/logger');
const cacheManager = require('../services/cacheManager');
const { recordAdRequest, recordCacheHit, recordCacheMiss } = require('./metrics');

const stubCreativePayload = (placementId) => {
  const ttlSeconds = parseInt(process.env.CACHE_TTL_SECONDS, 10) || 60;

  return {
    placementId,
    html: `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#111;color:#fff;font-family:sans-serif;">
      <div>
        <p style="margin:0;font-size:24px;text-align:center;">Vistar DCM Middleware</p>
        <small style="display:block;text-align:center;margin-top:8px;">Stub creative for ${placementId}</small>
      </div>
    </div>`,
    ttlSeconds,
    fetchedAt: new Date().toISOString(),
    vistarEnvironment: process.env.VISTAR_ENVIRONMENT || 'staging',
    note: 'Replace this stub with the actual Vistar Media payload.'
  };
};

const handleAdRequest = async (req, res, next) => {
  try {
    const { placementId = 'demo-placement' } = req.query;
    const cached = cacheManager.getCachedAd(placementId);

    if (cached) {
      logger.debug('Serving stub ad payload from cache', { placementId });
      recordAdRequest();
      recordCacheHit();
      return res.json({
        source: 'cache',
        payload: cached
      });
    }

    const payload = stubCreativePayload(placementId);
    cacheManager.setCachedAd(placementId, payload, payload.ttlSeconds);

    recordAdRequest();
    recordCacheMiss();

    res.json({
      source: 'stub',
      payload,
      message: 'Stub response. Integrate with Vistar Media API to fetch live creatives.'
    });
  } catch (error) {
    logger.error('Failed to handle ad request', { error: error.message });
    next(error);
  }
};

module.exports = {
  handleAdRequest
};

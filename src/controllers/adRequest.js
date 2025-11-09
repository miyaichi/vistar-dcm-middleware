const logger = require('../utils/logger');
const cacheManager = require('../services/cacheManager');
const vistarClient = require('../clients/vistarClient');
const {
  recordAdRequest,
  recordCacheHit,
  recordCacheMiss,
  recordVistarSuccess,
  recordVistarFailure
} = require('./metrics');

const useMockPayload = () => process.env.MOCK_VISTAR_API !== 'false';

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
  const mockMode = useMockPayload();

  try {
    const {
      placementId = 'demo-placement',
      deviceId,
      venueId,
      playerModel
    } = req.query;
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

    const payloadSource = mockMode ? 'stub' : 'vistar';
    const payload = mockMode
      ? stubCreativePayload(placementId)
      : await vistarClient.fetchAd({
          placementId,
          deviceId,
          venueId,
          playerModel
        });

    cacheManager.setCachedAd(placementId, payload, payload.ttlSeconds || 60);

    recordAdRequest();
    recordCacheMiss();

    if (!mockMode) {
      recordVistarSuccess();
    }

    res.json({
      source: payloadSource,
      payload,
      message: payloadSource === 'stub'
        ? 'Stub response. Integrate with Vistar Media API to fetch live creatives.'
        : 'Vistar API response'
    });
  } catch (error) {
    logger.error('Failed to handle ad request', { error: error.message });

    if (!mockMode) {
      recordVistarFailure();
    }

    next(error);
  }
};

module.exports = {
  handleAdRequest
};

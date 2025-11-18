const logger = require('../utils/logger');
const cacheManager = require('../services/cacheManager');
const creativeCacheService = require('../services/creativeCacheService');
const vistarClient = require('../clients/vistarClient');
const { renderAdHtml } = require('../utils/htmlRenderer');
const {
  recordAdRequest,
  recordCacheHit,
  recordCacheMiss,
  recordVistarSuccess,
  recordVistarFailure
} = require('./metrics');

const useMockPayload = () => process.env.MOCK_VISTAR_API !== 'false';

const parseInteger = (value, fallback) => {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

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

const resolveLeaseTtl = (payload) => {
  if (!payload?.advertisement?.length) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  const leaseDurations = payload.advertisement
    .map((ad) => (typeof ad.lease_expiry === 'number' ? ad.lease_expiry - now : null))
    .filter((value) => typeof value === 'number' && value > 0)
    .map((value) => Math.floor(value));

  if (!leaseDurations.length) {
    return null;
  }

  return Math.max(Math.min(...leaseDurations), 30);
};

const determineCacheTtl = (payload) =>
  payload?.ttlSeconds ||
  resolveLeaseTtl(payload) ||
  parseInteger(process.env.CACHE_TTL_SECONDS, 60);

const resolveResponseFormat = (req) => {
  const format = (req.query.format || '').toLowerCase();

  if (format === 'json') {
    return 'json';
  }

  if (format === 'html') {
    return 'html';
  }

  const accepts = req.get('accept') || '';
  if (accepts.includes('application/json') && !accepts.includes('text/html')) {
    return 'json';
  }

  return 'html';
};

const selectAd = (payload) => {
  if (!payload?.advertisement?.length) {
    return null;
  }

  return payload.advertisement[0];
};

const renderStubDocument = (innerHtml) => `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vistar DCM Middleware Stub</title>
    <style>
      html, body {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
        background: #000;
      }
    </style>
  </head>
  <body>
    ${innerHtml}
  </body>
</html>`;

const handleAdRequest = async (req, res, next) => {
  const mockMode = useMockPayload();
  const responseFormat = resolveResponseFormat(req);

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

      if (responseFormat === 'json') {
        return res.json({
          source: 'cache',
          payload: cached
        });
      }

      if (mockMode) {
        return res.type('html').send(renderStubDocument(cached.html));
      }

      const cachedAd = selectAd(cached);
      const assetUrl = cachedAd
        ? creativeCacheService.getPublicAssetPath(cachedAd.asset_url) || cachedAd.asset_url
        : null;

      return res
        .type('html')
        .send(
          renderAdHtml({
            ad: cachedAd,
            placementId,
            assetUrl,
            environment: process.env.VISTAR_ENVIRONMENT || 'staging'
          })
        );
    }

    const payloadSource = mockMode ? 'stub' : 'vistar';
    let payload = mockMode
      ? stubCreativePayload(placementId)
      : await vistarClient.fetchAd({
          placementId,
          deviceId,
          venueId,
          playerModel
        });

    if (!mockMode) {
      payload = await creativeCacheService.processAdPayload(payload);
    }

    cacheManager.setCachedAd(placementId, payload, determineCacheTtl(payload));

    recordAdRequest();
    recordCacheMiss();

    if (!mockMode) {
      recordVistarSuccess();
    }

    if (responseFormat === 'json') {
      return res.json({
        source: payloadSource,
        payload,
        message: payloadSource === 'stub'
          ? 'Stub response. Integrate with Vistar Media API to fetch live creatives.'
          : 'Vistar API response'
      });
    }

    if (payloadSource === 'stub') {
      return res.type('html').send(renderStubDocument(payload.html));
    }

    const ad = selectAd(payload);
    const assetUrl = ad
      ? creativeCacheService.getPublicAssetPath(ad.asset_url) || ad.asset_url
      : null;

    return res
      .type('html')
      .send(
        renderAdHtml({
          ad,
          placementId,
          assetUrl,
          environment: process.env.VISTAR_ENVIRONMENT || 'staging'
        })
      );
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

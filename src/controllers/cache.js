const cacheManager = require('../services/cacheManager');
const creativeCacheService = require('../services/creativeCacheService');

const ensurePlacementId = (value) => {
  if (!value || typeof value !== 'string' || !value.trim()) {
    return { error: 'placementId is required' };
  }

  if (value.trim().length > 128) {
    return { error: 'placementId must be 128 characters or fewer' };
  }

  return { value: value.trim() };
};

const status = (req, res) => {
  res.json({
    ...cacheManager.getStatus(),
    creativeCache: creativeCacheService.getStatus()
  });
};

const invalidateEntry = (req, res) => {
  const { placementId } = req.body || {};
  const validation = ensurePlacementId(placementId);

  if (validation.error) {
    return res.status(400).json({
      error: 'Bad Request',
      message: validation.error
    });
  }

  const removedCount = cacheManager.invalidateAd(validation.value);

  return res.json({
    placementId: validation.value,
    removed: Boolean(removedCount)
  });
};

const clearAll = (req, res) => {
  cacheManager.clearCache();

  res.json({
    cleared: true,
    timestamp: new Date().toISOString()
  });
};

module.exports = {
  status,
  invalidateEntry,
  clearAll
};

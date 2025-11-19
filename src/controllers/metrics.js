const client = require('prom-client');

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const adRequestCounter = new client.Counter({
  name: 'vistar_stub_ad_requests_total',
  help: 'Total stub ad requests served',
  registers: [register]
});

const cacheHitCounter = new client.Counter({
  name: 'vistar_stub_cache_hits_total',
  help: 'Number of ad responses served from cache',
  registers: [register]
});

const cacheMissCounter = new client.Counter({
  name: 'vistar_stub_cache_misses_total',
  help: 'Number of ad responses requiring fresh generation',
  registers: [register]
});

const proofOfPlayCounter = new client.Counter({
  name: 'vistar_stub_pop_callbacks_total',
  help: 'Total proof-of-play callbacks received',
  registers: [register]
});

const vistarApiSuccessCounter = new client.Counter({
  name: 'vistar_api_success_total',
  help: 'Successful calls to Vistar API',
  registers: [register]
});

const vistarApiFailureCounter = new client.Counter({
  name: 'vistar_api_failure_total',
  help: 'Failed calls to Vistar API',
  registers: [register]
});

const creativeWarmupCounter = new client.Counter({
  name: 'vistar_cache_warmups_total',
  help: 'Creative cache warmup attempts',
  labelNames: ['result'],
  registers: [register]
});

const creativeAssetsCachedCounter = new client.Counter({
  name: 'vistar_cache_assets_cached_total',
  help: 'Number of creatives cached via warmup',
  registers: [register]
});

const creativeCacheFilesGauge = new client.Gauge({
  name: 'vistar_cache_files',
  help: 'Number of files stored in the creative cache',
  registers: [register]
});

const creativeCacheBytesGauge = new client.Gauge({
  name: 'vistar_cache_bytes',
  help: 'Total bytes stored in the creative cache',
  registers: [register]
});

const recordAdRequest = () => adRequestCounter.inc();
const recordCacheHit = () => cacheHitCounter.inc();
const recordCacheMiss = () => cacheMissCounter.inc();
const recordProofOfPlay = () => proofOfPlayCounter.inc();
const recordVistarSuccess = () => vistarApiSuccessCounter.inc();
const recordVistarFailure = () => vistarApiFailureCounter.inc();
const recordCreativeWarmup = (result = 'success') => creativeWarmupCounter.inc({ result });
const recordCreativeAssetsCached = (count = 0) => {
  if (count > 0) {
    creativeAssetsCachedCounter.inc(count);
  }
};
const updateCreativeCacheStats = ({ files = 0, totalBytes = 0 } = {}) => {
  creativeCacheFilesGauge.set(files);
  creativeCacheBytesGauge.set(totalBytes);
};

const getMetrics = async (req, res, next) => {
  try {
    res.set('Content-Type', register.contentType);
    const metrics = await register.metrics();
    res.send(metrics);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getMetrics,
  recordAdRequest,
  recordCacheHit,
  recordCacheMiss,
  recordProofOfPlay,
  recordVistarSuccess,
  recordVistarFailure,
  recordCreativeWarmup,
  recordCreativeAssetsCached,
  updateCreativeCacheStats
};

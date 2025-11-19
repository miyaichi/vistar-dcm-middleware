const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const logger = require('../utils/logger');
const vistarClient = require('../clients/vistarClient');
const {
  recordCreativeWarmup,
  recordCreativeAssetsCached,
  updateCreativeCacheStats
} = require('../controllers/metrics');

const bytesPerUnit = {
  KB: 1024,
  MB: 1024 * 1024,
  GB: 1024 * 1024 * 1024,
  TB: 1024 * 1024 * 1024 * 1024
};

const parseInteger = (value, fallback) => {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const parseSizeString = (value) => {
  if (!value || typeof value !== 'string') {
    return 0;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return 0;
  }

  const numeric = Number(trimmed);
  if (Number.isFinite(numeric)) {
    return numeric;
  }

  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*(KB|MB|GB|TB)$/i);
  if (!match) {
    return 0;
  }

  const amount = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  const multiplier = bytesPerUnit[unit];
  return Math.floor(amount * multiplier);
};

const resolveString = (value, fallback) => {
  if (value && typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  if (fallback && typeof fallback === 'string' && fallback.trim()) {
    return fallback.trim();
  }
  return null;
};

const ensureFetch = () => {
  if (typeof fetch === 'function') {
    return fetch;
  }

  return (...args) =>
    import('node-fetch').then(({ default: nodeFetch }) => nodeFetch(...args));
};

class CreativeCacheService {
  constructor() {
    const defaultEnabled = process.env.NODE_ENV !== 'test';
    const requested = process.env.CACHE_ENABLED;
    const requestedEnabled = requested == null ? defaultEnabled : requested !== 'false';

    this.enabled = requestedEnabled && process.env.MOCK_VISTAR_API === 'false';
    this.defaults = this.resolveDefaults();
    this.cacheDir = path.resolve(
      resolveString(
        process.env.CACHE_DIR,
        path.join(process.cwd(), '.cache', 'vistar', 'creatives')
      )
    );
    this.indexFile = path.join(this.cacheDir, 'index.json');
    this.updateInterval = Math.max(parseInteger(process.env.CACHE_UPDATE_INTERVAL, 3600000), 0);
    this.cleanupInterval = Math.max(parseInteger(process.env.CACHE_CLEANUP_INTERVAL, 86400000), 0);
    this.maxBytes = Math.max(parseSizeString(process.env.CACHE_MAX_SIZE), 0);
    this.records = new Map();
    this.inFlightDownloads = new Map();
    this.readyPromise = null;
    this.updateTimer = null;
    this.cleanupTimer = null;
    this.started = false;
    this.totalBytes = 0;
    this.lastUpdate = null;
    this.lastError = null;
    this.updateInProgress = false;
    this.targets = this.parseWarmTargets();
    this.fetchImpl = ensureFetch();
  }

  resolveDefaults() {
    return {
      placementId:
        resolveString(process.env.CACHE_DEFAULT_PLACEMENT_ID, null) ||
        resolveString(process.env.DEFAULT_CACHE_PLACEMENT_ID, null) ||
        'creative-cache-default',
      venueId:
        resolveString(process.env.CACHE_DEFAULT_VENUE_ID, null) ||
        resolveString(process.env.DEFAULT_VENUE_ID, null) ||
        resolveString(process.env.TEST_VENUE_ID, null) ||
        null,
      deviceId:
        resolveString(process.env.CACHE_DEFAULT_DEVICE_ID, null) ||
        resolveString(process.env.DEFAULT_DEVICE_ID, null) ||
        resolveString(process.env.TEST_DEVICE_ID, null) ||
        'VistarDisplay0',
      playerModel:
        resolveString(process.env.CACHE_DEFAULT_PLAYER_MODEL, null) ||
        resolveString(process.env.DEFAULT_PLAYER_MODEL, null) ||
        'ME-DEC'
    };
  }

  parseTargetEntry(raw, index = 0, overrides = {}) {
    if (!raw && !overrides.venueId && !overrides.deviceId && !this.defaults.venueId) {
      return null;
    }

    const [placement, venue, device, playerModel] = (raw || '')
      .split(':')
      .map((segment) => (segment && segment.trim()) || undefined);

    const resolvedPlacement = placement || overrides.placementId || `${this.defaults.placementId}-${index + 1}`;
    const resolvedVenue = venue || overrides.venueId || this.defaults.venueId;
    const resolvedDevice = device || overrides.deviceId || this.defaults.deviceId;
    const resolvedPlayer = playerModel || overrides.playerModel || this.defaults.playerModel;

    if (!resolvedVenue || !resolvedDevice) {
      return null;
    }

    return {
      placementId: resolvedPlacement,
      venueId: resolvedVenue,
      deviceId: resolvedDevice,
      playerModel: resolvedPlayer
    };
  }

  parseTargetList(rawList, overrides = {}) {
    if (!rawList || ['disabled', 'none', 'off'].includes(rawList.toLowerCase())) {
      return [];
    }

    return rawList
      .split(',')
      .map((entry, index) => this.parseTargetEntry(entry, index, overrides))
      .filter(Boolean);
  }

  parseWarmTargets() {
    const envTargets = resolveString(process.env.CACHE_WARMUP_TARGETS);

    if (envTargets) {
      return this.parseTargetList(envTargets);
    }

    if (this.defaults.venueId && this.defaults.deviceId) {
      return [
        {
          placementId: this.defaults.placementId,
          venueId: this.defaults.venueId,
          deviceId: this.defaults.deviceId,
          playerModel: this.defaults.playerModel
        }
      ];
    }

    return [];
  }

  async ensureReady() {
    if (!this.enabled) {
      return;
    }

    if (!this.readyPromise) {
      this.readyPromise = this.initialize().catch((error) => {
        this.lastError = error.message;
        logger.error('Creative cache initialization failed', { error: error.message });
        this.readyPromise = null;
        throw error;
      });
    }

    return this.readyPromise;
  }

  async initialize() {
    await fs.mkdir(this.cacheDir, { recursive: true });
    await this.loadIndex();
  }

  async loadIndex() {
    try {
      const raw = await fs.readFile(this.indexFile, 'utf8');
      const parsed = JSON.parse(raw);

      Object.values(parsed).forEach((record) => {
        if (record?.assetUrl && record?.filePath) {
          this.records.set(record.assetUrl, record);
          this.totalBytes += record.size || 0;
        }
      });
    } catch (error) {
      if (error.code !== 'ENOENT') {
        logger.warn('Failed to load creative cache index', { error: error.message });
      }
    }
  }

  async persistIndex() {
    const payload = {};
    this.records.forEach((record, assetUrl) => {
      payload[assetUrl] = record;
    });

    await fs.writeFile(this.indexFile, JSON.stringify(payload, null, 2));
  }

  async start() {
    if (!this.enabled) {
      if (process.env.CACHE_ENABLED === 'true' && process.env.MOCK_VISTAR_API !== 'false') {
        logger.warn('Creative cache requested but disabled because MOCK_VISTAR_API is not false');
      }
      return;
    }

    if (this.started) {
      return;
    }

    await this.ensureReady();

    if (!this.targets.length) {
      logger.warn('Creative cache enabled but no warm targets configured');
    }

    this.started = true;
    this.runUpdateCycle().catch((error) => {
      logger.warn('Initial creative cache update failed', { error: error.message });
    });

    if (this.updateInterval > 0) {
      this.updateTimer = setInterval(() => {
        this.runUpdateCycle().catch((error) => {
          logger.warn('Creative cache update failed', { error: error.message });
          this.lastError = error.message;
        });
      }, this.updateInterval);

      if (this.updateTimer.unref) {
        this.updateTimer.unref();
      }
    }

    if (this.cleanupInterval > 0) {
      this.cleanupTimer = setInterval(() => {
        this.cleanupStaleEntries().catch((error) => {
          logger.warn('Creative cache cleanup failed', { error: error.message });
        });
      }, this.cleanupInterval);

      if (this.cleanupTimer.unref) {
        this.cleanupTimer.unref();
      }
    }
  }

  async stop() {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.started = false;
  }

  async runUpdateCycle() {
    if (!this.enabled || !this.targets.length || this.updateInProgress) {
      return;
    }

    this.updateInProgress = true;

    try {
      await this.warmTargets(this.targets);
      this.lastError = null;
    } catch (error) {
      this.lastError = error.message;
      logger.warn('Creative cache target update failed', { error: error.message });
    } finally {
      this.updateInProgress = false;
      await this.cleanupStaleEntries();
    }
  }

  async fetchAndCacheTarget(target) {
    const response = await vistarClient.fetchCreativeAssets(target);
    const ads = Array.isArray(response?.advertisement) ? response.advertisement : [];

    if (ads.length) {
      await this.cacheAdvertisements(ads);
      recordCreativeAssetsCached(ads.length);
    } else {
      logger.info('Creative cache warmup returned no creatives', target);
    }
  }

  async warmTargets(targets = []) {
    if (!this.enabled) {
      logger.warn('Creative cache disabled; skipping warmup');
      return;
    }

    const effectiveTargets = targets.length ? targets : this.targets;

    if (!effectiveTargets.length) {
      logger.warn('Creative cache warmup skipped (no targets configured)');
      return;
    }

    await this.ensureReady();

    for (const target of effectiveTargets) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await this.fetchAndCacheTarget(target);
        recordCreativeWarmup('success');
      } catch (error) {
        recordCreativeWarmup('failure');
        logger.warn('Creative cache warmup failed for target', {
          target,
          error: error.message
        });
      }
    }

    this.lastUpdate = new Date().toISOString();
    updateCreativeCacheStats({
      files: this.records.size,
      totalBytes: this.totalBytes
    });
  }

  async cacheAdvertisements(advertisements = []) {
    for (const ad of advertisements) {
      // eslint-disable-next-line no-await-in-loop
      await this.ensureAdCreative(ad);
    }
  }

  async ensureAdCreative(ad) {
    if (!this.enabled || !ad?.asset_url) {
      return ad;
    }

    await this.ensureReady();
    const record = await this.getOrDownloadAsset(ad.asset_url, ad);
    if (!record) {
      return ad;
    }

    return {
      ...ad,
      cached_asset_path: record.filePath,
      cached_asset_bytes: record.size,
      cache_last_updated: record.cachedAt
    };
  }

  async getOrDownloadAsset(assetUrl, metadata = {}) {
    const existing = this.records.get(assetUrl);

    if (existing && (await this.fileExists(existing.filePath))) {
      existing.lastAccessed = Date.now();
      return existing;
    }

    return this.downloadAsset(assetUrl, metadata);
  }

  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  buildFilePath(assetUrl) {
    const hash = crypto.createHash('sha1').update(assetUrl).digest('hex');
    let extension = '.bin';

    try {
      const parsed = new URL(assetUrl);
      const ext = path.extname(parsed.pathname);
      if (ext) {
        extension = ext;
      }
    } catch (error) {
      logger.warn('Failed to parse asset URL for caching', {
        error: error.message,
        assetUrl
      });
    }

    return path.join(this.cacheDir, `${hash}${extension}`);
  }

  async downloadAsset(assetUrl, metadata = {}) {
    if (this.inFlightDownloads.has(assetUrl)) {
      return this.inFlightDownloads.get(assetUrl);
    }

    const downloadPromise = this.performDownload(assetUrl, metadata)
      .catch((error) => {
        logger.warn('Creative download failed', { assetUrl, error: error.message });
        return null;
      })
      .finally(() => {
        this.inFlightDownloads.delete(assetUrl);
      });

    this.inFlightDownloads.set(assetUrl, downloadPromise);
    return downloadPromise;
  }

  async performDownload(assetUrl, metadata = {}) {
    try {
      const response = await this.fetchImpl(assetUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      const filePath = this.buildFilePath(assetUrl);
      await fs.writeFile(filePath, buffer);

      const record = {
        assetUrl,
        filePath,
        cachedAt: new Date().toISOString(),
        lastAccessed: Date.now(),
        size: buffer.length,
        metadata
      };

      this.records.set(assetUrl, record);
      this.totalBytes = Array.from(this.records.values()).reduce((sum, item) => sum + (item.size || 0), 0);
      await this.persistIndex();

      logger.debug('Cached creative asset', {
        assetUrl,
        filePath,
        sizeBytes: buffer.length
      });

      return record;
    } catch (error) {
      this.lastError = error.message;
      throw error;
    }
  }

  async processAdPayload(payload) {
    if (!this.enabled || !payload?.advertisement?.length) {
      return payload;
    }

    await this.ensureReady();
    const decoratedAds = [];

    for (const ad of payload.advertisement) {
      // eslint-disable-next-line no-await-in-loop
      const decorated = await this.ensureAdCreative(ad);
      decoratedAds.push(decorated);
    }

    return {
      ...payload,
      advertisement: decoratedAds
    };
  }

  async cleanupStaleEntries() {
    if (!this.enabled || !this.records.size) {
      return;
    }

    for (const [assetUrl, record] of this.records.entries()) {
      // eslint-disable-next-line no-await-in-loop
      const exists = await this.fileExists(record.filePath);
      if (!exists) {
        this.records.delete(assetUrl);
      }
    }

    this.totalBytes = Array.from(this.records.values()).reduce((sum, item) => sum + (item.size || 0), 0);

    if (!this.maxBytes || this.totalBytes <= this.maxBytes) {
      return;
    }

    const sorted = Array.from(this.records.entries()).sort(
      (a, b) => (a[1].lastAccessed || 0) - (b[1].lastAccessed || 0)
    );

    for (const [assetUrl, record] of sorted) {
      if (this.totalBytes <= this.maxBytes) {
        break;
      }

      try {
        // eslint-disable-next-line no-await-in-loop
        await fs.unlink(record.filePath);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          logger.warn('Failed to remove cached creative asset', { assetUrl, error: error.message });
        }
      }

      this.records.delete(assetUrl);
      this.totalBytes -= record.size || 0;
    }

    await this.persistIndex();
  }

  async getCachedAsset(assetUrl) {
    if (!this.records.has(assetUrl)) {
      return null;
    }

    const record = this.records.get(assetUrl);
    if (!record || !(await this.fileExists(record.filePath))) {
      this.records.delete(assetUrl);
      return null;
    }

    record.lastAccessed = Date.now();
    return record;
  }

  getStatus() {
    return {
      enabled: this.enabled,
      cacheDir: this.cacheDir,
      files: this.records.size,
      totalBytes: this.totalBytes,
      maxBytes: this.maxBytes,
      lastUpdate: this.lastUpdate,
      lastError: this.lastError,
      targets: this.targets
    };
  }

  getConfiguredTargets() {
    return [...this.targets];
  }

  parseTargetsFromInput(raw) {
    return this.parseTargetList(raw);
  }

  getCacheDir() {
    return this.cacheDir;
  }

  getPublicAssetPath(assetUrl) {
    if (!assetUrl) {
      return null;
    }

    const record = this.records.get(assetUrl);
    if (!record?.filePath) {
      return null;
    }

    try {
      const relativePath = path.relative(this.cacheDir, record.filePath);
      if (relativePath.startsWith('..')) {
        return null;
      }

      return `/cached-assets/${relativePath.split(path.sep).join('/')}`;
    } catch (error) {
      logger.warn('Failed to compute public asset path', {
        assetUrl,
        error: error.message
      });
      return null;
    }
  }
}

const creativeCacheService = new CreativeCacheService();
module.exports = creativeCacheService;

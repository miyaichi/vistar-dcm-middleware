const logger = require('../utils/logger');

const fetchFn = (...args) => {
  if (typeof fetch === 'function') {
    return fetch(...args);
  }

  return import('node-fetch').then(({ default: nodeFetch }) => nodeFetch(...args));
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const PLAYER_MEDIA = {
  'ME-DEC': ['image/jpeg', 'image/png'],
  'USDP-R5000': ['image/jpeg', 'image/png', 'video/mp4'],
  'USDP-R2200': ['image/jpeg', 'image/png', 'video/mp4'],
  'USDP-R1000': ['image/jpeg', 'image/png'],
  'USDP-R500': ['image/jpeg', 'image/png']
};

class VistarConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'VistarConfigurationError';
    this.statusCode = 500;
    this.isVistarConfigurationError = true;
  }
}

class VistarApiError extends Error {
  constructor(message, statusCode = 502, details = null) {
    super(message);
    this.name = 'VistarApiError';
    this.statusCode = statusCode;
    this.details = details;
    this.isVistarApiError = true;
    this.retryable = false;
  }
}

const parseInteger = (value, fallback) => {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const getSupportedMedia = (model) => {
  const fallbackModel = process.env.DEFAULT_PLAYER_MODEL || 'ME-DEC';
  return PLAYER_MEDIA[model] || PLAYER_MEDIA[fallbackModel] || PLAYER_MEDIA['ME-DEC'];
};

const sanitizeBaseUrl = (url) => (url || 'https://sandbox-api.vistarmedia.com').replace(/\/+$/, '');

const buildHeaders = () => ({
  'Content-Type': 'application/json',
  'User-Agent': `vistar-dcm-middleware/${process.env.npm_package_version || 'dev'}`
});

const resolveString = (value, fallback) => {
  if (value && typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  if (fallback && typeof fallback === 'string' && fallback.trim()) {
    return fallback.trim();
  }

  return null;
};

const buildRequestPayload = ({ placementId, deviceId, venueId, playerModel }) => {
  const networkId = resolveString(process.env.VISTAR_NETWORK_ID);
  const apiKey = resolveString(process.env.VISTAR_API_KEY);

  if (!networkId || !apiKey) {
    throw new VistarConfigurationError('VISTAR_NETWORK_ID and VISTAR_API_KEY are required when MOCK_VISTAR_API=false');
  }

  const resolvedDeviceId =
    resolveString(deviceId) ||
    resolveString(process.env.TEST_DEVICE_ID) ||
    resolveString(process.env.DEFAULT_DEVICE_ID) ||
    resolveString(placementId) ||
    'VistarDisplay0';

  if (!resolvedDeviceId) {
    throw new VistarConfigurationError('deviceId is required (pass ?deviceId= or set TEST_DEVICE_ID / DEFAULT_DEVICE_ID)');
  }

  const resolvedVenueId =
    resolveString(venueId) ||
    resolveString(process.env.TEST_VENUE_ID) ||
    resolveString(process.env.DEFAULT_VENUE_ID);

  if (!resolvedVenueId) {
    throw new VistarConfigurationError('venueId is required (pass ?venueId= or set TEST_VENUE_ID / DEFAULT_VENUE_ID)');
  }

  const width = parseInteger(process.env.DEFAULT_DISPLAY_WIDTH, 1920);
  const height = parseInteger(process.env.DEFAULT_DISPLAY_HEIGHT, 1080);
  const allowAudio = process.env.ALLOW_AUDIO === 'true';
  const displayAreaId = resolveString(process.env.DEFAULT_DISPLAY_AREA_ID, 'display-0');
  const playerModelToUse = resolveString(playerModel, process.env.DEFAULT_PLAYER_MODEL) || 'ME-DEC';

  return {
    request: {
      network_id: networkId,
      api_key: apiKey,
      device_id: resolvedDeviceId,
      venue_id: resolvedVenueId,
      display_time: Math.floor(Date.now() / 1000),
      direct_connection: process.env.VISTAR_DIRECT_CONNECTION === 'true',
      display_area: [
        {
          id: displayAreaId,
          width,
          height,
          allow_audio: allowAudio,
          supported_media: getSupportedMedia(playerModelToUse)
        }
      ],
      device_attribute: []
    },
    context: {
      networkId,
      deviceId: resolvedDeviceId,
      venueId: resolvedVenueId,
      playerModel: playerModelToUse
    }
  };
};

const normalizeError = (error) => {
  if (error instanceof VistarApiError || error instanceof VistarConfigurationError) {
    return error;
  }

  if (error?.name === 'AbortError') {
    const timeoutError = new VistarApiError('Vistar API request timed out', 504);
    timeoutError.retryable = true;
    timeoutError.isTimeout = true;
    return timeoutError;
  }

  const genericError = new VistarApiError(error.message || 'Unexpected Vistar API error');
  genericError.retryable = true;
  genericError.cause = error;
  return genericError;
};

const performRequest = async (requestBody, path = '/api/v1/get_ad/json') => {
  const timeoutMs = parseInteger(process.env.VISTAR_TIMEOUT_MS, 5000);
  const retries = Math.max(parseInteger(process.env.VISTAR_MAX_RETRIES, 1), 1);
  const retryDelay = Math.max(parseInteger(process.env.VISTAR_RETRY_DELAY_MS, 250), 0);

  const baseUrl = sanitizeBaseUrl(process.env.VISTAR_API_URL);
  const endpoint = `${baseUrl}${path}`;

  let attempt = 0;
  let lastError;

  while (attempt < retries) {
    attempt += 1;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchFn(endpoint, {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      const rawBody = await response.text();
      let payload;

      try {
        payload = rawBody ? JSON.parse(rawBody) : {};
      } catch (parseError) {
        payload = { raw: rawBody };
      }

      if (!response.ok) {
        const error = new VistarApiError(`Vistar API error ${response.status}`, response.status, payload);
        error.retryable = response.status >= 500;
        throw error;
      }
      return payload;
    } catch (error) {
      lastError = normalizeError(error);
      logger.warn('Vistar API request failed', {
        attempt,
        retries,
        error: lastError.message,
        retryable: lastError.retryable
      });

      if (attempt >= retries || !lastError.retryable) {
        throw lastError;
      }

      await wait(retryDelay);
    }
  }

  throw lastError;
};

const mockResponse = (placementId) => ({
  id: `mock-${placementId}`,
  placementId,
  creative: {
    html: `<div>Mock creative for ${placementId}</div>`
  },
  ttlSeconds: parseInteger(process.env.CACHE_TTL_SECONDS, 10) || 60,
  fetchedAt: new Date().toISOString(),
  mocked: true
});

const fetchAd = async ({ placementId, deviceId, venueId, playerModel }) => {
  const mockMode = process.env.MOCK_VISTAR_API !== 'false';

  if (mockMode) {
    logger.debug('Returning mock Vistar response', { placementId });
    return mockResponse(placementId);
  }

  const { request, context } = buildRequestPayload({
    placementId,
    deviceId,
    venueId,
    playerModel
  });

  logger.info('Fetching ad from Vistar API', {
    placementId,
    deviceId: context.deviceId,
    venueId: context.venueId,
    playerModel: context.playerModel,
    endpoint: sanitizeBaseUrl(process.env.VISTAR_API_URL)
  });

  return performRequest(request);
};

const fetchCreativeAssets = async ({ placementId, deviceId, venueId, playerModel }) => {
  const mockMode = process.env.MOCK_VISTAR_API !== 'false';

  if (mockMode) {
    logger.debug('Creative caching skipped in mock mode', { placementId });
    return null;
  }

  const { request, context } = buildRequestPayload({
    placementId,
    deviceId,
    venueId,
    playerModel
  });

  logger.info('Fetching creatives for cache', {
    placementId,
    deviceId: context.deviceId,
    venueId: context.venueId,
    playerModel: context.playerModel,
    endpoint: sanitizeBaseUrl(process.env.VISTAR_API_URL)
  });

  return performRequest(request, '/api/v1/get_asset/json');
};

module.exports = {
  fetchAd,
  fetchCreativeAssets,
  VistarConfigurationError,
  VistarApiError
};

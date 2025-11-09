const fetch = require('node-fetch');
const logger = require('../utils/logger');

const {
  VISTAR_API_URL = 'https://sandbox-api.vistarmedia.com',
  VISTAR_API_KEY,
  VISTAR_NETWORK_ID,
  MOCK_VISTAR_API = 'true',
  VISTAR_TIMEOUT_MS = 5000
} = process.env;

const headers = {
  'Content-Type': 'application/json',
  'User-Agent': `vistar-dcm-middleware/${process.env.npm_package_version || 'dev'}`,
  ...(VISTAR_API_KEY ? { Authorization: `Bearer ${VISTAR_API_KEY}` } : {})
};

const mockResponse = (placementId) => ({
  id: `mock-${placementId}`,
  placementId,
  creative: {
    html: `<div>Mock creative for ${placementId}</div>`
  },
  ttlSeconds: parseInt(process.env.CACHE_TTL_SECONDS, 10) || 60,
  fetchedAt: new Date().toISOString(),
  mocked: true
});

const fetchAdFromApi = async (placementId) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VISTAR_TIMEOUT_MS);

  try {
    const response = await fetch(`${VISTAR_API_URL}/ad-request`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        placement_id: placementId,
        network_id: VISTAR_NETWORK_ID
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const payload = await response.text();
      throw new Error(`Vistar API error ${response.status}: ${payload}`);
    }

    return response.json();
  } finally {
    clearTimeout(timeout);
  }
};

const fetchAd = async (placementId) => {
  if (MOCK_VISTAR_API === 'true') {
    logger.debug('Returning mock Vistar response', { placementId });
    return mockResponse(placementId);
  }

  if (!VISTAR_API_KEY || !VISTAR_NETWORK_ID) {
    throw new Error('Vistar API credentials are required when MOCK_VISTAR_API=false');
  }

  logger.info('Fetching ad from Vistar API', { placementId, endpoint: VISTAR_API_URL });
  return fetchAdFromApi(placementId);
};

module.exports = {
  fetchAd
};

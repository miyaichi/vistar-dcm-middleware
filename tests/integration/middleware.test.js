const request = require('supertest');

const loadApp = (envOverrides = {}) => {
  jest.resetModules();
  process.env = {
    ...originalEnv,
    NODE_ENV: 'test',
    PORT: 0,
    HOST: '127.0.0.1',
    ...envOverrides
  };

  // eslint-disable-next-line global-require
  return require('../../src/server');
};

const originalEnv = { ...process.env };
afterEach(() => {
  process.env = { ...originalEnv };
});

describe('Vistar DCM Middleware (stub)', () => {
  test('GET /health returns service metadata', async () => {
    const app = loadApp();

    const response = await request(app)
      .get('/health')
      .expect(200);

    expect(response.body).toMatchObject({
      status: 'ok',
      service: expect.any(String),
      version: expect.any(String)
    });
  });

  test('GET /ad requires placementId query parameter', async () => {
    const app = loadApp();

    const response = await request(app)
      .get('/ad')
      .expect(400);

    expect(response.body.message).toMatch(/placementId/i);
  });

  test('GET /ad returns stub payload then cache hit on subsequent call', async () => {
    const app = loadApp();

    const first = await request(app)
      .get('/ad')
      .query({ placementId: 'integration-screen' })
      .expect(200);

    expect(first.body.source).toBe('stub');
    expect(first.body.payload).toHaveProperty('html');

    const second = await request(app)
      .get('/ad')
      .query({ placementId: 'integration-screen' })
      .expect(200);

    expect(second.body.source).toBe('cache');
    expect(second.body.payload.html).toContain('integration-screen');
  });

  test('GET /cache/status exposes cache stats JSON', async () => {
    const app = loadApp();

    const response = await request(app)
      .get('/cache/status')
      .expect(200);

    expect(response.body).toMatchObject({
      hits: expect.any(Number),
      misses: expect.any(Number),
      defaultTtl: expect.any(Number)
    });
  });

  test('GET /pop requires eventId and echoes payload when provided', async () => {
    const app = loadApp();

    await request(app)
      .get('/pop')
      .expect(400);

    const okResponse = await request(app)
      .get('/pop')
      .query({ eventId: 'pop-event' })
      .expect(200);

    expect(okResponse.body).toMatchObject({
      status: 'acknowledged',
      eventId: 'pop-event'
    });
  });

  test('API auth token protects endpoints when configured', async () => {
    const token = 'secret-token';
    const app = loadApp({ API_AUTH_TOKEN: token });

    await request(app)
      .get('/ad')
      .query({ placementId: 'auth-screen' })
      .expect(401);

    await request(app)
      .get('/ad')
      .set('X-API-Token', token)
      .query({ placementId: 'auth-screen' })
      .expect(200);
  });
});

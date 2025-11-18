const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const ORIGINAL_ENV = { ...process.env };
const tmpDirs = [];

const createTempDir = async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'creative-cache-'));
  tmpDirs.push(dir);
  return dir;
};

const bufferToArrayBuffer = (buffer) => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

const loadService = async (overrides = {}) => {
  jest.resetModules();
  const cacheDir = overrides.CACHE_DIR || (await createTempDir());

  process.env = {
    ...ORIGINAL_ENV,
    NODE_ENV: 'test',
    MOCK_VISTAR_API: 'false',
    CACHE_ENABLED: 'true',
    CACHE_DIR: cacheDir,
    CACHE_WARMUP_TARGETS: 'off',
    ...overrides
  };

  // eslint-disable-next-line global-require
  const service = require('../../src/services/creativeCacheService');
  return { service, cacheDir };
};

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  jest.resetModules();
});

afterAll(async () => {
  await Promise.all(tmpDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('creativeCacheService', () => {
  test('processAdPayload caches assets and annotates advertisements', async () => {
    const { service } = await loadService();
    const assetBuffer = Buffer.from('cached-asset');
    service.fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => bufferToArrayBuffer(assetBuffer)
    });

    const payload = {
      advertisement: [
        {
          asset_url: 'https://cdn.vistarmedia.com/sample.mp4',
          creative_id: 'creative-1',
          lease_expiry: Math.floor(Date.now() / 1000) + 300
        }
      ]
    };

    const result = await service.processAdPayload(payload);
    expect(result.advertisement[0]).toHaveProperty('cached_asset_path');
    expect(result.advertisement[0]).toHaveProperty('cached_asset_bytes', assetBuffer.length);

    const stats = await fs.stat(result.advertisement[0].cached_asset_path);
    expect(stats.isFile()).toBe(true);

    const status = service.getStatus();
    expect(status.enabled).toBe(true);
    expect(status.files).toBe(1);
  });

  test('getStatus reports disabled when CACHE_ENABLED is false', async () => {
    const { service } = await loadService({ CACHE_ENABLED: 'false' });
    const status = service.getStatus();
    expect(status.enabled).toBe(false);
    expect(status.files).toBe(0);
  });
});

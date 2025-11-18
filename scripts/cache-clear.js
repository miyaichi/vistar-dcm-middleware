#!/usr/bin/env node

require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');
const logger = require('../src/utils/logger');
const creativeCacheService = require('../src/services/creativeCacheService');

(async () => {
  try {
    const cacheDir = creativeCacheService.getCacheDir();
    await fs.rm(cacheDir, { recursive: true, force: true });
    await fs.mkdir(cacheDir, { recursive: true });
    logger.info('Creative cache directory cleared', { cacheDir });

    const indexFile = path.join(cacheDir, 'index.json');
    await fs.writeFile(indexFile, JSON.stringify({}, null, 2));
    logger.info('Creative cache index reset', { indexFile });
    process.exit(0);
  } catch (error) {
    logger.error('Failed to clear creative cache', { error: error.message });
    process.exit(1);
  }
})();

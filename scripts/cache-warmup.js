#!/usr/bin/env node

require('dotenv').config();

// Force-enable cache if not explicitly disabled so the script can run standalone
if (process.env.CACHE_ENABLED == null) {
  process.env.CACHE_ENABLED = 'true';
}

const logger = require('../src/utils/logger');
const creativeCacheService = require('../src/services/creativeCacheService');

const args = process.argv.slice(2);
const targetArgument = args.join(',');

const resolveTargets = () => {
  if (targetArgument && targetArgument.trim()) {
    return creativeCacheService.parseTargetsFromInput(targetArgument.trim());
  }

  return creativeCacheService.getConfiguredTargets();
};

(async () => {
  try {
    const targets = resolveTargets();

    if (!targets.length) {
      logger.warn('No creative cache targets provided (use args or set CACHE_WARMUP_TARGETS)');
      process.exit(0);
      return;
    }

    logger.info('Starting creative cache warmup', { targets });
    await creativeCacheService.warmTargets(targets);
    logger.info('Creative cache warmup completed', { targetsCount: targets.length });
    process.exit(0);
  } catch (error) {
    logger.error('Creative cache warmup failed', { error: error.message, stack: error.stack });
    process.exit(1);
  }
})();

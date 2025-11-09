const { randomUUID } = require('crypto');
const logger = require('../utils/logger');

const handleProofOfPlay = (req, res, next) => {
  try {
    const eventId = req.query.eventId || randomUUID();

    logger.info('Received proof-of-play callback (stub)', {
      eventId,
      query: req.query
    });

    res.json({
      status: 'acknowledged',
      eventId,
      receivedAt: new Date().toISOString(),
      note: 'Stub handler. Forward the payload to MEDIAEDGE or analytics pipeline when ready.'
    });
  } catch (error) {
    logger.error('Failed to process proof-of-play callback', { error: error.message });
    next(error);
  }
};

module.exports = {
  handleProofOfPlay
};

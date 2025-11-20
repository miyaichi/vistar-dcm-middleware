const logger = require('../utils/logger');
const { recordProofOfPlay } = require('./metrics');
const { sendProofOfPlay, ProofOfPlaySendError } = require('../services/proofOfPlayService');

const handleProofOfPlay = async (req, res, next) => {
  const {
    proofUrl,
    eventId,
    displayTime,
    targetHost,
    targetPath
  } = req.popRequest || {};

  const logContext = {
    eventId,
    targetHost,
    targetPath,
    displayTime
  };

  try {
    logger.info('Received proof-of-play callback', logContext);
    recordProofOfPlay();

    logger.info('Forwarding proof-of-play to Vistar', {
      eventId,
      targetHost,
      targetPath
    });

    const result = await sendProofOfPlay({ url: proofUrl });

    logger.info('Proof-of-play forwarded successfully', {
      eventId,
      targetHost,
      targetPath,
      responseStatus: result.status,
      durationMs: result.durationMs,
      attempts: result.attempts
    });

    res.json({
      status: 'forwarded',
      eventId,
      targetHost,
      responseStatus: result.status,
      durationMs: result.durationMs,
      attempts: result.attempts,
      receivedAt: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to forward proof-of-play callback', {
      ...logContext,
      error: error.message,
      attempts: error.attempts
    });

    if (error instanceof ProofOfPlaySendError) {
      return res.status(error.statusCode || 502).json({
        error: error.name,
        message: error.message,
        eventId,
        targetHost,
        attempts: error.attempts
      });
    }

    return next(error);
  }
};

module.exports = {
  handleProofOfPlay
};

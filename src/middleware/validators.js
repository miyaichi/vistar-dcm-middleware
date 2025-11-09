const respondBadRequest = (res, message, details = {}) => res.status(400).json({
  error: 'Bad Request',
  message,
  details
});

const validatePlacementId = (placementId) => {
  if (typeof placementId !== 'string') {
    return 'placementId must be a string';
  }

  const trimmed = placementId.trim();

  if (!trimmed) {
    return 'placementId is required';
  }

  if (trimmed.length > 128) {
    return 'placementId must be 128 characters or fewer';
  }

  return null;
};

const validateAdRequest = (req, res, next) => {
  const error = validatePlacementId(req.query.placementId);

  if (error) {
    return respondBadRequest(res, error);
  }

  req.query.placementId = req.query.placementId.trim();
  return next();
};

const validateProofOfPlay = (req, res, next) => {
  const { eventId } = req.query;

  if (!eventId || typeof eventId !== 'string' || !eventId.trim()) {
    return respondBadRequest(res, 'eventId is required for PoP callbacks');
  }

  req.query.eventId = eventId.trim();
  return next();
};

module.exports = {
  validateAdRequest,
  validateProofOfPlay
};

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

const PLAYER_MODELS = ['ME-DEC', 'USDP-R5000', 'USDP-R2200', 'USDP-R1000', 'USDP-R500'];

const sanitizeOptionalString = (value) => {
  if (value == null) {
    return undefined;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
};

const validateAdRequest = (req, res, next) => {
  const error = validatePlacementId(req.query.placementId);

  if (error) {
    return respondBadRequest(res, error);
  }

  req.query.placementId = req.query.placementId.trim();

  const deviceId = sanitizeOptionalString(req.query.deviceId);
  if (deviceId === null) {
    return respondBadRequest(res, 'deviceId must be a string');
  }
  req.query.deviceId = deviceId;

  const venueId = sanitizeOptionalString(req.query.venueId);
  if (venueId === null) {
    return respondBadRequest(res, 'venueId must be a string');
  }
  req.query.venueId = venueId;

  const playerModel = sanitizeOptionalString(req.query.playerModel);
  if (playerModel) {
    if (!PLAYER_MODELS.includes(playerModel)) {
      return respondBadRequest(res, `playerModel must be one of: ${PLAYER_MODELS.join(', ')}`);
    }

    req.query.playerModel = playerModel;
  } else {
    req.query.playerModel = undefined;
  }

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

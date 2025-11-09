const logger = require('../utils/logger');

const extractToken = (req) => {
  if (req.headers['x-api-token']) {
    return req.headers['x-api-token'];
  }

  if (req.headers.authorization) {
    const [scheme, value] = req.headers.authorization.split(' ');
    if (scheme?.toLowerCase() === 'bearer') {
      return value;
    }
  }

  return null;
};

const apiAuth = (req, res, next) => {
  const requiredToken = process.env.API_AUTH_TOKEN;

  if (!requiredToken) {
    return next();
  }

  const providedToken = extractToken(req);

  if (providedToken === requiredToken) {
    return next();
  }

  logger.warn('API auth token mismatch', {
    path: req.path,
    method: req.method,
    hasToken: Boolean(providedToken)
  });

  return res.status(401).json({
    error: 'Unauthorized',
    message: 'API token missing or invalid.'
  });
};

module.exports = apiAuth;

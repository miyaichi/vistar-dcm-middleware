const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const logger = require('./utils/logger');
const adRequestController = require('./controllers/adRequest');
const proofOfPlayController = require('./controllers/proofOfPlay');
const healthController = require('./controllers/health');
const metricsController = require('./controllers/metrics');
const cacheController = require('./controllers/cache');
const apiAuth = require('./middleware/apiAuth');
const { validateAdRequest, validateProofOfPlay } = require('./middleware/validators');

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable for HTML5 player generation
}));

// CORS configuration
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  methods: ['GET', 'POST'],
  credentials: true
};
app.use(cors(corsOptions));

// Compression
app.use(compression());

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.API_RATE_LIMIT) || 100,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/ad', limiter);

// Request logging middleware
if (process.env.ENABLE_REQUEST_LOGGING === 'true') {
  app.use((req, res, next) => {
    const start = Date.now();
    
    res.on('finish', () => {
      const duration = Date.now() - start;
      logger.info('HTTP Request', {
        method: req.method,
        path: req.path,
        query: req.query,
        status: res.statusCode,
        duration: `${duration}ms`,
        ip: req.ip
      });
    });
    
    next();
  });
}

// API authentication (only enforced when API_AUTH_TOKEN is set)
app.use(apiAuth);

// Health check endpoint
app.get('/health', healthController.check);

// Metrics endpoint (Prometheus)
if (process.env.ENABLE_METRICS === 'true') {
  app.get('/metrics', metricsController.getMetrics);
}

// Main ad request endpoint
app.get('/ad', validateAdRequest, adRequestController.handleAdRequest);

// Proof of Play callback endpoint
app.get('/pop', validateProofOfPlay, proofOfPlayController.handleProofOfPlay);

// Cache management endpoints
app.get('/cache/status', cacheController.status);
app.post('/cache/invalidate', cacheController.invalidateEntry);
app.post('/cache/clear', cacheController.clearAll);

// 404 handler
app.use((req, res) => {
  logger.warn('Route not found', { path: req.path, method: req.method });
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Express error handler', {
    error: err.message,
    stack: err.stack,
    path: req.path
  });

  res.status(err.status || 500).json({
    error: err.name || 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' 
      ? 'An error occurred' 
      : err.message
  });
});

module.exports = app;

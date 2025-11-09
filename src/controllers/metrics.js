const client = require('prom-client');

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const adRequestCounter = new client.Counter({
  name: 'vistar_stub_ad_requests_total',
  help: 'Total stub ad requests served',
  registers: [register]
});

const recordAdRequest = () => adRequestCounter.inc();

const getMetrics = async (req, res, next) => {
  try {
    res.set('Content-Type', register.contentType);
    const metrics = await register.metrics();
    res.send(metrics);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getMetrics,
  recordAdRequest
};

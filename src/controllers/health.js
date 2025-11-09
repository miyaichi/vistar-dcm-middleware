const os = require('os');
const pkg = require('../../package.json');

const check = (req, res) => {
  res.json({
    status: 'ok',
    service: pkg.name,
    version: pkg.version,
    uptime: process.uptime(),
    hostname: os.hostname(),
    timestamp: new Date().toISOString()
  });
};

module.exports = {
  check
};

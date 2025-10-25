# Vistar DCM Middleware

Middleware server for integrating Vistar Media's programmatic advertising platform with MEDIAEDGE Display Content Manager (DCM).

## Overview

This middleware server acts as a bridge between DCM and Vistar Media's Ad Serving API, enabling programmatic DOOH (Digital Out-of-Home) ad delivery on MEDIAEDGE players.

### Architecture

```
[Vistar Media Ad Server]
         ↕ (Ad Request API / Creative Caching API)
[Vistar DCM Middleware] ← This Project
         ↕ (HTML5 + URI Assets)
[MEDIAEDGE DCM]
         ↓ (FTP/HTTP Distribution)
[Digital Signage Players]
    - MEDIAEDGE ME-DEC
    - USDP-R5000/R2200
    - USDP-R1000
```

## Features

- ✅ **Ad Request/Response Handling** - Interfaces with Vistar Ad Serving API
- ✅ **Proof of Play (PoP) Tracking** - Accurate playback confirmation within 15 minutes
- ✅ **Creative Caching** - Offline resilience using Vistar Creative Caching API
- ✅ **Multi-Player Support** - Optimized for different MEDIAEDGE player models
- ✅ **Dynamic Creative Support** - Real-time creative generation
- ✅ **HTML5 Player Generation** - Dynamic HTML generation for DCM URI assets
- ✅ **Monitoring & Diagnostics** - Built-in metrics for Vistar integration health

## Supported Players

| Player Model | HTML Support | Video in HTML | Recommended Configuration |
|-------------|--------------|---------------|---------------------------|
| ME-DEC | ✅ Yes | ❌ No | Static images only |
| USDP-R5000/R2200 | ✅ Yes | ✅ Yes (Ver3+) | Full HTML5 support |
| USDP-R1000 | ❌ No | ❌ No | Direct file download |

## Project Status

- **Current Phase**: Initial Development
- **Version**: 0.1.0-alpha
- **Vistar Integration Status**: Staging Environment Testing

## Quick Start

### Prerequisites

- Node.js 18+ or Docker
- Vistar Media API credentials (staging or production)
- MEDIAEDGE DCM installation
- Network access to Vistar API endpoints

### Installation

```bash
# Clone repository
git clone https://github.com/miyaichi/vistar-dcm-middleware.git
cd vistar-dcm-middleware

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your Vistar API credentials

# Start development server
npm run dev

# Or start production server
npm start
```

### Docker Deployment

```bash
# Build and start
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

## Configuration

### Environment Variables

Create a `.env` file with the following variables:

```env
# Vistar API Configuration
VISTAR_NETWORK_ID=your_network_id
VISTAR_API_KEY=your_api_key
VISTAR_API_URL=https://staging-api.vistarmedia.com
VISTAR_ENVIRONMENT=staging

# Server Configuration
PORT=3000
NODE_ENV=production
HOST=0.0.0.0

# Creative Caching
CACHE_DIR=/var/cache/vistar/creatives
CACHE_UPDATE_INTERVAL=3600000
CACHE_MAX_SIZE=10GB

# Logging
LOG_LEVEL=info
LOG_FORMAT=json

# Monitoring
ENABLE_METRICS=true
METRICS_PORT=9090
```

### Player Configuration

Player-specific settings are configured in `src/config/players.js`:

```javascript
{
  'ME-DEC': {
    supported_media: ['image/jpeg', 'image/png'],
    html_support: true,
    video_in_html: false
  },
  'USDP-R5000': {
    supported_media: ['image/jpeg', 'image/png', 'video/mp4'],
    html_support: true,
    video_in_html: true
  }
}
```

## DCM Integration

### Step 1: Register Middleware URL in DCM

1. Open DCM Console
2. Navigate to **Materials (素材)** → **Add Material (素材登録)**
3. Select **URI** type
4. Enter middleware URL:
   ```
   http://middleware-server:3000/ad?device_id={device_id}&display_area={area_id}
   ```
5. Configure display duration (must match Vistar spot duration)

### Step 2: Create Layout and Schedule

1. Create layout with region for Vistar ads
2. Add URI material to playlist
3. Schedule playlist with appropriate timing

For detailed DCM setup instructions, see [docs/DCM_SETUP.md](docs/DCM_SETUP.md)

## API Endpoints

### Ad Request
```http
GET /ad?device_id={device_id}&display_area={area_id}&player_model={model}
```

Returns HTML5 player with Vistar ad.

**Query Parameters:**
- `device_id` (required): Unique device identifier
- `display_area` (required): Display area identifier
- `player_model` (optional): Player model (ME-DEC, USDP-R5000, etc.)

### Proof of Play Callback
```http
GET /pop?url={encoded_pop_url}
```

Internal endpoint for PoP confirmation.

### Health Check
```http
GET /health
```

Returns server health status.

### Cache Status
```http
GET /cache/status
```

Returns creative cache statistics.

### Metrics (Prometheus)
```http
GET /metrics
```

Prometheus-compatible metrics endpoint.

For complete API documentation, see [docs/API.md](docs/API.md)

## Development

### Project Structure

```
vistar-dcm-middleware/
├── src/
│   ├── index.js              # Entry point
│   ├── server.js             # Express server
│   ├── config/               # Configuration
│   ├── controllers/          # Request handlers
│   ├── services/             # Business logic
│   ├── middleware/           # Express middleware
│   └── utils/                # Utilities
├── tests/                    # Test files
├── docs/                     # Documentation
└── scripts/                  # Utility scripts
```

### Running Tests

```bash
# All tests
npm test

# Unit tests only
npm run test:unit

# Integration tests
npm run test:integration

# Coverage report
npm run test:coverage
```

### Code Quality

```bash
# Linting
npm run lint

# Format code
npm run format

# Type checking (if using TypeScript)
npm run type-check
```

## Monitoring & Observability

### Built-in Metrics

The middleware exposes Prometheus metrics:

- `vistar_ad_requests_total` - Total ad requests
- `vistar_ad_responses_total` - Total ad responses
- `vistar_cache_hit_rate` - Cache hit rate percentage
- `vistar_pop_success_rate` - PoP success rate
- `vistar_display_time_latency` - Display time latency histogram
- `vistar_pop_time_latency` - PoP time latency histogram

### Grafana Dashboard

Import the provided dashboard:
```bash
# Located in monitoring/grafana-dashboard.json
```

### Logging

Structured logging with configurable levels:
```bash
# View logs
docker-compose logs -f middleware

# Filter by level
docker-compose logs -f middleware | grep ERROR
```

## Vistar Integration Testing

### Staging Environment

1. Access Vistar staging platform: https://stagingtrafficking.vistarmedia.com/
2. Configure test network and venues
3. Set up test campaigns
4. Verify ad delivery flow

### Integration Checklist

- [ ] Ad requests contain correct parameters
- [ ] Ad responses are parsed correctly
- [ ] Creatives are cached properly
- [ ] PoP is sent within 15 minutes
- [ ] Display time latency < 900 seconds
- [ ] Spend rate > 90%
- [ ] No black screens or skipped spots

See [docs/VISTAR_INTEGRATION.md](docs/VISTAR_INTEGRATION.md) for detailed testing guide.

## Deployment

### Production Deployment

```bash
# Using Docker
docker build -t vistar-dcm-middleware:latest .
docker run -d \
  --name vistar-middleware \
  -p 3000:3000 \
  --env-file .env.production \
  vistar-dcm-middleware:latest

# Using PM2
pm2 start npm --name "vistar-middleware" -- start
pm2 save
```

### Environment-Specific Configuration

- **Staging**: Uses Vistar staging API
- **Production**: Uses Vistar production API

Ensure correct API URLs and credentials for each environment.

For detailed deployment instructions, see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

## Troubleshooting

### Common Issues

**Issue: Ad not displaying**
- Check network connectivity to Vistar API
- Verify device_id and venue_id configuration
- Check DCM logs for URI loading errors

**Issue: PoP not being sent**
- Verify HTML onload event is triggering
- Check 15-minute timing requirement
- Review middleware logs for PoP requests

**Issue: Cache misses**
- Increase cache update frequency
- Verify cache directory permissions
- Check disk space availability

See [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) for more solutions.

## Documentation

- [Architecture Overview](docs/ARCHITECTURE.md)
- [Vistar Integration Guide](docs/VISTAR_INTEGRATION.md)
- [DCM Setup Guide](docs/DCM_SETUP.md)
- [Deployment Guide](docs/DEPLOYMENT.md)
- [API Reference](docs/API.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Workflow

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see [LICENSE](LICENSE) file for details.

## Support & Contact

### Project Maintainers
- Yoshihiko Miyaichi - yoshihiko.miyaichi@pier1.co.jp

### Related Resources
- [Vistar Media Documentation](https://vistarmedia.com/docs)
- [MEDIAEDGE DCM](https://www.mediaedge.co.jp/)
- [Project Issues](https://github.com/miyaichi/vistar-dcm-middleware/issues)

### Vistar Media Support
- Manager, Supply Operations APAC: Janice Ong (jong@vistarmedia.com)
- Integration Support: See Vistar Media documentation

## Acknowledgments

- Vistar Media team for integration support
- MEDIAEDGE for DCM platform
- Contributors to this project

## Roadmap

### Version 0.1.0 (Current - PoC)
- [x] Project setup
- [ ] Basic ad request/response handling
- [ ] Simple HTML generation
- [ ] PoP tracking
- [ ] Initial Vistar staging testing

### Version 0.2.0
- [ ] Creative caching implementation
- [ ] Multi-player support
- [ ] Error handling improvements
- [ ] Basic monitoring

### Version 0.3.0
- [ ] Dynamic creative support
- [ ] Advanced caching strategies
- [ ] Performance optimization
- [ ] Comprehensive testing

### Version 1.0.0
- [ ] Production readiness
- [ ] Full documentation
- [ ] Vistar certification complete
- [ ] Production deployment

## Version History

- **0.1.0-alpha** (2025-10-26): Initial project setup

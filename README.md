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

## Planned Features

- 🚧 **Ad Request/Response Handling** - Interfaces with Vistar Ad Serving API
- 🚧 **Proof of Play (PoP) Tracking** - Accurate playback confirmation within 15 minutes
- 📋 **Creative Caching** - Offline resilience using Vistar Creative Caching API (Phase 2)
- 📋 **Multi-Player Support** - Optimized for different MEDIAEDGE player models (Phase 3)
- 📋 **Dynamic Creative Support** - Real-time creative generation
- 🚧 **HTML5 Player Generation** - Dynamic HTML generation for DCM URI assets
- 📋 **Monitoring & Diagnostics** - Built-in metrics for Vistar integration health (Phase 4)

**Legend:** ✅ Completed | 🚧 In Progress | 📋 Planned

## Supported Players

| Player Model | HTML Support | Video in HTML | Recommended Configuration |
|-------------|--------------|---------------|---------------------------|
| ME-DEC | ✅ Yes | ❌ No | Static images only |
| USDP-R5000/R2200 | ✅ Yes | ✅ Yes (Ver3+) | Full HTML5 support |
| USDP-R1000 | ❌ No | ❌ No | Direct file download |

## Project Status

- **Current Phase**: Phase 1 - Initial Development (Week 1-2)
- **Version**: 0.1.0-alpha
- **Vistar Integration Status**: Planning & Initial Implementation
- **Repository**: https://github.com/miyaichi/vistar-dcm-middleware
- **Last Updated**: October 26, 2025

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

### Testing

```bash
npm test
```

The Jest + Supertest suite exercises health, ad, PoP, cache, and auth flows so future Vistar integrations can move quickly with confidence.

### Docker Deployment

```bash
# Build and start
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

### Stubbed Middleware (Phase 1)

The current build includes lightweight stub controllers so the service can run end-to-end (including inside Docker) before the full Vistar integration is wired up. The stubs log every call and return predictable JSON payloads that make it easy to verify wiring and monitoring.

| Endpoint | Purpose | Example |
|----------|---------|---------|
| `GET /health` | Basic liveness probe with uptime/hostname | `curl http://localhost:3000/health` |
| `GET /ad?placementId=demo` | Returns a cached HTML5 placeholder creative; primed on first request | `curl "http://localhost:3000/ad?placementId=demo-screen"` |
| `GET /pop` | Acknowledges PoP callbacks and echoes metadata (requires `eventId`) | `curl http://localhost:3000/pop?eventId=test` |
| `GET /metrics` | Prometheus metrics (enable via `ENABLE_METRICS=true`) | `curl http://localhost:3000/metrics` |
| `GET /cache/status` | Inspect in-memory cache stats | `curl http://localhost:3000/cache/status` |
| `POST /cache/invalidate` | Remove one cached placement by sending `{"placementId":"demo"}` | `curl -XPOST -H "Content-Type: application/json" -d '{"placementId":"demo"}' http://localhost:3000/cache/invalidate` |
| `POST /cache/clear` | Flush the entire cache when you need a blank slate | `curl -XPOST http://localhost:3000/cache/clear` |

`/ad` also accepts optional overrides: `deviceId`, `venueId`, and `playerModel` (ME-DEC, USDP-R5000, USDP-R2200, USDP-R1000, USDP-R500). These feed directly into the Vistar API payload once live mode is enabled.
> **Tip:** Copy `.env.example` to `.env` (or export environment variables) before running `docker-compose up -d` so that rate limits, logging, and metrics flags are configured the way you expect.

> Docker Compose automatically reads the `.env` file that sits next to `docker-compose.yml`, so the container now boots with the same values you use for local `npm start`.

#### Locking down the stub server

Set `API_AUTH_TOKEN` in `.env` to force every request to supply the same token via either the `X-API-Token` header or an `Authorization: Bearer <token>` header. Example:

```bash
echo "API_AUTH_TOKEN=change-me" >> .env
docker compose up -d --build
curl -H "X-API-Token: change-me" "http://localhost:3000/ad?placementId=demo-screen"
```

Requests without the token are rejected with `401 Unauthorized`, letting you integrate upstream systems safely even before the Vistar API calls are implemented.

With metrics enabled you also get counters for:
- `vistar_stub_ad_requests_total`
- `vistar_stub_cache_hits_total`
- `vistar_stub_cache_misses_total`
- `vistar_stub_pop_callbacks_total`
- `vistar_api_success_total`
- `vistar_api_failure_total`

Use them to validate caching behavior and PoP traffic before wiring the live Vistar API calls.

#### Switching between stub and live Vistar calls

The middleware now ships with a Vistar API client scaffold. By default it runs in mock mode so you still get deterministic responses. When you are ready to integrate with Vistar’s sandbox/production endpoint, flip the toggle and provide credentials:

```
MOCK_VISTAR_API=true   # default; uses local stub creative
MOCK_VISTAR_API=false  # calls the configured Vistar endpoint
VISTAR_API_URL=https://sandbox-api.vistarmedia.com
VISTAR_MAX_RETRIES=1
VISTAR_RETRY_DELAY_MS=250
VISTAR_NETWORK_ID=your_network
VISTAR_API_KEY=your_api_key
VISTAR_TIMEOUT_MS=5000
DEFAULT_DEVICE_ID=dcm_default_device
DEFAULT_VENUE_ID=dcm_default_venue
DEFAULT_DISPLAY_AREA_ID=main-display
```

When `MOCK_VISTAR_API=false`, the middleware routes ad requests through `src/clients/vistarClient.js`, validates that `VISTAR_NETWORK_ID`/`VISTAR_API_KEY` plus default device/venue identifiers are set, and then caches the live Vistar response. Failures bubble through the Express error handler and increment `vistar_api_failure_total`, making it easy to spot credential or network issues.

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

DCM setup instructions will be added as the project progresses.

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

API documentation will be added as endpoints are implemented.

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

See [docs/INTEGRATION_APPROACH.md](docs/INTEGRATION_APPROACH.md) for integration planning and approach.

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

Deployment instructions will be added as the project reaches production readiness.

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

A comprehensive troubleshooting guide will be added based on real-world deployment experience.

## Documentation

### English
- [Architecture Diagrams](docs/ARCHITECTURE_DIAGRAMS.md) - Detailed system architecture and flow diagrams
- [Integration Approach](docs/INTEGRATION_APPROACH.md) - Technical implementation plan and strategy
- [Integration Summary](docs/INTEGRATION_SUMMARY.md) - Quick summary of the integration approach

### Japanese (日本語)
- [統合アプローチ概要](docs/INTEGRATION_SUMMARY_JP.md) - 統合アプローチの簡潔なサマリー
- [社内向けプレゼンテーション](docs/INTERNAL_PRESENTATION_JP.md) - プロジェクト説明資料

### Additional Documentation (To Be Added)
- API Reference - Will be added as endpoints are implemented
- DCM Setup Guide - Will be added during integration testing
- Deployment Guide - Will be added for production deployment
- Troubleshooting Guide - Will be added based on real-world experience

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

### Vistar Media Contacts
- Manager, Supply Operations APAC: Janice Ong (jong@vistarmedia.com)
- Technical Contact: Kurt Woodford (kwoodford@vistarmedia.com)
- Integration Documentation: See [docs/INTEGRATION_APPROACH.md](docs/INTEGRATION_APPROACH.md)

## Acknowledgments

- Vistar Media team for integration support
- MEDIAEDGE for DCM platform
- Contributors to this project

## Development Roadmap

For detailed development timeline, see [docs/INTEGRATION_APPROACH.md](docs/INTEGRATION_APPROACH.md)

### Phase 1: Stubbed Middleware & Observability (Weeks 1-2) - ✅ Completed
- [x] Project scaffold, Docker runtime, `.env` workflow
- [x] Stub ad/PoP/cache/metrics endpoints with request validation
- [x] Cache controls (invalidate/clear, size cap) and Prometheus counters
- [x] API auth toggle, structured logging, graceful shutdown
- [x] Jest + Supertest integration coverage
- **Milestone:** Middleware runs end-to-end locally & in Docker without Vistar access

### Phase 2: Vistar Media API Integration (Weeks 3-4) - **Current**
- [ ] Implement live Ad Request API call path in `vistarClient`
- [ ] Surface Vistar success/failure metrics & retries
- [ ] Validate required credentials/config when `MOCK_VISTAR_API=false`
- [ ] Begin HTML payload shaping for MEDIAEDGE players
- **Milestone:** First live Vistar response cached and returned to DCM

### Phase 3: Creative Caching Enhancements (Week 5)
- [ ] Creative Caching API integration + persistence
- [ ] Background refresh workers & cache warmup tooling
- [ ] Cache hit/miss dashboards and alerting thresholds
- **Milestone:** Ads display even during extended network interruptions

### Phase 4: Multi-Player Support (Week 6)
- [ ] Player detection logic
- [ ] Per-model supported_media configuration
- [ ] HTML generation variations
- [ ] USDP-R1000 direct file support
- **Milestone:** All player types working correctly

### Phase 5: Production Readiness (Weeks 7-8)
- [ ] Monitoring and metrics
- [ ] Error handling refinement
- [ ] Performance optimization
- [ ] Documentation completion
- **Milestone:** Ready for Vistar Certification Test

### Target Integration Health Metrics

Based on our implementation approach with Creative Caching:

| Metric | Vistar Requirement | Our Target | Strategy |
|--------|-------------------|-----------|----------|
| **Spend Rate** | >90% | **>95%** | Creative caching + reliable PoP |
| **Display Time Latency** | <15 min (900 sec) | **<60 sec** | Local cache delivery |
| **Cache Hit Rate** | N/A | **85%+** | Hourly cache updates |
| **PoP Time Latency** | <15 min | **<5 min** | HTML onload + retry |

**Note:** Targets are based on Vistar's requirements and our Creative Caching implementation. Actual metrics will be validated during integration testing phases.

## Version History

- **0.1.0-alpha** (2025-10-26): Initial project setup and documentation

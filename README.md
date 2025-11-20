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

## Feature Roadmap

- ✅ **Ad Request/Response Handling** – Live integration via `get_ad`, caching aligned to `lease_expiry`, retry/backoff logic
- 🚧 **Proof of Play (PoP) Tracking** – Renderer fires Vistar PoP URLs; `/pop` endpoint remains a stub until MEDIAEDGE callback path is finalized
- ✅ **Creative Caching** – Uses Vistar Creative Caching API (`get_asset`) with disk quota enforcement and warmup tooling
- ✅ **Multi-Player Support** – Player-specific `supported_media` hints + request metadata (`playerModel`, `allow_audio`)
- 📋 **Dynamic Creative Support** – Placeholder for runtime HTML manipulation/custom overlays
- ✅ **HTML5 Player Generation** – Auto-generates player-safe HTML for MEDIAEDGE URI slots with asset fallback logic
- ✅ **Monitoring & Diagnostics** – Rate limiting, request logging, Prometheus metrics, and Grafana dashboard

**Legend:** ✅ Completed | 🚧 In Progress | 📋 Planned

## Supported Players

| Player Model | HTML Support | Video in HTML | Recommended Configuration |
|-------------|--------------|---------------|---------------------------|
| ME-DEC | ✅ Yes | ❌ No | Static images only |
| USDP-R5000/R2200 | ✅ Yes | ✅ Yes (Ver3+) | Full HTML5 support |
| USDP-R1000 | ❌ No | ❌ No | Direct file download |

## Project Status

- **Current Phase**: Phase 2 – Live Vistar integration with creative caching
- **Version**: 0.1.0-alpha (Docker + Node runtimes kept in sync)
- **Vistar Integration**: `MOCK_VISTAR_API=false` routes `/ad` through `src/clients/vistarClient.js`, enforces credentials, retries, and honors `lease_expiry` for caching
- **Creative Cache**: `creativeCacheService` downloads assets through Vistar's `get_asset` endpoint, enforces `CACHE_MAX_SIZE`, and warms targets via cron-style workers
- **Monitoring**: Rate limiting, structured logging, and Prometheus metrics enabled; Grafana dashboard included under `monitoring/`
- **Repository**: https://github.com/miyaichi/vistar-dcm-middleware
- **Last Updated**: 2025-11-20

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

### Stubbed Middleware Mode

Set `MOCK_VISTAR_API=true` (default) to exercise the middleware without making live Vistar calls. The mock controllers log every call and return deterministic payloads so wiring, caching, and monitoring can be verified even when the creative cache or API credentials are unavailable.

| Endpoint | Purpose | Example |
|----------|---------|---------|
| `GET /health` | Basic liveness probe with uptime/hostname | `curl http://localhost:3000/health` |
| `GET /ad?placementId=demo` | Returns a cached HTML5 placeholder creative; primed on first request | `curl "http://localhost:3000/ad?placementId=demo-screen"` |
| `GET /pop` | Forwards PoP URL to Vistar and logs the result (`url` query parameter required). `/ad` responses auto-call this endpoint from the HTML player and retry transient failures. | `curl "http://localhost:3000/pop?url=https%3A%2F%2Fpop.vistarmedia.com%2Fevent%3Fid%3D123"` |
| `GET /metrics` | Prometheus metrics (enable via `ENABLE_METRICS=true`) | `curl http://localhost:3000/metrics` |
| `GET /cache/status` | Inspect in-memory cache stats | `curl http://localhost:3000/cache/status` |
| `POST /cache/invalidate` | Remove one cached placement by sending `{"placementId":"demo"}` | `curl -XPOST -H "Content-Type: application/json" -d '{"placementId":"demo"}' http://localhost:3000/cache/invalidate` |
| `POST /cache/clear` | Flush the entire cache when you need a blank slate | `curl -XPOST http://localhost:3000/cache/clear` |

`/ad` also accepts optional overrides: `deviceId`, `venueId`, and `playerModel` (ME-DEC, USDP-R5000, USDP-R2200, USDP-R1000, USDP-R500). These feed directly into the Vistar API payload once live mode is enabled.

By default `/ad` returns an HTML5 page suitable for MEDIAEDGE URI slots. Append `&format=json` if you need to inspect the raw payload (e.g., `curl "http://localhost:3000/ad?placementId=demo&format=json"`). Cached creatives are served under `/cached-assets/...`, so the HTML player can load them locally when available.

### Creative Cache Tooling

- Warm a target manually (format `placement:venue:device:player`):  
  `npm run cache:warmup -- vistar-demo:hwt_cms_dev:VistarDisplay0:USDP-R5000`
- Clear the on-disk creative cache and reset the index:  
  `npm run cache:clear`

If no arguments are provided, `cache:warmup` uses the `CACHE_WARMUP_TARGETS` env var (or the default
device/venue). Use `./get_asset.sh` to inspect the exact payload that the warmup scripts send to
`/api/v1/get_asset/json`.
> **Tip:** Copy `.env.example` to `.env` (or export environment variables) before running `docker-compose up -d` so that rate limits, logging, and metrics flags are configured the way you expect.

> Docker Compose automatically reads the `.env` file that sits next to `docker-compose.yml`, so the container now boots with the same values you use for local `npm start`.

#### Locking down the API surface

Set `API_AUTH_TOKEN` in `.env` to require a shared secret for every request (all routes, stub or live). Clients may pass the token via the `X-API-Token` header or `Authorization: Bearer <token>`. Example:

```bash
echo "API_AUTH_TOKEN=change-me" >> .env
docker compose up -d --build
curl -H "X-API-Token: change-me" "http://localhost:3000/ad?placementId=demo-screen"
```

Requests without the token are rejected with `401 Unauthorized`, which lets you expose `/ad`, `/cached-assets`, and health endpoints to MEDIAEDGE or monitoring systems without opening the middleware publicly.

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
CACHE_CLEANUP_INTERVAL=86400000
CACHE_ENABLED=true
# Video playback behavior
VIDEO_LOOP=false
# Format: placementId:venueId:deviceId:playerModel (comma separated)
CACHE_WARMUP_TARGETS=display-0:venue-123:device-123:ME-DEC

`CACHE_WARMUP_TARGETS` lets the middleware prefetch creatives even before `/ad` is called. 
Each entry uses the format `placementId:venueId:deviceId:playerModel` and entries are
comma-separated. Use `off` (or `disabled`/`none`) to turn off warm-up. When this value is omitted
the cache falls back to the default venue/device (`DEFAULT_VENUE_ID`, `DEFAULT_DEVICE_ID`) so the
canonical `VistarDisplay0` + `display-0` combination still warms automatically.

Set `ALLOW_IFRAME_EMBEDDING=true` when the middleware must be displayed inside an iframe (e.g., looped QA playback).
This disables Helmet's `X-Frame-Options` response header so MEDIAEDGE can load `/ad` within an iframe.
Leave it `false` in production to keep browsers from framing the middleware response.

> Verify your get_asset payload with `./get_asset.sh` (same format as described in
> [Vistar’s Creative Caching endpoint](https://help.vistarmedia.com/hc/en-us/articles/224987348-Creative-caching-endpoint)).

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
│   ├── index.js          # Loads env, boots Express server
│   ├── server.js         # HTTP wiring, middleware, routes
│   ├── clients/          # External integrations (Vistar ad/asset APIs)
│   ├── controllers/      # Route handlers (ad, PoP, cache, metrics, health)
│   ├── middleware/       # Validators and API auth
│   ├── services/         # Creative cache, cache manager, HTML renderer
│   └── utils/            # Logger, helpers
├── scripts/              # Cache warmup/maintenance CLIs
├── tests/                # Jest unit/integration suites
├── docs/                 # Integration approach, AGENT guide
└── monitoring/           # Prometheus/Grafana assets
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

When `ENABLE_METRICS=true`, `/metrics` exposes Prometheus counters/gauges for both the stub server
and the creative cache:

- `vistar_stub_ad_requests_total`, `vistar_stub_cache_hits_total`, `vistar_stub_cache_misses_total`
- `vistar_stub_pop_callbacks_total`, `vistar_api_success_total`, `vistar_api_failure_total`
- `vistar_cache_warmups_total{result="success|failure"}`
- `vistar_cache_assets_cached_total`
- `vistar_cache_files` (gauge)
- `vistar_cache_bytes` (gauge)

### Grafana Dashboard

Import `monitoring/grafana-dashboard.json` into Grafana (Home → Dashboards → New → Import) and set the
Prometheus data source to the middleware scraper. The sample panels cover creative warmups, cache
utilization, ad cache hits/misses, and Vistar API success/failure so you can inspect the system
quickly during maintenance windows.

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

### Phase 2: Creative Caching & HTML Delivery (Weeks 3-4) - ✅ Completed
- [x] Implement live Ad Request API call path in `vistarClient`
- [x] Surface Vistar success/failure metrics & retries
- [x] Enforce credential validation when `MOCK_VISTAR_API=false`
- [x] Download/cache creatives, expose `/cached-assets` static serving
- [x] Return HTML5 player responses (video/img + PoP) with `format=json` escape hatch
- **Milestone:** First live Vistar response cached, rendered, and replayed to DCM

### Phase 3: Creative Caching Enhancements (Week 5) - **Current**
- [x] Cache warmup tooling & scheduling controls (`CACHE_WARMUP_TARGETS`, `npm run cache:warmup`)
- [x] On-disk cache management script (`npm run cache:clear`)
- [ ] Advanced monitoring (hit/miss dashboards, alert thresholds)
- [ ] Configurable playback options (e.g., loop toggle) & HTML customization
- **Milestone:** Ads display even during extended network interruptions with richer observability

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

# AGENT.md - Development Reference Guide

**Project:** Vistar DCM Middleware  
**Purpose:** Reference for technical information required to begin coding 
**Last Updated:** October 27, 2025

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Vistar API Specifications](#vistar-api-specifications)
3. [Environment Configuration](#environment-configuration)
4. [Player Configuration](#player-configuration)
5. [Implementation Requirements](#implementation-requirements)
6. [Testing Strategy](#testing-strategy)
7. [Error Handling](#error-handling)
8. [Monitoring & Metrics](#monitoring--metrics)

---

## Quick Start

### Development Environment Setup

```bash
# Clone repository
git clone https://github.com/miyaichi/vistar-dcm-middleware.git
cd vistar-dcm-middleware

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your credentials
# VISTAR_NETWORK_ID=your_network_id
# VISTAR_API_KEY=your_api_key

# Start development server
npm run dev
```

### Project Structure

```
vistar-dcm-middleware/
├── src/
│   ├── index.js              # Entry point
│   ├── server.js             # Express server setup
│   ├── config/
│   │   ├── vistar.js         # Vistar API configuration
│   │   ├── players.js        # Player-specific configs
│   │   └── cache.js          # Cache configuration
│   ├── controllers/
│   │   ├── adController.js   # Ad request handler
│   │   └── popController.js  # PoP handler
│   ├── services/
│   │   ├── vistarService.js  # Vistar API client
│   │   ├── cacheService.js   # Creative cache manager
│   │   └── htmlGenerator.js  # HTML5 player generator
│   ├── middleware/
│   │   ├── errorHandler.js   # Error handling
│   │   └── logger.js         # Request logging
│   └── utils/
│       ├── metrics.js        # Prometheus metrics
│       └── validator.js      # Request validation
├── tests/
│   ├── unit/                 # Unit tests
│   ├── integration/          # Integration tests
│   └── e2e/                  # End-to-end tests
└── docs/
    ├── ARCHITECTURE_DIAGRAMS.md
    ├── INTEGRATION_APPROACH.md
    └── INTEGRATION_SUMMARY.md
```

---

## Vistar API Specifications

### 1. Ad Request API

**Endpoint:**
```
Staging:    POST https://sandbox-api.vistarmedia.com/api/v1/get_ad/json
Production: POST https://api.vistarmedia.com/api/v1/get_ad/json
```

**Required Headers:**
```http
Content-Type: application/json
```

**Request Body Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `network_id` | String | **Required** | Network ID from Vistar platform |
| `api_key` | String | **Required** | API key for authentication |
| `device_id` | String | **Required** | Unique device identifier (max 64 chars) |
| `venue_id` | String | **Required** | Venue identifier |
| `display_time` | Int64 | **Required** | Expected display time (UTC epoch seconds) |
| `display_area` | Array | **Required** | Display area specifications |
| `device_attribute` | Array | Optional | Device attributes for targeting |

**Display Area Object:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | String | **Required** | Display area identifier |
| `width` | Int32 | **Required** | Width in pixels |
| `height` | Int32 | **Required** | Height in pixels |
| `allow_audio` | Boolean | Optional | Audio support (default: false) |
| `supported_media` | Array[String] | **Required** | Supported media types |

**Supported Media Types:**
```javascript
// For ME-DEC (no video in HTML)
["image/jpeg", "image/png"]

// For USDP-R5000/R2200 (full HTML5 support)
["image/jpeg", "image/png", "video/mp4"]

// Complete list (if needed)
[
  "image/jpeg",
  "image/png",
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/quicktime"
]
```

**Sample Request:**

```json
{
  "network_id": "5U71FqbWTgSMAuO0XS-HHQ",
  "api_key": "your_api_key_here",
  "device_id": "DEC001",
  "venue_id": "TEST_VENUE_001",
  "display_time": 1698400000,
  "display_area": [
    {
      "id": "main-display",
      "width": 1920,
      "height": 1080,
      "allow_audio": false,
      "supported_media": ["image/jpeg", "image/png"]
    }
  ],
  "device_attribute": []
}
```

**Sample Response (Ad Available):**

```json
{
  "advertisement": [
    {
      "asset_url": "https://s3.amazonaws.com/assets.vistarmedia.com/creative.jpg",
      "proof_of_play_url": "https://api.vistarmedia.com/api/v1/proof_of_play/...",
      "width": 1920,
      "height": 1080,
      "mime_type": "image/jpeg",
      "length_in_seconds": 15,
      "display_area_id": "main-display",
      "expiration": 1698400900
    }
  ]
}
```

**Sample Response (No Ad):**

```json
{
  "advertisement": []
}
```

---

### 2. Creative Caching API

**Purpose:** Pre-fetch and cache creatives for offline resilience

**Endpoint:**
```
Staging:    POST https://sandbox-api.vistarmedia.com/api/v1/get_asset/json
Production: POST https://api.vistarmedia.com/api/v1/get_asset/json
```

**Request Parameters:** Same as Ad Request API

**Key Differences:**
- Returns all creatives that qualify for the venue over the next 30 hours
- Device attributes, time of day, and day of week targeting NOT applied
- Use `asset_url` as cache key (updates for each unique creative version)

**Recommended Usage:**
- Call once per hour per venue
- Combine with real-time ad requests for dynamic creative support
- Cache based on `asset_url`

**Sample Response:**

```json
{
  "advertisement": [
    {
      "asset_url": "https://s3.amazonaws.com/.../creative1.jpg",
      "mime_type": "image/jpeg",
      "width": 1920,
      "height": 1080,
      "length_in_seconds": 15
    },
    {
      "asset_url": "https://s3.amazonaws.com/.../creative2.mp4",
      "mime_type": "video/mp4",
      "width": 1920,
      "height": 1080,
      "length_in_seconds": 30
    }
  ]
}
```

---

### 3. Proof of Play (PoP) API

**Purpose:** Report ad playback completion

**Method:** GET request to `proof_of_play_url` from ad response

**Timing Requirements:**
- **MUST** be sent within **15 minutes** of ad display
- Target: <5 minutes for optimal performance
- Use HTML `onload` event for immediate triggering

**URL Structure:**
```
https://api.vistarmedia.com/api/v1/proof_of_play/{lease_id}?display_time={epoch}
```

**Display Time Override:**
If reporting time differs from actual play time, append `display_time` parameter:
```
https://api.vistarmedia.com/.../proof_of_play/{lease_id}?display_time=1698400015
```

**Response Status Codes:**

| Code | Message | Description |
|------|---------|-------------|
| 200 | OK | PoP recorded successfully |
| 400 | Lease expired by X seconds | PoP sent too late |
| 400 | Lease Already Spent | PoP URL hit multiple times |
| 400 | Invalid PoP URL | Truncated or incorrect URL |

**Implementation:**
```javascript
// In generated HTML
<script>
window.addEventListener('load', function() {
  fetch('/pop?url=' + encodeURIComponent(popUrl))
    .then(response => {
      if (!response.ok) {
        console.error('PoP failed:', response.status);
        retryPoP(popUrl);
      }
    })
    .catch(error => {
      console.error('PoP error:', error);
      retryPoP(popUrl);
    });
});
</script>
```

---

### 4. HTTP Status Codes

| Code | Description | Action |
|------|-------------|--------|
| 200 | Success | Process response |
| 400 | Invalid Request | Check request parameters |
| 403 | Authentication Failed | Verify network_id and api_key |
| 408 | Request Timeout | Retry request |
| 429 | Too Many Requests | Implement rate limiting |
| 500 | Server Error | Retry with exponential backoff |

---

## Environment Configuration

### Environment Variables

Create `.env` file in project root:

```bash
# ===========================
# Vistar API Configuration
# ===========================

# Staging credentials
VISTAR_NETWORK_ID=your_staging_network_id
VISTAR_API_KEY=your_staging_api_key
VISTAR_API_URL=https://sandbox-api.vistarmedia.com
VISTAR_ENVIRONMENT=staging

# Production credentials (comment out for staging)
# VISTAR_NETWORK_ID=your_production_network_id
# VISTAR_API_KEY=your_production_api_key
# VISTAR_API_URL=https://api.vistarmedia.com
# VISTAR_ENVIRONMENT=production

# ===========================
# Server Configuration
# ===========================

PORT=3000
NODE_ENV=development
HOST=0.0.0.0

# ===========================
# Creative Caching
# ===========================

# Cache directory (must be writable)
CACHE_DIR=/var/cache/vistar/creatives

# Update interval in milliseconds (3600000 = 1 hour)
CACHE_UPDATE_INTERVAL=3600000

# Maximum cache size
CACHE_MAX_SIZE=10GB

# Cache cleanup interval (86400000 = 24 hours)
CACHE_CLEANUP_INTERVAL=86400000

# ===========================
# Logging
# ===========================

LOG_LEVEL=info
LOG_FORMAT=json
LOG_FILE=logs/vistar-middleware.log

# ===========================
# Monitoring
# ===========================

ENABLE_METRICS=true
METRICS_PORT=9090

# Prometheus push gateway (optional)
# PROMETHEUS_PUSHGATEWAY_URL=http://localhost:9091

# ===========================
# DCM Integration
# ===========================

# Default display duration (seconds)
DEFAULT_DISPLAY_DURATION=15

# HTML generation timeout (milliseconds)
HTML_GENERATION_TIMEOUT=5000
```

### Accessing Environment Variables

```javascript
// src/config/vistar.js
module.exports = {
  networkId: process.env.VISTAR_NETWORK_ID,
  apiKey: process.env.VISTAR_API_KEY,
  apiUrl: process.env.VISTAR_API_URL,
  environment: process.env.VISTAR_ENVIRONMENT || 'staging'
};
```

---

## Player Configuration

### Player Specifications

```javascript
// src/config/players.js

const PLAYER_CONFIGS = {
  'ME-DEC': {
    name: 'MEDIAEDGE ME-DEC',
    html_support: true,
    video_in_html: false,
    supported_media: ['image/jpeg', 'image/png'],
    default_dimensions: {
      width: 1920,
      height: 1080
    },
    notes: 'HTML5 support, but videos must be served as separate files'
  },
  
  'USDP-R5000': {
    name: 'USDP-R5000',
    html_support: true,
    video_in_html: true,
    supported_media: ['image/jpeg', 'image/png', 'video/mp4'],
    default_dimensions: {
      width: 1920,
      height: 1080
    },
    notes: 'Full HTML5 support including video playback (Ver3+)'
  },
  
  'USDP-R2200': {
    name: 'USDP-R2200',
    html_support: true,
    video_in_html: true,
    supported_media: ['image/jpeg', 'image/png', 'video/mp4'],
    default_dimensions: {
      width: 1920,
      height: 1080
    },
    notes: 'Full HTML5 support including video playback (Ver3+)'
  },
  
  'USDP-R1000': {
    name: 'USDP-R1000',
    html_support: false,
    video_in_html: false,
    supported_media: ['image/jpeg', 'image/png', 'video/mp4'],
    default_dimensions: {
      width: 1920,
      height: 1080
    },
    notes: 'No HTML support - direct file download required'
  }
};

// Get player configuration by model
function getPlayerConfig(playerModel) {
  return PLAYER_CONFIGS[playerModel] || PLAYER_CONFIGS['ME-DEC'];
}

// Get supported media for player
function getSupportedMedia(playerModel) {
  const config = getPlayerConfig(playerModel);
  return config.supported_media;
}

module.exports = {
  PLAYER_CONFIGS,
  getPlayerConfig,
  getSupportedMedia
};
```

### Player Detection Logic

```javascript
// src/utils/playerDetector.js

/**
 * Detect player model from device_id or query parameters
 * @param {string} deviceId - Device identifier
 * @param {object} query - Query parameters
 * @returns {string} Player model
 */
function detectPlayerModel(deviceId, query) {
  // Explicit player model in query
  if (query.player_model) {
    return query.player_model;
  }
  
  // Detect from device_id prefix
  if (deviceId.startsWith('DEC')) {
    return 'ME-DEC';
  }
  if (deviceId.startsWith('R5000')) {
    return 'USDP-R5000';
  }
  if (deviceId.startsWith('R2200')) {
    return 'USDP-R2200';
  }
  if (deviceId.startsWith('R1000')) {
    return 'USDP-R1000';
  }
  
  // Default to ME-DEC
  return 'ME-DEC';
}

module.exports = { detectPlayerModel };
```

---

## Implementation Requirements

### Phase 1: Minimal Viable Integration (Week 1-2)

**Goal:** Basic ad request/response flow

#### 1.1. Ad Request Handler

```javascript
// src/controllers/adController.js

const vistarService = require('../services/vistarService');
const htmlGenerator = require('../services/htmlGenerator');
const { detectPlayerModel } = require('../utils/playerDetector');
const { getSupportedMedia } = require('../config/players');

/**
 * Handle ad request from DCM
 * GET /ad?device_id={id}&display_area={area}&player_model={model}
 */
async function handleAdRequest(req, res) {
  try {
    const { device_id, display_area, venue_id } = req.query;
    
    // Validate required parameters
    if (!device_id || !display_area) {
      return res.status(400).json({ 
        error: 'Missing required parameters: device_id, display_area' 
      });
    }
    
    // Detect player model
    const playerModel = detectPlayerModel(device_id, req.query);
    const supportedMedia = getSupportedMedia(playerModel);
    
    // Build Vistar ad request
    const vistarRequest = {
      device_id,
      venue_id: venue_id || process.env.DEFAULT_VENUE_ID,
      display_time: Math.floor(Date.now() / 1000),
      display_area: [{
        id: display_area,
        width: 1920,
        height: 1080,
        allow_audio: false,
        supported_media: supportedMedia
      }]
    };
    
    // Request ad from Vistar
    const adResponse = await vistarService.getAd(vistarRequest);
    
    // Check if ad available
    if (!adResponse.advertisement || adResponse.advertisement.length === 0) {
      return res.status(204).send(); // No content
    }
    
    // Generate HTML5 player
    const ad = adResponse.advertisement[0];
    const html = htmlGenerator.generate(ad, playerModel);
    
    // Return HTML
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
    
  } catch (error) {
    console.error('Ad request error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { handleAdRequest };
```

#### 1.2. Vistar API Service

```javascript
// src/services/vistarService.js

const fetch = require('node-fetch');
const config = require('../config/vistar');

class VistarService {
  constructor() {
    this.baseUrl = config.apiUrl;
    this.networkId = config.networkId;
    this.apiKey = config.apiKey;
  }
  
  /**
   * Request ad from Vistar
   */
  async getAd(request) {
    const url = `${this.baseUrl}/api/v1/get_ad/json`;
    
    const body = {
      network_id: this.networkId,
      api_key: this.apiKey,
      ...request
    };
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Vistar API error ${response.status}: ${error}`);
    }
    
    return await response.json();
  }
  
  /**
   * Send Proof of Play to Vistar
   */
  async sendProofOfPlay(popUrl, displayTime) {
    let url = popUrl;
    
    // Append display_time if provided
    if (displayTime) {
      url += (url.includes('?') ? '&' : '?') + `display_time=${displayTime}`;
    }
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`PoP failed: ${response.status}`);
    }
    
    return await response.json();
  }
}

module.exports = new VistarService();
```

#### 1.3. HTML5 Player Generator

```javascript
// src/services/htmlGenerator.js

/**
 * Generate HTML5 player for ad
 */
function generate(ad, playerModel) {
  const { asset_url, proof_of_play_url, mime_type, length_in_seconds } = ad;
  
  // Check if video
  const isVideo = mime_type.startsWith('video/');
  
  // For ME-DEC, videos cannot be in HTML
  if (playerModel === 'ME-DEC' && isVideo) {
    return generateImageFallback();
  }
  
  // Generate HTML
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Vistar Ad</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      overflow: hidden;
    }
    body {
      background: #000;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100vw;
      height: 100vh;
    }
    img, video {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }
  </style>
</head>
<body>
  ${isVideo ? generateVideoTag(asset_url, length_in_seconds) : generateImageTag(asset_url)}
  
  <script>
    const popUrl = '${proof_of_play_url}';
    const displayTime = Math.floor(Date.now() / 1000);
    
    // Send PoP on load
    window.addEventListener('load', function() {
      sendPoP();
    });
    
    function sendPoP() {
      const endpoint = '/pop?url=' + encodeURIComponent(popUrl) + 
                      '&display_time=' + displayTime;
      
      fetch(endpoint)
        .then(response => {
          if (response.ok) {
            console.log('PoP sent successfully');
          } else {
            console.error('PoP failed:', response.status);
            retryPoP();
          }
        })
        .catch(error => {
          console.error('PoP error:', error);
          retryPoP();
        });
    }
    
    function retryPoP() {
      setTimeout(sendPoP, 5000); // Retry after 5 seconds
    }
  </script>
</body>
</html>
  `.trim();
  
  return html;
}

function generateImageTag(assetUrl) {
  return `<img src="${assetUrl}" alt="Ad">`;
}

function generateVideoTag(assetUrl, duration) {
  return `<video src="${assetUrl}" autoplay muted></video>`;
}

function generateImageFallback() {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>No Ad Available</title>
  <style>
    body {
      background: #000;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      font-family: Arial, sans-serif;
    }
  </style>
</head>
<body>
  <div>No compatible ad available</div>
</body>
</html>
  `.trim();
}

module.exports = { generate };
```

#### 1.4. PoP Handler

```javascript
// src/controllers/popController.js

const vistarService = require('../services/vistarService');

/**
 * Handle PoP callback from HTML player
 * GET /pop?url={encoded_pop_url}&display_time={epoch}
 */
async function handlePoP(req, res) {
  try {
    const { url, display_time } = req.query;
    
    if (!url) {
      return res.status(400).json({ error: 'Missing PoP URL' });
    }
    
    // Decode URL
    const popUrl = decodeURIComponent(url);
    
    // Send PoP to Vistar
    await vistarService.sendProofOfPlay(popUrl, display_time);
    
    res.status(200).json({ success: true });
    
  } catch (error) {
    console.error('PoP error:', error);
    res.status(500).json({ error: error.message });
  }
}

module.exports = { handlePoP };
```

---

### Phase 2: Creative Caching (Week 3)

**Goal:** Implement offline resilience

#### 2.1. Cache Service

```javascript
// src/services/cacheService.js

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const fetch = require('node-fetch');
const vistarService = require('./vistarService');

class CacheService {
  constructor() {
    this.cacheDir = process.env.CACHE_DIR || '/var/cache/vistar/creatives';
    this.updateInterval = parseInt(process.env.CACHE_UPDATE_INTERVAL) || 3600000;
  }
  
  /**
   * Initialize cache directory
   */
  async init() {
    await fs.mkdir(this.cacheDir, { recursive: true });
  }
  
  /**
   * Get cache key from asset URL
   */
  getCacheKey(assetUrl) {
    return crypto.createHash('md5').update(assetUrl).digest('hex');
  }
  
  /**
   * Get cache file path
   */
  getCacheFilePath(assetUrl) {
    const key = this.getCacheKey(assetUrl);
    const ext = path.extname(new URL(assetUrl).pathname);
    return path.join(this.cacheDir, `${key}${ext}`);
  }
  
  /**
   * Check if creative is cached
   */
  async isCached(assetUrl) {
    try {
      const filePath = this.getCacheFilePath(assetUrl);
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * Get cached creative file path
   */
  async getCached(assetUrl) {
    if (await this.isCached(assetUrl)) {
      return this.getCacheFilePath(assetUrl);
    }
    return null;
  }
  
  /**
   * Download and cache creative
   */
  async cacheCreative(assetUrl) {
    const filePath = this.getCacheFilePath(assetUrl);
    
    // Download creative
    const response = await fetch(assetUrl);
    if (!response.ok) {
      throw new Error(`Failed to download: ${response.status}`);
    }
    
    // Save to cache
    const buffer = await response.buffer();
    await fs.writeFile(filePath, buffer);
    
    console.log(`Cached: ${assetUrl}`);
    return filePath;
  }
  
  /**
   * Update cache for venue
   */
  async updateCacheForVenue(venueId, deviceId, displayArea) {
    try {
      // Request creatives from caching endpoint
      const request = {
        device_id: deviceId,
        venue_id: venueId,
        display_time: Math.floor(Date.now() / 1000),
        display_area: [displayArea]
      };
      
      const response = await vistarService.getCachedCreatives(request);
      
      if (!response.advertisement || response.advertisement.length === 0) {
        console.log(`No creatives to cache for venue ${venueId}`);
        return;
      }
      
      // Cache each creative
      for (const ad of response.advertisement) {
        try {
          if (!await this.isCached(ad.asset_url)) {
            await this.cacheCreative(ad.asset_url);
          }
        } catch (error) {
          console.error(`Failed to cache ${ad.asset_url}:`, error.message);
        }
      }
      
      console.log(`Cache updated for venue ${venueId}: ${response.advertisement.length} creatives`);
      
    } catch (error) {
      console.error(`Cache update failed for venue ${venueId}:`, error);
    }
  }
  
  /**
   * Start periodic cache updates
   */
  startPeriodicUpdates(venueId, deviceId, displayArea) {
    // Initial update
    this.updateCacheForVenue(venueId, deviceId, displayArea);
    
    // Periodic updates
    setInterval(() => {
      this.updateCacheForVenue(venueId, deviceId, displayArea);
    }, this.updateInterval);
    
    console.log(`Cache updates started for venue ${venueId} (interval: ${this.updateInterval}ms)`);
  }
}

module.exports = new CacheService();
```

#### 2.2. Add Caching Endpoint to Vistar Service

```javascript
// src/services/vistarService.js (add method)

/**
 * Get cached creatives for venue
 */
async getCachedCreatives(request) {
  const url = `${this.baseUrl}/api/v1/get_asset/json`;
  
  const body = {
    network_id: this.networkId,
    api_key: this.apiKey,
    ...request
  };
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  
  if (!response.ok) {
    throw new Error(`Vistar Caching API error: ${response.status}`);
  }
  
  return await response.json();
}
```

---

## Testing Strategy

### 1. Staging Environment

**Access:**
- URL: https://staging-trafficking.vistarmedia.com/
- Credentials: Provided by Vistar team via email

**Setup Steps:**
1. Log in to staging platform
2. Navigate to **Networks** → View your network
3. Click **Venues** tab → Verify test venues
4. Click **Orders** → Verify test campaigns are active

### 2. Unit Tests

```javascript
// tests/unit/vistarService.test.js

const vistarService = require('../../src/services/vistarService');

describe('VistarService', () => {
  describe('getAd', () => {
    it('should request ad from Vistar API', async () => {
      const request = {
        device_id: 'TEST001',
        venue_id: 'TEST_VENUE',
        display_time: Math.floor(Date.now() / 1000),
        display_area: [{
          id: 'main',
          width: 1920,
          height: 1080,
          supported_media: ['image/jpeg']
        }]
      };
      
      const response = await vistarService.getAd(request);
      expect(response).toHaveProperty('advertisement');
    });
  });
});
```

### 3. Integration Tests

```bash
# Run integration tests
npm run test:integration
```

### 4. Manual Testing Checklist

- [ ] Ad request returns valid response
- [ ] HTML player displays correctly
- [ ] PoP is sent on load
- [ ] PoP succeeds (check Vistar logs)
- [ ] Cache is populated
- [ ] Cached creatives are served
- [ ] No ad scenario handled gracefully

---

## Error Handling

### Error Response Format

```javascript
// src/middleware/errorHandler.js

function errorHandler(err, req, res, next) {
  console.error('Error:', err);
  
  // Vistar API errors
  if (err.message.includes('Vistar API error')) {
    return res.status(502).json({
      error: 'Vistar API unavailable',
      details: err.message
    });
  }
  
  // Validation errors
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Invalid request',
      details: err.message
    });
  }
  
  // Default error
  res.status(500).json({
    error: 'Internal server error'
  });
}

module.exports = errorHandler;
```

### Retry Logic

```javascript
// src/utils/retry.js

async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      
      const delay = baseDelay * Math.pow(2, i);
      console.log(`Retry ${i + 1}/${maxRetries} after ${delay}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

module.exports = { retryWithBackoff };
```

---

## Monitoring & Metrics

### Prometheus Metrics

```javascript
// src/utils/metrics.js

const prometheus = require('prom-client');

// Create metrics
const adRequestsTotal = new prometheus.Counter({
  name: 'vistar_ad_requests_total',
  help: 'Total number of ad requests',
  labelNames: ['status', 'player_model']
});

const adResponsesTotal = new prometheus.Counter({
  name: 'vistar_ad_responses_total',
  help: 'Total number of ad responses',
  labelNames: ['has_ad', 'player_model']
});

const cacheHitRate = new prometheus.Gauge({
  name: 'vistar_cache_hit_rate',
  help: 'Cache hit rate percentage'
});

const popSuccessRate = new prometheus.Gauge({
  name: 'vistar_pop_success_rate',
  help: 'PoP success rate percentage'
});

const displayTimeLatency = new prometheus.Histogram({
  name: 'vistar_display_time_latency_seconds',
  help: 'Display time latency in seconds',
  buckets: [1, 5, 10, 30, 60, 120, 300, 900]
});

const popTimeLatency = new prometheus.Histogram({
  name: 'vistar_pop_time_latency_seconds',
  help: 'PoP time latency in seconds',
  buckets: [1, 5, 10, 30, 60, 120, 300, 900]
});

// Metrics endpoint
function setupMetricsEndpoint(app) {
  app.get('/metrics', async (req, res) => {
    res.set('Content-Type', prometheus.register.contentType);
    res.end(await prometheus.register.metrics());
  });
}

module.exports = {
  adRequestsTotal,
  adResponsesTotal,
  cacheHitRate,
  popSuccessRate,
  displayTimeLatency,
  popTimeLatency,
  setupMetricsEndpoint
};
```

### Usage in Controllers

```javascript
// src/controllers/adController.js (updated)

const metrics = require('../utils/metrics');

async function handleAdRequest(req, res) {
  const startTime = Date.now();
  
  try {
    // ... existing code ...
    
    // Record metrics
    metrics.adRequestsTotal.inc({ 
      status: 'success', 
      player_model: playerModel 
    });
    
    metrics.adResponsesTotal.inc({ 
      has_ad: adResponse.advertisement.length > 0, 
      player_model: playerModel 
    });
    
    const latency = (Date.now() - startTime) / 1000;
    metrics.displayTimeLatency.observe(latency);
    
    // ... existing code ...
    
  } catch (error) {
    metrics.adRequestsTotal.inc({ 
      status: 'error', 
      player_model: playerModel 
    });
    throw error;
  }
}
```

---

## Additional Resources

### Vistar Documentation
- Staging Platform: https://staging-trafficking.vistarmedia.com/
- Production Platform: https://trafficking.vistarmedia.com/
- Support: support@vistarmedia.com

### Project Documentation
- Architecture Diagrams: `docs/ARCHITECTURE_DIAGRAMS.md`
- Integration Approach: `docs/INTEGRATION_APPROACH.md`
- Integration Summary: `docs/INTEGRATION_SUMMARY.md`
- Integration Summary (JP): `docs/INTEGRATION_SUMMARY_JP.md`

### Vistar Contacts
- **Janice Ong** - Manager, Supply Operations APAC (jong@vistarmedia.com)
- **Kurt Woodford** - Technical Contact (kwoodford@vistarmedia.com)

---

## Next Steps

1. **Set up development environment**
   - Clone repository
   - Install dependencies
   - Configure `.env` file

2. **Obtain Vistar staging credentials**
   - Contact Vistar team
   - Access staging platform
   - Retrieve network_id and api_key

3. **Implement Phase 1**
   - Ad request handler
   - HTML5 player generator
   - PoP handler
   - Basic error handling

4. **Test in staging**
   - Manual testing
   - Integration tests
   - Verify PoP submission

5. **Implement Phase 2**
   - Creative caching service
   - Cache management
   - Periodic updates

6. **Schedule Vistar integration call**
   - After Phase 1 completion
   - Review implementation
   - Discuss Phase 2 approach

---

**Last Updated:** October 27, 2025  
**Version:** 1.0.0  
**Maintainer:** Yoshihiko Miyaichi (yoshihiko.miyaichi@pier1.co.jp)

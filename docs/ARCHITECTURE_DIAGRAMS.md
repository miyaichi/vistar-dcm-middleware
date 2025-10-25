# Architecture Diagrams

## High-Level Integration Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     Vistar Media Ad Server                      │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │ Ad Request   │  │   Creative   │  │  Proof of    │           │
│  │     API      │  │  Caching API │  │     Play     │           │
│  └──────────────┘  └──────────────┘  └──────────────┘           │
└─────────────────────────────────────────────────────────────────┘
         ▲                  ▲                  ▲
         │                  │                  │
         │ (1) Ad Request   │ (2) Cache Update │ (3) PoP
         │                  │                  │
         ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────────────────┐
│              Middleware Server (Our Development)                │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │   Vistar     │  │   Creative   │  │     HTML5    │           │
│  │ API Service  │  │Cache Manager │  │   Generator  │           │
│  └──────────────┘  └──────────────┘  └──────────────┘           │
│                                                                 │
│  ┌──────────────────────────────────────────────────┐           │
│  │         Local Creative Cache Storage             │           │
│  │  /var/cache/vistar/creatives/                    │           │
│  └──────────────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────────┘
         │
         │ (4) HTML5 Player via URI Asset
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                  MEDIAEDGE DCM System                           │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │   Material   │  │    Layout    │  │  Playlist/   │           │
│  │  (URI Asset) │  │   Designer   │  │  Schedule    │           │
│  └──────────────┘  └──────────────┘  └──────────────┘           │
└─────────────────────────────────────────────────────────────────┘
         │
         │ (5) FTP/HTTP Distribution
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Digital Signage Players                      │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │   ME-DEC     │  │ USDP-R5000/  │  │ USDP-R1000   │           │
│  │              │  │     R2200    │  │              │           │
│  │ (HTML only)  │  │(Full HTML5)  │  │ (No HTML)    │           │
│  └──────────────┘  └──────────────┘  └──────────────┘           │
└─────────────────────────────────────────────────────────────────┘
```

## Detailed Ad Delivery Flow

### Scenario 1: Cache Hit (Optimal Path)

```
1. DCM Schedule Trigger (10:00:00)
         ↓
2. Load URI: /ad?device_id=DEC001&area=main
         ↓
3. Middleware: Ad Request to Vistar (10:00:01)
         ↓
4. Vistar Response: creative_id=12345, asset_url=xxx (10:00:02)
         ↓
5. Check Local Cache
         ├─→ [CACHE HIT] ✅
         │
6. Generate HTML with cached asset (10:00:02)
         ↓
7. Return HTML to DCM
         ↓
8. Player displays ad (10:00:03)
         ↓
9. onload event → PoP to Vistar (10:00:03)

Total Latency: ~3 seconds
```

### Scenario 2: Cache Miss (Fallback Path)

```
1. DCM Schedule Trigger (10:00:00)
         ↓
2. Load URI: /ad?device_id=DEC001&area=main
         ↓
3. Middleware: Ad Request to Vistar (10:00:01)
         ↓
4. Vistar Response: creative_id=12346, asset_url=yyy (10:00:02)
         ↓
5. Check Local Cache
         ├─→ [CACHE MISS] ⚠️
         │
6. Generate HTML with origin asset_url (10:00:02)
         ↓
7. Background: Download to cache for next time
         ↓
8. Return HTML to DCM
         ↓
9. Player downloads asset from Vistar (10:00:03-10:00:15)
         ↓
10. Player displays ad (10:00:15)
         ↓
11. onload event → PoP to Vistar (10:00:15)

Total Latency: ~15 seconds
Next request for same creative: ~3 seconds ✅
```

### Scenario 3: Network Interruption (Cache Resilience)

```
1. DCM Schedule Trigger (10:00:00)
         ↓
2. Load URI: /ad?device_id=DEC001&area=main
         ↓
3. Middleware: Ad Request to Vistar
         ├─→ [NETWORK ERROR] ⚠️
         │
4. Fallback: Return most recent cached ad
         ↓
5. Player displays cached ad (10:00:05)
         ↓
6. Retry PoP when network recovers

Without Cache: ❌ Black screen / No ad
With Cache: ✅ Display continues
```

## Cache Update Cycle

```
Every Hour (Background Process):

┌────────────────────────────────────────┐
│  Creative Cache Update Cycle           │
│                                        │
│  1. Call Vistar Caching API            │
│     GET /api/v1/cache_creatives/json   │
│                                        │
│  2. Receive creative list:             │
│     - creative_id: 12345               │
│     - creative_id: 12346               │
│     - creative_id: 12347               │
│     ...                                │
│                                        │
│  3. For each creative:                 │
│     - Check if already cached          │
│     - Download if new/updated          │
│     - Store in /var/cache/vistar/      │
│                                        │
│  4. Cleanup old/expired creatives      │
│                                        │
│  5. Update cache index                 │
└────────────────────────────────────────┘

Result: 90%+ cache hit rate
```

## Player-Specific Handling

```
┌─────────────────────────────────────────────────────────────┐
│  Ad Request with Player Detection                           │
└─────────────────────────────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
    ┌────────┐     ┌────────┐     ┌────────┐
    │ME-DEC  │     │USDP-R5k│     │USDP-R1k│
    └────────┘     └────────┘     └────────┘
         │               │               │
         ▼               ▼               ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│Request:      │ │Request:      │ │Direct file   │
│image/jpeg    │ │image/jpeg    │ │download      │
│image/png     │ │image/png     │ │(no HTML)     │
│              │ │video/mp4     │ │              │
└──────────────┘ └──────────────┘ └──────────────┘
         │               │               │
         ▼               ▼               ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│Generate:     │ │Generate:     │ │Return:       │
│<img> HTML    │ │<img> or      │ │Direct URL    │
│              │ │<video> HTML  │ │              │
└──────────────┘ └──────────────┘ └──────────────┘
```

## Comparison: Broadsign vs Our Approach

```
Broadsign Web Redirect:
┌─────────┐      ┌─────────┐      ┌─────────┐
│ Vistar  │─────→│Broadsign│─────→│ Player  │
│  URL    │      │   CMS   │      │         │
└─────────┘      └─────────┘      └─────────┘
     Real-time only ⚠️
     No caching
     Network-dependent


Our DCM Integration:
┌─────────┐      ┌────────────┐      ┌─────────┐      ┌─────────┐
│ Vistar  │←────→│ Middleware │←────→│   DCM   │─────→│ Player  │
│   API   │      │ + Cache    │      │         │      │         │
└─────────┘      └────────────┘      └─────────┘      └─────────┘
                       ↓
                 ┌─────────┐
                 │  Local  │
                 │  Cache  │ ✅ Offline resilience
                 └─────────┘ ✅ Faster delivery
                             ✅ Better stability
```

## Expected Performance Improvements

```
Metric Comparison:

Display Time Latency:
Broadsign:  ████████████████ (5-30 seconds)
Our System: ██ (1-5 seconds) ✅ 80% improvement

Spend Rate:
Broadsign:  ████████████████████ (85-90%)
Our System: ███████████████████████ (95%+) ✅ +5-10%

Network Resilience:
Broadsign:  ██ (Low)
Our System: ██████████ (High) ✅ Cache-based

Cache Hit Rate:
Broadsign:  N/A (No caching)
Our System: ████████████████████ (90%+) ✅ New capability
```

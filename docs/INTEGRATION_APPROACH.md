# Integration Approach: MEDIAEDGE DCM with Vistar Media

**Date:** October 26, 2025  
**From:** Yoshihiko Miyaichi (HWT / Pier One)  
**To:** Vistar Media Integration Team  
**Subject:** Implementation Plan for DCM-Vistar Integration

---

## Executive Summary

Following our previous discussion and your confirmation that the **middleware approach is technically feasible**, we are ready to begin development. This document outlines our implementation strategy, which follows a **Broadsign Web Redirect-style integration** enhanced with **Creative Caching** for improved stability.

---

## Integration Architecture

### Overview Diagram

```
[Vistar Media Ad Server]
    ↕
    │ (1) Ad Request API
    │ (2) Creative Caching API  
    │ (3) Proof of Play
    ↕
[Middleware Server] ← Our Development
    │ - Node.js/Express
    │ - HTML5 Generation
    │ - Creative Cache Management
    ↕
[MEDIAEDGE DCM]
    │ (URI Asset Registration)
    ↕
[Digital Signage Players]
    - ME-DEC
    - USDP-R5000/R2200
    - USDP-R1000
```

### Integration Pattern

Our approach is **similar to Broadsign Web Redirect** with key enhancements:

| Aspect | Broadsign Web Redirect | Our DCM Implementation |
|--------|------------------------|------------------------|
| Integration Type | Custom URL → CMS | Custom Middleware → DCM |
| Ad Request | Vistar-managed | Self-managed via API |
| Creative Delivery | Real-time only | **Cached + Real-time** |
| PoP Handling | Vistar-managed | Self-managed via API |
| Player Optimization | Limited | **Per-model optimization** |

---

## Key Implementation Features

### 1. **Creative Caching (Primary Enhancement)**

**Objective:** Achieve better stability than Broadsign Web Redirect

**Implementation:**
- Use Vistar Creative Caching API (`/api/v1/cache_creatives/json`)
- Periodic background cache updates (every 1 hour)
- Local storage of creative assets
- Fallback to real-time download if cache miss

**Benefits:**
- ✅ Resilience to network interruptions
- ✅ Faster ad display (1-5 seconds vs 5-30 seconds)
- ✅ Higher Spend Rate (target: 95%+)
- ✅ Lower Display Time Latency

### 2. **Player-Specific Optimization**

**Challenge:** Different MEDIAEDGE players have different capabilities

**Solution:** Dynamic `supported_media` parameter based on player model

```javascript
// Example: Player-specific ad requests
ME-DEC:           supported_media: ['image/jpeg', 'image/png']
USDP-R5000/R2200: supported_media: ['image/jpeg', 'image/png', 'video/mp4']
USDP-R1000:       Direct file download (no HTML)
```

This ensures each player only requests compatible creative types.

### 3. **15-Minute PoP Compliance**

**Implementation:**
- HTML `onload` event triggers PoP immediately after creative display
- Backup retry mechanism for failed PoP requests
- Monitoring of PoP time latency

**Target:** PoP within 1-5 minutes (well within 15-minute requirement)

### 4. **Dynamic Creative Support**

**Implementation:**
- `asset_url`-based caching (as per Vistar requirements)
- No outdated creative delivery (fresh requests when needed)
- Support for JPEG dynamic creatives

---

## Development Roadmap

### Phase 1: Minimal Viable Integration (Week 1-2)
**Goal:** Basic ad request/response flow working

- [x] Project setup and repository creation
- [ ] Ad Request API integration
- [ ] Simple HTML5 player generation
- [ ] Basic PoP implementation
- [ ] Initial staging environment testing

**Milestone:** First ad displays on test player

### Phase 2: Creative Caching (Week 3)
**Goal:** Implement offline resilience

- [ ] Creative Caching API integration
- [ ] Local cache management
- [ ] Cache hit/miss handling
- [ ] Background cache updates

**Milestone:** Ads display even during network interruption

### Phase 3: Multi-Player Support (Week 4)
**Goal:** Optimize for all MEDIAEDGE player models

- [ ] Player detection logic
- [ ] Per-model `supported_media` configuration
- [ ] HTML generation variations
- [ ] USDP-R1000 direct file support

**Milestone:** All player types working correctly

### Phase 4: Production Readiness (Week 5-6)
**Goal:** Meet Vistar integration standards

- [ ] Monitoring and metrics
- [ ] Error handling refinement
- [ ] Performance optimization
- [ ] Documentation completion

**Milestone:** Ready for Certification Test

---

## Technical Specifications

### Middleware Server
- **Technology:** Node.js 18+ / Express
- **Deployment:** Docker container
- **Cache Storage:** Local filesystem
- **Monitoring:** Prometheus metrics

### DCM Integration
- **Method:** URI asset type
- **URL Format:** `http://middleware:3000/ad?device_id={id}&display_area={area}`
- **Refresh:** Dynamic per request
- **Duration:** Matches Vistar spot duration

### Vistar API Usage
- **Ad Request:** Standard Ad Serving API
- **Creative Caching:** Periodic bulk requests
- **PoP:** Standard proof_of_play_url
- **Environment:** Staging → Production

---

## Anticipated Integration Health Metrics

Based on our approach, we expect to achieve:

| Metric | Target | Broadsign Typical | Our Approach Advantage |
|--------|--------|-------------------|----------------------|
| **Spend Rate** | 95%+ | 85-90% | +5-10% via caching |
| **Display Time Latency** | 1-5 sec | 5-30 sec | 80% reduction |
| **Cache Hit Rate** | 90%+ | N/A | New capability |
| **PoP Success Rate** | 99%+ | 95%+ | Retry mechanism |

---

## Questions for Vistar Team

Before we proceed with full implementation, we'd appreciate confirmation on:

### 1. **Creative Caching Strategy**
- **Q:** Is our planned caching approach (hourly updates, local storage) aligned with best practices?
- **Q:** Are there any rate limits on Creative Caching API calls we should be aware of?

### 2. **Player Constraints Handling**
- **Q:** For ME-DEC (no video in HTML), should we:
  - Request only static images via `supported_media`, OR
  - Request videos but serve as separate file downloads?
- **Q:** Any special considerations for USDP-R1000 (no HTML support)?

### 3. **Testing Process**
- **Q:** Can we schedule an initial testing call once Phase 1 is complete (estimated 2 weeks)?
- **Q:** What are the minimum requirements to proceed to Initial Integration Test?

### 4. **Dynamic Creative Requirements**
- **Q:** Any additional requirements beyond `asset_url`-based caching and JPEG support?
- **Q:** Expected frequency of dynamic creative updates?

---

## Next Steps

1. **This Week:** Complete Phase 1 implementation
2. **Week 2:** Set up test player in staging environment
3. **Week 2-3:** Begin initial testing with Vistar team
4. **Week 3-4:** Implement Creative Caching
5. **Week 5-6:** Complete multi-player support and prepare for certification

---

## Contact Information

**Project Lead:**  
Yoshihiko Miyaichi  
yoshihiko.miyaichi@pier1.co.jp

**GitHub Repository:**  
https://github.com/miyaichi/vistar-dcm-middleware

**Preferred Communication:**
- Email for formal updates
- Video call for technical discussions
- GitHub issues for specific technical questions

---

## Summary

Our implementation approach:
- ✅ Follows proven Broadsign Web Redirect pattern
- ✅ Enhances with Creative Caching for superior stability
- ✅ Optimizes for MEDIAEDGE player constraints
- ✅ Targets >95% Spend Rate and <5 second Display Time Latency
- ✅ Fully compliant with Vistar integration requirements

We look forward to your feedback and guidance as we proceed with development.

---

**Attachments:**
- Previous technical inquiry letter (for reference)
- Vistar team's response confirming middleware approach

**CC:**  
- Janice Ong (jong@vistarmedia.com) - Manager, Supply Operations APAC
- Kurt Woodford (kwoodford@vistarmedia.com)

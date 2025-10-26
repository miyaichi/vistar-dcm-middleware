# DCM-Vistar Integration Approach - Quick Summary

## Integration Pattern
**Similar to Broadsign Web Redirect + Creative Caching Enhancement**

```
[Vistar Ad Server] ↔ [Middleware Server] ↔ [DCM] → [Players]
                      (Node.js/Express)
```

## Key Differences from Broadsign

| Feature | Broadsign | Our DCM Implementation |
|---------|-----------|------------------------|
| Creative Caching | ❌ Not supported | ✅ Vistar Caching API |
| Real-time Delivery | Only option | Cached + fallback |
| Stability | Network-dependent | Offline-resilient |
| Expected Spend Rate | 85-90% | **95%+** |
| Display Time Latency | 5-30 sec | **<60 sec** (1-5 sec with cache hit) |

## Three Core Enhancements

### 1. Creative Caching (Primary Value-Add)
- Hourly background updates via Vistar Creative Caching API
- Local filesystem storage
- Instant delivery from cache (1-5 sec typical)
- Network interruption resilience
- Target: <60 seconds display time latency (Vistar requirement: <15 min)

### 2. Player-Specific Optimization
```
ME-DEC:           image/jpeg, image/png only
USDP-R5000/R2200: image/jpeg, image/png, video/mp4
USDP-R1000:       Direct file download (no HTML)
```

### 3. PoP Compliance
- HTML onload event → immediate PoP
- Retry mechanism for failures
- Target: <5 minutes (well within 15-minute requirement)

## Development Timeline

**Week 1-2:** Basic ad request/response + HTML generation  
**Week 3:** Creative Caching implementation  
**Week 4:** Multi-player support  
**Week 5-6:** Production readiness + certification prep

## Questions for Vistar

1. **Caching:** Any rate limits on Creative Caching API?
2. **ME-DEC (no video in HTML):** Request only images, or request videos + serve as files?
3. **Testing:** Can we schedule initial test call after Week 2?
4. **Dynamic Creative:** Any requirements beyond asset_url-based caching?

## Repository
https://github.com/miyaichi/vistar-dcm-middleware

---

**Full details in attached INTEGRATION_APPROACH.md**

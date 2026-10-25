# Terrain and weather request behavior

Checked 2026-10-25.

**Updated architecture:** live environment calls now use an authenticated,
server-metered gateway with record-only API credits and provider budgets. The
direct-request isolation analysis below describes the earlier implementation.
See [API credits](API_CREDITS.md) for current enforcement and deployment steps.

Mounted, visible radar and outside views register demand. Unmounting or switching
radar mode removes demand. Viewport visibility is checked once per second;
document visibility changes stop work immediately. The last consumer leaving
clears queued work, cancels the current request, and rejects late results.
Offline mode stops both radar services. Flight physics retains its separate
point-elevation lookup while active, with cancellation on unmount/page hiding.

Settings → Terrain & weather sampling controls grid spacing, minimum request
interval, and maximum range independently for terrain and weather. Preferences
are stored locally, work without storage for the current session, and synchronize
between tabs. Changing spacing clears the affected grid cache before new samples
are accepted. Multiple active views merge their requested cells.

Defaults:

| Grid | Spacing | Request interval | Maximum range |
| --- | --- | --- | --- |
| Terrain | 0.01° (~1.1 km north/south) | 2 seconds | 20 NM |
| Weather | 0.05° (~5.6 km north/south) | 2 seconds | 40 NM |

Terrain requests batch up to 20 coordinates. Weather requests fetch one sample.
Weather samples expire after five minutes. Finer weather sampling does not
increase the underlying forecast model's resolution. Large, fine grids may not
fully populate before weather samples expire; nearby cells receive priority.
Provider backoff can extend the selected interval. These are request intervals,
not guarantees that the complete map refreshes at that frequency.

## Can one abusive user affect everyone?

There is no shared application API key or backend proxy on these radar paths.
Requests go directly from the browser to the provider. The previous public CORS
proxy for the OpenTopoData fallback has been removed: its shared upstream IP
could pool unrelated users' traffic. If direct fallback requests fail CORS,
terrain remains pending and previously valid data is retained.

This reduces shared-quota risk but does **not** guarantee global isolation:

- [Open-Elevation terms](https://open-elevation.com/terms.html) specify an anonymous
  allowance per IP and account allowances measured in coordinates. Twenty
  coordinates in one HTTP request still consume twenty coordinates. Slowing
  requests cannot prevent eventual allowance exhaustion.
- [Open-Meteo terms](https://open-meteo.com/en/terms) explicitly apply limits by IP
  **and application**, and allow application blocks. An application-level block
  could affect users worldwide even with direct browser requests.
- [OpenTopoData public API](https://www.opentopodata.org/#public-api) documents
  100 locations/request, one call/second, and 1,000 calls/day; it does not establish
  an isolation guarantee for this app.
- Users behind the same NAT, VPN, or corporate network can share an IP allowance.
- Client throttles and cooldowns are per tab, and reloads reset them. A malicious
  client can bypass browser controls. These controls reduce accidental traffic;
  they are not enforceable abuse protection.

Stronger isolation requires a managed backend with authenticated per-user limits,
a global upstream budget and cache, and a dedicated provider agreement or
self-hosted terrain data. Merely moving requests to a shared backend would pool
IP quotas again. No backend, subscription, or deployment was added in this change.

## Offline verification

`node --test tests/radar_demand.test.js tests/terrain_requests.test.js`

The tests use virtual time and mocked fetches. They cover absence/removal of
demand, cancellation, hidden/offline pause and resume, multiple consumers,
preference changes, provider cooldowns, direct fallback routing, invalid weather
samples, and weather cache expiry. No live terrain/weather requests are sent.

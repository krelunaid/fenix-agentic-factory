# Provider health load evidence — 2026-08-29

Run from Europe/Rome against the three production Worker health endpoints. Each service received 60 requests in batches of 10 concurrent requests. A response counted only when the HTTP status was successful and the body was fully consumed.

| Service | Success | p50 | p95 | Max |
| --- | ---: | ---: | ---: | ---: |
| Sandbox Worker | 60/60 | 40 ms | 187 ms | 213 ms |
| AI Worker | 60/60 | 55 ms | 269 ms | 271 ms |
| Visual Worker | 60/60 | 62 ms | 313 ms | 332 ms |

This is a control-plane health load check, not an inference, container-start or browser-render capacity benchmark. It supports provider reachability only and must not be used as evidence that C1–C15 passed.

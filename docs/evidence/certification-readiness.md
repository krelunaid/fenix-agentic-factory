# C1–C15 certification readiness

The release threshold remains fail-closed. `READY` means the internal implementation needed to attempt a black-box run exists; it does not mean the scenario passed. `BLOCKED` identifies the external capability or complete run evidence still missing. Each scenario needs three independent clean-environment runs with prompt, timing, cost, build, tests, screenshots, release and defects.

| Scenario | Readiness | Missing evidence / blocker |
| --- | --- | --- |
| C1 SaaS from one prompt | READY | Three complete non-technical-user runs and export evidence |
| C2 Local visual revision | READY | Three perceptual screenshot diffs; only exact-hash diff is implemented |
| C3 Bug recovery | READY | Three injected runtime-fault runs with ≤3 attempts |
| C4 Rollback and fork | BLOCKED | Physical restore requires R2 enablement; logical graph is implemented |
| C5 GitHub | BLOCKED | GitHub App/OAuth installation and repository credentials |
| C6 Deploy and domain | BLOCKED | Deploy provider, domain ownership and DNS/SSL credentials |
| C7 Stripe/email/webhook | BLOCKED | Test-mode Stripe, email and webhook provider credentials |
| C8 AI app | READY | Three provider-switch/fallback runs; managed text/vision/image evidence exists |
| C9 Mobile Expo | BLOCKED | Expo/EAS account, signing and iOS/Android build providers |
| C10 Agent Studio | READY | Three evaluation runs; subagent sandbox and publish eval remain incomplete |
| C11 MCP | BLOCKED | OAuth client/server transport and external MCP caller |
| C12 Import repository | BLOCKED | Real GitHub repository installation and PR evidence |
| C13 Budget | READY | Three clean runs proving pause and resume at a low cap |
| C14 Tenant isolation | READY | Three black-box dual-organization runs beyond policy/unit coverage |
| C15 Continuity | BLOCKED | Durable external queue/worker restart injection and resume evidence |

Global blockers: R2 is disabled for the Cloudflare account; MeloTTS currently returns provider error 3043; no GitHub, deploy/domain, Stripe/email, Expo/EAS or MCP OAuth credentials have been supplied. These rows must remain non-pass until their real evidence exists.

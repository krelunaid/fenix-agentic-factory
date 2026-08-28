# Stato implementazione

Legenda: `PASS` completato con evidence, `PARTIAL` slice reale ma incompleta, `PLANNED` non iniziato.

| Fase | Stato | Nota |
| --- | --- | --- |
| 0 - Baseline greenfield | PASS | Stack, confini e capacità mancanti documentati |
| 1 - Brand FENIX | PASS | Nome, metadata e copy originali |
| 2 - Design system e shell | PARTIAL | Home e workspace responsive implementati; manca suite visuale |
| 3 - Identity e project core | PARTIAL | Identità ChatGPT, D1, organizzazioni, membership, CRUD progetto e audit |
| 4 - Conversation e brief | PARTIAL | Brief versionato, API protetta e schema conversazioni/messaggi; streaming AI da collegare |
| 5 - Task graph | PARTIAL | DAG, dipendenze, claim atomico, tentativi e state machine persistenti |
| 6 - Queue ed eventi | PARTIAL | Worker contract, completion, replay SSE e budget gate; manca una queue esterna durabile |
| 7 - Sandbox provider | PASS | Worker Cloudflare Sandbox distribuito, HMAC, scope deterministico, command/path policy, health, signed exec e destroy verificati |
| 8 - Scaffold full-stack | PASS | Template React/Worker/D1 deterministico con lockfile; install, typecheck, lint, unit test e build verificati da zero |
| 9 - Preview Engine | PASS | Processo sandbox persistente, port readiness, quick tunnel, HTTP 200/body atteso, device frame e cleanup verificati |
| 10 - Repo index e patch | PARTIAL | Applicatore sandbox atomico con hash precondition, path/freeze policy, delete approval, audit e rollback compensativo; manca il runner visuale end-to-end |
| 11 - QA ed evidence | PARTIAL | Registry artifact, quality run, evidence fail-closed e defect lifecycle; runner browser/a11y esterno da collegare |
| 12 - Recovery e fork | PARTIAL | Recovery graph, snapshot artifact contract e rollback planning; restore fisico provider da collegare |
| 13 - AI Gateway e costi | PARTIAL | Workers AI text/vision distribuito e firmato, routing, budget, call/usage ledger e costo reale; restano image generation e BYOK esterni |
| 14 - GitHub | PARTIAL | Source connection, sync/conflict records, no-force/secret policy e PR evidence summary; GitHub App/OAuth non configurata |
| 15 - Deploy e domini | PARTIAL | Release artifact, quality/smoke/approval gate, rollback target, deployment/domain records; provider esterno non collegato |
| 16 - Integrazioni | PARTIAL | Manifest connection, secret reference, revoke, redaction, idempotency e approval policy; adapter esterni non configurati |
| 17 - Mobile Expo | PARTIAL | Mobile profile, native compatibility/permission policy e build records; EAS/native builder non collegato |
| 18 - Billing | PARTIAL | Account/subscription/credit ledger, idempotenza, hard cap e reconciliation policy; payment provider non collegato |
| 19 - Voce | PARTIAL | Sessioni, it/en, retention opt-in, ambiguity/risk confirmation e text fallback; STT/TTS streaming non collegato |
| 20 - Agent Studio | PARTIAL | Profili/versioni, tool/knowledge/memory/guardrail contract, run trace/cost; worker AI non collegato |
| 21 - MCP | PARTIAL | Connection registry, permission/rate-limit/output policy e revoca; OAuth server e transport non distribuiti |
| 22 - Team | PARTIAL | Project members, ruoli, commenti/resolve e notifiche schema; delivery notifiche e multi-approval avanzato da collegare |
| 23 - Visual select | PARTIAL | DOM/source selection record, freeze policy, crop artifact e design token validation; browser mapping/diff runner non collegato |
| 24 - Hardening | PARTIAL | Operations API, provider health/backup/certification schema, SLO e runbook; C1-C15 x3 e load/restore reali non eseguiti |

## Evidence della slice

- Route principale: HTTP 200.
- Build di produzione: PASS.
- Lint: PASS, zero problemi.
- Metadata social: asset 1200 x 630 verificato.
- Migrazioni D1: 52 tabelle, indici e foreign key generate e ispezionate.
- Orchestratore: transizioni condizionali, human gate, task claim e result contract verificati da typecheck/build.
- Kernel di policy: 15 test su Build Plane, AI routing, integrazioni, source/deploy, mobile, billing, voce, agenti, MCP, RBAC, visual mapping e certification.
- Sandbox Worker: typecheck e deploy PASS; health 200, richiesta non firmata 401, signed exec isolata 200 con output atteso, destroy 200.
- Preview Engine: process start 201/running, port readiness, tunnel 200 con body atteso, process kill e sandbox destroy verificati.
- Scaffold full-stack: generazione isolata da template, installazione lockfile e gate typecheck/lint/unit/build tutti PASS.
- Patch runtime: write/read/delete firmati verificati sul sandbox distribuito; contenuto e precondition hash, rollback e audit sono fail-closed nel Control Plane.
- AI Gateway: Workers AI health PASS e inferenza firmata reale PASS (`FENIX_AI_OK`), con catalogo/costi correnti, token usage e ledger tenant-aware.
- Schema replay: 52 tabelle applicate in SQLite isolato, `foreign_key_check` con zero errori.
- Supply-chain audit production: zero vulnerabilità note dopo aggiornamento Next.js 16.3.3.
- Secret pattern scan repository: nessuna credenziale rilevata.

## Prossimo incremento consigliato

Collegare blob storage, image generation/BYOK, OAuth GitHub/MCP, deploy, mobile, payment e voice, quindi eseguire C1-C15 per tre run con evidence reali. Gli adapter restano dichiarati non operativi finché queste verifiche non passano.

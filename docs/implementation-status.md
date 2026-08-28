# Stato implementazione

Legenda: `PASS` completato con evidence, `PARTIAL` slice reale ma incompleta, `PLANNED` non iniziato.

| Fase | Stato | Nota |
| --- | --- | --- |
| 0 - Baseline greenfield | PASS | Stack, confini e capacità mancanti documentati |
| 1 - Brand FENIX | PASS | Nome, metadata e copy originali |
| 2 - Design system e shell | PARTIAL | Home e workspace responsive implementati; manca suite visuale |
| 3 - Identity e project core | PARTIAL | Identità ChatGPT, D1, organizzazioni, membership, CRUD progetto e audit |
| 4 - Conversation e brief | PARTIAL | Brief versionato, cronologia persistente e risposta Workers AI con trace/costi collegate alla UI; resta lo streaming token-by-token |
| 5 - Task graph | PARTIAL | DAG, dipendenze, claim atomico, tentativi e state machine persistenti |
| 6 - Queue ed eventi | PARTIAL | Worker contract, completion, replay SSE e budget gate; manca una queue esterna durabile |
| 7 - Sandbox provider | PASS | Worker Cloudflare Sandbox distribuito, HMAC, scope deterministico, command/path policy, health, signed exec e destroy verificati |
| 8 - Scaffold full-stack | PASS | Template React/Worker/D1 deterministico con lockfile; install, typecheck, lint, unit test e build verificati da zero |
| 9 - Preview Engine | PASS | Processo sandbox persistente, port readiness, quick tunnel, HTTP 200/body atteso, device frame e cleanup verificati |
| 10 - Repo index e patch | PARTIAL | Applicatore sandbox atomico con hash precondition, path/freeze policy, delete approval, audit e rollback compensativo; resta il patch planner semantico |
| 11 - QA ed evidence | PARTIAL | Registry artifact con blob bounded, quality run, evidence fail-closed, defect lifecycle e browser capture reale; resta una suite axe/performance completa |
| 12 - Recovery e fork | PARTIAL | Recovery graph, snapshot artifact contract e rollback planning; restore fisico provider da collegare |
| 13 - AI Gateway e costi | PARTIAL | Workers AI text/vision/image distribuito e firmato, routing, budget, call/usage ledger e validazione credenziale BYOK OpenAI; restano adapter BYOK d'inferenza e riconciliazione image-neurons |
| 14 - GitHub | PARTIAL | Secret broker, validazione token GitHub, source connection, sync/conflict records, no-force/secret policy e PR evidence summary; GitHub App/OAuth non configurata |
| 15 - Deploy e domini | PARTIAL | Release artifact, quality/smoke/approval gate, rollback target, deployment/domain records; provider esterno non collegato |
| 16 - Integrazioni | PARTIAL | Secret broker AES-256-GCM project-scoped, connect/validate/revoke, redaction, idempotency e approval policy; adapter execute esterni non configurati |
| 17 - Mobile Expo | PARTIAL | Mobile profile, native compatibility/permission policy e build records; EAS/native builder non collegato |
| 18 - Billing | PARTIAL | Account/subscription/credit ledger, idempotenza, hard cap e reconciliation policy; payment provider non collegato |
| 19 - Voce | PARTIAL | STT Whisper reale verificato, sessioni it/en, no audio retention, ambiguity/risk confirmation e fallback; TTS provider risponde 3043 e streaming/interruption restano degradati |
| 20 - Agent Studio | PARTIAL | Profili/versioni e managed inference reali con trace/cost cap; restano tool execution, knowledge retrieval, subagent sandbox ed eval publish |
| 21 - MCP | PARTIAL | Connection registry, permission/rate-limit/output policy e revoca; OAuth server e transport non distribuiti |
| 22 - Team | PARTIAL | Project-scoped RBAC reale, invite, comment threads, inbox persistente e quorum multi-approval con vote audit; resta delivery push/email |
| 23 - Visual select | PARTIAL | Browser runner HMAC/SSRF-guarded con DOM path, styles, crop PNG persistito, a11y snapshot, responsive viewport ed exact visual diff; resta il perceptual diff |
| 24 - Hardening | PARTIAL | Operations API, provider health/backup/certification project-scoped, SLO e runbook; C1-C15 x3 e load/restore reali non eseguiti |

## Evidence della slice

- Route principale: HTTP 200.
- Build di produzione: PASS.
- Lint: PASS, zero problemi.
- Metadata social: asset 1200 x 630 verificato.
- Migrazioni D1: 55 tabelle, indici e foreign key generate e ispezionate.
- Orchestratore: transizioni condizionali, human gate, task claim e result contract verificati da typecheck/build.
- Kernel di policy: 15 test su Build Plane, AI routing, integrazioni, source/deploy, mobile, billing, voce, agenti, MCP, RBAC, visual mapping e certification.
- Sandbox Worker: typecheck e deploy PASS; health 200, richiesta non firmata 401, signed exec isolata 200 con output atteso, destroy 200.
- Preview Engine: process start 201/running, port readiness, tunnel 200 con body atteso, process kill e sandbox destroy verificati.
- Scaffold full-stack: generazione isolata da template, installazione lockfile e gate typecheck/lint/unit/build tutti PASS.
- Patch runtime: write/read/delete firmati verificati sul sandbox distribuito; contenuto e precondition hash, rollback e audit sono fail-closed nel Control Plane.
- AI Gateway: health PASS; inferenza text firmata reale PASS (`FENIX_AI_OK`) e image generation FLUX reale PASS (JPEG base64 verificato), con catalogo, token usage e ledger tenant-aware.
- Conversation runtime: messaggi utente/assistente persistenti, risposta managed AI, trace, budget fail-closed e ledger collegati al composer del workspace.
- Secret broker: cifratura AES-256-GCM con AAD tenant/progetto/record, riferimenti opachi, revoca coordinata e validatori live GitHub/OpenAI/Stripe senza persistenza in chiaro.
- Voice provider: STT Whisper firmato PASS su audio AIFF reale (`Phoenix is operational.`); TTS MeloTTS configurato ma non dichiarato operativo perché il provider restituisce errore 3043.
- Visual runner: Browser Rendering firmato PASS su viewport mobile, selector mapping, bounding box, crop PNG hash e accessibility role.
- Artifact blob: crop PNG fino a 750 KB persistito in D1, referenziato dal registry e servito con scope job, CSP, nosniff ed ETag.
- Schema replay: 55 tabelle applicate in SQLite isolato, migrazione legacy certification preservata e `foreign_key_check` con zero errori.
- Supply-chain audit production: zero vulnerabilità note dopo aggiornamento Next.js 16.3.3 e sostituzione del downloader Puppeteer vulnerabile.
- Secret pattern scan repository: nessuna credenziale rilevata.

## Prossimo incremento consigliato

Collegare blob storage, image generation/BYOK, OAuth GitHub/MCP, deploy, mobile, payment e voice, quindi eseguire C1-C15 per tre run con evidence reali. Gli adapter restano dichiarati non operativi finché queste verifiche non passano.

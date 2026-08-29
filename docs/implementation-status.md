# Stato implementazione

Legenda: `PASS` completato con evidence, `PARTIAL` slice reale ma incompleta, `PLANNED` non iniziato.

| Fase | Stato | Nota |
| --- | --- | --- |
| 0 - Baseline greenfield | PASS | Stack, confini e capacità mancanti documentati |
| 1 - Brand FENIX | PASS | Nome, metadata e copy originali |
| 2 - Design system e shell | PARTIAL | Home e workspace responsive con chat, preview sandbox, repo, test e deploy reali; manca una regression suite visuale multi-browser |
| 3 - Identity e project core | PARTIAL | Identità ChatGPT, D1, organizzazioni, membership, CRUD progetto e audit |
| 4 - Conversation e brief | PASS | Product Architect con Workers AI, schema validato, fallback domain solver, brief versionato e artifact persistito |
| 5 - Task graph | PARTIAL | DAG, dipendenze, claim atomico, tentativi e state machine persistenti |
| 6 - Queue ed eventi | PARTIAL | Worker contract, completion, replay SSE e budget gate; manca una queue esterna durabile |
| 7 - Sandbox provider | PASS | Worker Cloudflare Sandbox distribuito, HMAC, scope deterministico, command/path policy, health, signed exec e destroy verificati |
| 8 - Generazione full-stack | PASS (web beta) | Generazione specifica per brief con client responsive, backend Node, SQLite, session auth, RBAC, CRUD, ricerca, metriche e source exportabile |
| 9 - Preview Engine | PASS | Processo sandbox persistente, port readiness, quick tunnel, HTTP 200/body atteso, device frame e cleanup verificati |
| 10 - Repo index e patch | PARTIAL | Applicatore sandbox atomico con hash precondition, path/freeze policy, delete approval, audit e rollback compensativo; resta il patch planner semantico |
| 11 - QA ed evidence | PARTIAL | Registry artifact con blob bounded, quality run, evidence fail-closed, defect lifecycle e browser capture reale; resta una suite axe/performance completa |
| 12 - Recovery e fork | PARTIAL | Recovery graph, snapshot artifact contract e rollback planning; restore fisico provider da collegare |
| 13 - AI Gateway e costi | PARTIAL | Workers AI text/vision/image distribuito e firmato, routing, input estimate server-side, pausa job su hard cap, call/usage ledger e validazione BYOK OpenAI; restano adapter BYOK d'inferenza e riconciliazione image-neurons |
| 14 - GitHub | PARTIAL | Secret broker, validazione token GitHub, source connection, sync/conflict records, no-force/secret policy e PR evidence summary; GitHub App/OAuth non configurata |
| 15 - Deploy e domini | PARTIAL | Release artifact, quality/smoke/approval gate, rollback target, deployment/domain records; provider esterno non collegato |
| 16 - Integrazioni | PARTIAL | Secret broker AES-256-GCM project-scoped, connect/validate/revoke, redaction, idempotency e approval policy; adapter execute esterni non configurati |
| 17 - Mobile Expo | PARTIAL | Mobile profile, native compatibility/permission policy e build records; EAS/native builder non collegato |
| 18 - Billing | PARTIAL | Account/subscription/credit ledger, idempotenza, hard cap con pausa fail-closed e reconciliation policy; payment provider non collegato |
| 19 - Voce | PARTIAL | STT Whisper reale verificato, sessioni it/en, no audio retention, ambiguity/risk confirmation e fallback; TTS provider risponde 3043 e streaming/interruption restano degradati |
| 20 - Agent Studio | PARTIAL | Profili/versioni e run reali per Product Architect, Software Architect, Frontend, Backend, Data, QA, Security e Deploy; resta l'orchestrazione custom pubblicabile |
| 21 - MCP | PARTIAL | Connection registry, permission/rate-limit/output policy e revoca; OAuth server e transport non distribuiti |
| 22 - Team | PARTIAL | Project-scoped RBAC reale, invite, comment threads, inbox persistente e quorum multi-approval con vote audit; resta delivery push/email |
| 23 - Visual select | PARTIAL | Browser runner HMAC/SSRF-guarded con DOM path, styles, crop PNG persistito, a11y snapshot, viewport responsive e diff exact/perceptual; restano patch planning semantico e token extraction automatica |
| 24 - Hardening | PARTIAL | Operations API, provider health load, backup/certification project-scoped, SLO e runbook; C1-C15 x3, data-plane load e restore reali non eseguiti |

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
- Generazione full-stack: due brief black-box distinti producono codice e modelli differenti; scenario reale con server, login, SQLite, list e create PASS.
- Autopilot: rimosso il template dashboard fisso e rimossi i capability contract `verified_or_not_applicable`; le fasi non collegate non vengono più dichiarate completate.
- Patch runtime: write/read/delete firmati verificati sul sandbox distribuito; contenuto e precondition hash, rollback e audit sono fail-closed nel Control Plane.
- AI Gateway: health PASS; inferenza text firmata reale PASS (`FENIX_AI_OK`) e image generation FLUX reale PASS (JPEG base64 verificato), con catalogo, token usage e ledger tenant-aware.
- Conversation runtime: messaggi utente/assistente persistenti, risposta managed AI, trace, budget fail-closed e ledger collegati al composer del workspace.
- Workspace runtime: iframe sandboxato solo per preview live non scadute, file index, quality run e deployment reali; fallback esplicitamente marcati come mockup.
- Secret broker: cifratura AES-256-GCM con AAD tenant/progetto/record, riferimenti opachi, revoca coordinata e validatori live GitHub/OpenAI/Stripe senza persistenza in chiaro.
- Agent Studio: esecuzione deterministica di tool dichiarati e autorizzati (`project.summary`, `repository.search`, `quality.status`), risultati trattati come dati e trace persistito.
- Voice provider: STT Whisper firmato PASS su audio AIFF reale (`Phoenix is operational.`); TTS MeloTTS configurato ma non dichiarato operativo perché il provider restituisce errore 3043.
- Visual runner: Browser Rendering firmato PASS su viewport mobile, selector mapping, bounding box, crop PNG hash e accessibility role.
- Visual diff: confronto firmato exact e perceptual PASS su baseline PNG reale (`exactMatch=true`, mismatch ratio `0`, 6.552 pixel campionati).
- Artifact blob: crop PNG fino a 750 KB persistito in D1, referenziato dal registry e servito con scope job, CSP, nosniff ed ETag.
- Provider health load: 180/180 risposte riuscite sui tre Worker production, p95 187–313 ms; non sostituisce un benchmark inference/sandbox/browser.
- Schema replay: 55 tabelle applicate in SQLite isolato, migrazione legacy certification preservata e `foreign_key_check` con zero errori.
- Supply-chain audit production: zero vulnerabilità note dopo aggiornamento Next.js 16.3.3 e sostituzione del downloader Puppeteer vulnerabile.
- Secret pattern scan repository: nessuna credenziale rilevata.

## Prossimo incremento consigliato

Collegare blob storage, image generation/BYOK, OAuth GitHub/MCP, deploy, mobile, payment e voice, quindi eseguire C1-C15 per tre run con evidence reali. Gli adapter restano dichiarati non operativi finché queste verifiche non passano.

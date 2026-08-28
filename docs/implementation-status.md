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
| 7 - Sandbox provider | PARTIAL | Worker Cloudflare Sandbox isolato, richieste HMAC, scope deterministico e command policy; deploy provider richiede account/configurazione |
| 8 - Scaffold full-stack | PARTIAL | Template React/Worker/D1 versionato e DAG qualità; provisioning automatico da collegare |
| 9 - Preview Engine | PARTIAL | Device frame e contratto preview/tunnel persistente; runtime provider non distribuito |
| 10 - Repo index e patch | PARTIAL | Indice persistente, normalizzazione path, scope/freeze/precondition policy con test; applicatore patch sandbox da collegare |
| 11 - QA ed evidence | PARTIAL | Registry artifact, quality run, evidence fail-closed e defect lifecycle; runner browser/a11y esterno da collegare |
| 12 - Recovery e fork | PARTIAL | Recovery graph, snapshot artifact contract e rollback planning; restore fisico provider da collegare |
| 13 - AI Gateway e costi | PLANNED |  |
| 14 - GitHub | PLANNED |  |
| 15 - Deploy e domini | PARTIAL | Gate UI, nessun provider collegato |
| 16 - Integrazioni | PLANNED |  |
| 17 - Mobile Expo | PLANNED |  |
| 18 - Billing | PLANNED |  |
| 19 - Voce | PLANNED |  |
| 20 - Agent Studio | PLANNED |  |
| 21 - MCP | PLANNED |  |
| 22 - Team | PLANNED |  |
| 23 - Visual select | PLANNED |  |
| 24 - Hardening | PLANNED |  |

## Evidence della slice

- Route principale: HTTP 200.
- Build di produzione: PASS.
- Lint: PASS, zero problemi.
- Metadata social: asset 1200 x 630 verificato.
- Migrazioni D1: 24 tabelle, indici e foreign key generate e ispezionate.
- Orchestratore: transizioni condizionali, human gate, task claim e result contract verificati da typecheck/build.
- Build Plane kernel: 6 test su sandbox scope, repository index, patch policy, scaffold DAG, quality gate e recovery graph.
- Sandbox Worker: typecheck PASS; nessuna esecuzione dichiarata perché il provider non è ancora distribuito/configurato.

## Prossimo incremento consigliato

Collegare storage artifact e runner sandbox distribuito, quindi integrare AI Gateway e cost ledger senza trasformare metriche dimostrative in dati operativi.

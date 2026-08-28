# Stato corrente

Data audit: 28 agosto 2026

## Repository

Progetto greenfield separato. Non deriva né modifica repository preesistenti. Stack iniziale: Vinext/React 19, TypeScript, Tailwind CSS, Vite, Cloudflare Workers e Sites.

## Superfici implementate

| Area | Stato | Evidenza |
| --- | --- | --- |
| Home e composer | Funzionante | Inserimento prompt, template rapidi e creazione progetto |
| Progetti recenti | Persistenza condivisa | D1, identità ChatGPT, organizzazione e controllo membership server-side |
| Workspace | Funzionante | Conversazione, brief, preview e inspector |
| Device preview | Funzionante | Desktop, tablet e mobile |
| File, test, deploy | Dimostrativo | Tab interattive con dati dichiaratamente simulati |
| Backend e dati condivisi | Partial | D1 con 52 tabelle core e migrazioni versionate |
| Auth e RBAC | Partial | Identità ChatGPT e ruolo owner; ruoli aggiuntivi previsti nello schema |
| Queue e worker | Partial | Job/task D1, claim atomico, tentativi e completion; queue esterna non collegata |
| Sandbox | Operativo | Worker Cloudflare separato, HMAC, scope, allowlist, path policy; signed exec e destroy verificati |
| Preview runtime | Operativo | Processo persistente, port readiness, quick tunnel HTTP e cleanup verificati |
| Scaffold | Partial | Template web TypeScript con React, Worker, D1, health check e quality DAG |
| Repo, QA e recovery | Partial | Indice, patch policy, artifact/evidence/defect registry e recovery graph con test kernel |
| Platform Plane | Partial | AI routing, provider connections, source sync, release/domain, mobile, billing, voice, agents, MCP, collaboration e visual records |
| Hardening | Partial | Operations API, SLO, runbook e certification matrix fail-closed |
| AI Gateway | Non implementato | Nessun provider o segreto |
| GitHub, deploy e billing | Non implementato | Nessun account o side effect esterno |

## Comandi verificati

- Server di sviluppo Vinext avviato.
- Route principale richiesta con risposta HTTP 200.
- Build di produzione: PASS (5 ambienti compilati, exit code 0).
- Lint: PASS (zero errori e zero warning, exit code 0).
- Typecheck: PASS (exit code 0).
- Kernel di policy: 15 test PASS.
- Sandbox Worker: deploy, health, unauthorized rejection, signed exec isolata e destroy PASS.
- Replay migrazioni: 52 tabelle e zero errori foreign key.
- Audit dipendenze production: zero vulnerabilità note.

## Rischi immediati

- Collaboration UI e inviti non sono ancora implementati, benché lo schema sia tenant-aware.
- La home usa contatori reali D1; mockup preview e file tree sono marcati come dimostrativi.
- Prima di accettare codice o file utente in produzione servono deploy del sandbox, egress deny-by-default, blob storage e scansione upload.
- C1-C15 non sono certificati: nessun risultato viene marcato PASS senza artifact scoped.

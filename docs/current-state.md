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
| Backend e dati condivisi | Partial | D1 con 24 tabelle core e migrazioni versionate |
| Auth e RBAC | Partial | Identità ChatGPT e ruolo owner; ruoli aggiuntivi previsti nello schema |
| Queue e worker | Partial | Job/task D1, claim atomico, tentativi e completion; queue esterna non collegata |
| Sandbox | Adapter pronto, provider non distribuito | Worker separato, HMAC, scope, allowlist, path policy e tunnel contract; nessun codice utente ancora eseguito |
| Scaffold | Partial | Template web TypeScript con React, Worker, D1, health check e quality DAG |
| Repo, QA e recovery | Partial | Indice, patch policy, artifact/evidence/defect registry e recovery graph con test kernel |
| AI Gateway | Non implementato | Nessun provider o segreto |
| GitHub, deploy e billing | Non implementato | Nessun account o side effect esterno |

## Comandi verificati

- Server di sviluppo Vinext avviato.
- Route principale richiesta con risposta HTTP 200.
- Build di produzione: PASS (5 ambienti compilati, exit code 0).
- Lint: PASS (zero errori e zero warning, exit code 0).
- Typecheck: PASS (exit code 0).
- Build Plane kernel: 6 test PASS.
- Sandbox Worker: typecheck PASS; deploy non effettuato senza provider account/configurazione.

## Rischi immediati

- Collaboration UI e inviti non sono ancora implementati, benché lo schema sia tenant-aware.
- Gli indicatori di build, costo e test sono contenuto dimostrativo, non telemetry.
- Prima di accettare codice o file utente in produzione servono deploy del sandbox, egress deny-by-default, blob storage e scansione upload.

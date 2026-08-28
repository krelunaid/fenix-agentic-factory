# Stato corrente

Data audit: 28 agosto 2026

## Repository

Progetto greenfield separato. Non deriva né modifica repository preesistenti. Stack iniziale: Vinext/React 19, TypeScript, Tailwind CSS, Vite, Cloudflare Workers e Sites.

## Superfici implementate

| Area | Stato | Evidenza |
| --- | --- | --- |
| Home e composer | Funzionante | Inserimento prompt, template rapidi e creazione progetto |
| Progetti recenti | Funzionante in locale | Tre progetti demo e nuovi record in `localStorage` |
| Workspace | Funzionante | Conversazione, brief, preview e inspector |
| Device preview | Funzionante | Desktop, tablet e mobile |
| File, test, deploy | Dimostrativo | Tab interattive con dati dichiaratamente simulati |
| Backend e dati condivisi | Non implementato | Nessun database collegato |
| Auth e RBAC | Non implementato | Nessuna identità applicativa |
| Queue e worker | Non implementato | Nessun job durevole |
| Sandbox | Non implementato | Nessun codice utente eseguito |
| AI Gateway | Non implementato | Nessun provider o segreto |
| GitHub, deploy e billing | Non implementato | Nessun account o side effect esterno |

## Comandi verificati

- Server di sviluppo Vinext avviato.
- Route principale richiesta con risposta HTTP 200.
- Build di produzione: PASS (5 ambienti compilati, exit code 0).
- Lint: PASS (zero errori e zero warning, exit code 0).

## Rischi immediati

- I dati dei progetti sono locali al browser e non adatti alla collaborazione.
- Gli indicatori di build, costo e test sono contenuto dimostrativo, non telemetry.
- Prima di accettare codice o file utente servono sandbox, limiti risorsa, egress policy e scansione upload.

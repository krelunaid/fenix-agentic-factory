# FENIX

FENIX è una software factory agentica: trasforma una richiesta naturale in brief, piano, build, preview, verifiche e rilascio controllato.

## Stato corrente

Questa repository contiene una superficie prodotto eseguibile e il primo kernel del Build Plane:

- home con composer e progetti recenti;
- identità ChatGPT, organizzazioni e progetti persistenti su D1;
- workspace a tre pannelli;
- Product Brief, preview responsive, file, quality gate e deploy state;
- orchestrazione job/task, artifact/evidence registry, repo index, patch/recovery policy e sandbox adapter separato;
- etichette esplicite per distinguere funzioni demo, adapter pronti e servizi distribuiti.

Il sandbox Cloudflare isolato e il provider Workers AI text/vision sono distribuiti e collegati; GitHub, billing, mobile, voice, image generation/BYOK e deploy delle applicazioni generate richiedono ancora connessioni/configurazioni esterne. Lo stato verificato è in `docs/implementation-status.md`.

## Sviluppo

Richiede Node.js 22 e pnpm.

```bash
pnpm install
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm test
```

## Principi

- Nessun successo senza evidence verificabile.
- Produzione, costi e side effect richiedono approvazione.
- Control Plane e codice utente restano separati.
- Ogni capacità mostrata deve dichiarare se è reale, simulata o non collegata.

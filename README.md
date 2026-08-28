# FENIX

FENIX è una software factory agentica: trasforma una richiesta naturale in brief, piano, build, preview, verifiche e rilascio controllato.

## Stato corrente

Questa repository contiene la prima superficie prodotto eseguibile:

- home con composer e progetti recenti;
- creazione di un progetto demo con persistenza sul dispositivo;
- workspace a tre pannelli;
- Product Brief, preview responsive, file, quality gate e deploy state;
- etichette esplicite per distinguere funzioni demo da servizi reali.

Non sono ancora collegati autenticazione, database condiviso, queue, sandbox, provider AI, GitHub, billing o deploy di applicazioni generate. Lo stato completo è in `docs/implementation-status.md`.

## Sviluppo

Richiede Node.js 22 e pnpm.

```bash
pnpm install
pnpm dev
pnpm build
pnpm lint
```

## Principi

- Nessun successo senza evidence verificabile.
- Produzione, costi e side effect richiedono approvazione.
- Control Plane e codice utente restano separati.
- Ogni capacità mostrata deve dichiarare se è reale, simulata o non collegata.


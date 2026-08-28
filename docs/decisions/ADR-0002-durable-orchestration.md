# ADR-0002: orchestrazione durevole incrementale

## Decisione

Il Control Plane mantiene job, task, dipendenze, tentativi, approvazioni, eventi e ledger in D1. Ogni transizione usa una condizione sullo stato precedente; ogni claim di task è atomico e ogni side effect futuro deve ricevere una chiave di idempotenza.

La queue e il runtime agentico resteranno adapter separati. Un futuro servizio Workers Agents/Durable Objects potrà fornire connessioni realtime e scheduling, ma non viene dichiarato operativo dentro Sites finché binding, account e deployment non sono realmente disponibili.

## Conseguenze

- Restart e reconnect non cancellano il task graph.
- Gli eventi supportano replay SSE tramite sequence ID.
- Produzione, release, pagamenti, domini e dati distruttivi richiedono approval persistente.
- Il Control Plane non esegue direttamente codice utente.


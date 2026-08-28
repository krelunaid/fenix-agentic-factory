# Runbook: incident response

1. Dichiarare severity, incident commander, timestamp e scope tenant/provider.
2. Bloccare nuove azioni esterne rischiose senza interrompere letture e audit.
3. Preservare trace, build event, action ledger e provider response redatti.
4. Revocare o ruotare credenziali sospette tramite secret broker; non copiarle nei log.
5. Applicare rollback solo verso artifact immutabile con health/evidence nota.
6. Verificare isolamento tra tenant e contattare solo gli utenti coinvolti.
7. Chiudere dopo recovery check, reconciliation costi e postmortem con azioni assegnate.

# Runbook: credential rotation

1. Creare una nuova versione nel secret broker senza esporre il valore al modello o al database.
2. Validare la nuova credenziale con un'operazione read-only.
3. Cambiare l'alias atomico e osservare health/error rate.
4. Revocare la versione precedente e verificare che fallisca.
5. Cercare leak nei log redatti e registrare l'evento di audit.

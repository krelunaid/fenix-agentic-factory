# Runbook: backup and restore

1. Creare backup con checksum, scope tenant e retention esplicita.
2. Ripristinare prima in ambiente isolato e verificare schema/migrazioni.
3. Confrontare conteggi, foreign key, audit tail e artifact references.
4. Eseguire smoke read/write senza provider esterni e registrare `restore_tested_at`.
5. Un restore di produzione richiede approval, finestra di manutenzione e rollback del restore.

# Threat model iniziale

## Confini di fiducia

1. Browser utente e Control Plane.
2. Control Plane e worker.
3. Worker e sandbox di codice utente.
4. Piattaforma e provider esterni.
5. Organizzazioni e progetti differenti.

## Minacce principali

| Minaccia | Impatto | Mitigazione richiesta |
| --- | --- | --- |
| Accesso cross-tenant | Critico | Controlli server-side, RLS/test di isolamento, capability token |
| Esecuzione codice ostile | Critico | Sandbox non privilegiata, limiti, kill tree, egress deny-by-default |
| Esposizione segreti | Critico | Secret broker, alias al modello, redaction e rotazione |
| Prompt/tool injection | Alto | Output non fidato, schema validation, allowlist e approval |
| SSRF e upload ostili | Alto | URL policy, MIME/magic check, size cap e malware scan |
| Side effect duplicati | Alto | Idempotency key, ledger e retry policy |
| Deploy non autorizzato | Alto | Human gate, RBAC, artifact firmato e audit |
| Cost loop | Medio/alto | Budget, hard cap, circuit breaker e attribuzione task |

## Controlli aggiunti nel Build Plane

- Sandbox ID deterministico e vincolato a organizzazione/progetto/job.
- Richieste Control Plane → Sandbox firmate HMAC con finestra anti-replay di 60 secondi.
- Comandi strutturati con allowlist, argomenti quotati, timeout massimo e cwd confinata a `/workspace`.
- Sessione shell implicita disabilitata; trasporto RPC e lease breve.
- Artifact key tenant-scoped, hash SHA-256 obbligatorio ed evidence fail-closed.
- Patch con path normalization, file freeze, precondition hash e divieto delete di default.
- Rollback solo su antenati dello stesso project/job; esecuzione distruttiva separata dal planning.

Il worker sandbox è implementato ma non distribuito: nessuna esecuzione reale viene dichiarata finché URL e segreto provider non sono configurati e verificati.

## Controlli Platform Plane

- Le credenziali sono rappresentate solo da alias `secret://`; valori raw sono rifiutati dalle API di connection.
- Redaction ricorsiva per chiavi/valori sensibili prima di persistere config o response.
- AI routing vincolato a capability, budget e credential attiva; ogni call ha trace e cost estimate.
- Source control vieta force push, branch protetti diretti e file con pattern di segreto.
- Produzione richiede artifact hash, quality/evidence, smoke, approval e rollback target.
- Integration side effect usa idempotency key e approval per payment/email/write/delete/domain.
- Billing hard cap è fail-closed e il ledger rifiuta idempotency duplicate.
- Voce e agent tool non possono superare confirmation/approval, cost cap o step cap.
- MCP revocato perde accesso; permission e rate limit sono server-side e l'output non può riscrivere policy.
- Certification C1-C15 richiede tre run e artifact; assenza o blocker produce non certificato.

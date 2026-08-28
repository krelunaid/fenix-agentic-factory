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

## Stato della slice

La slice iniziale non esegue codice utente, non accetta file, non possiede credenziali e non invia richieste a provider. La persistenza locale contiene solo nomi e descrizioni demo inseriti dall'utente.


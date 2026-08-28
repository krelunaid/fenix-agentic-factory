# Service level objectives

Questi sono target beta, non risultati misurati.

| Indicatore | Target | Misura |
| --- | --- | --- |
| Disponibilità Control Plane | 99,5% mensile | Synthetic check autenticato e health route |
| Event replay | 99% entro 30 secondi | Lag tra build event e client SSE |
| RPO dati core | 24 ore | Età ultimo backup completato e verificabile |
| RTO dati core | 4 ore | Restore drill su ambiente isolato |
| Sandbox cleanup | 99% entro 15 minuti | Lease scadute senza container attivo |
| Cost attribution | 99,9% delle call | AI/integration call con organization/project/task |

Il passaggio a beta richiede telemetria sufficiente a misurare questi valori; la sola presenza dello schema non costituisce evidence.

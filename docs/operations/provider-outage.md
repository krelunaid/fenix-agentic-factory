# Runbook: provider outage

1. Confermare il guasto con health check indipendente e marcare il provider `degraded` o `down`.
2. Fermare retry automatici al circuit-breaker; preservare idempotency key e stato pending.
3. Usare fallback solo se capability, costo, privacy e policy restano equivalenti; dichiarare il fallback negli eventi.
4. Per deploy/payment/email non cambiare provider automaticamente quando produrrebbe un side effect duplicato.
5. Riprendere dalla stessa operazione solo dopo health stabile e reconciliation.

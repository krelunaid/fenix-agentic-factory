# ADR-0001: fondazione della piattaforma

## Decisione

Usare TypeScript e React per il Control Plane, con output Cloudflare Worker-compatible. Mantenere separati Control Plane, Build Plane e provider attraverso contratti espliciti. La prima slice è priva di backend per evitare di presentare integrazioni simulate come reali.

## Conseguenze

- La UI può essere validata prima di introdurre credenziali o side effect.
- La persistenza locale è temporanea e dovrà essere migrata a un modello multi-tenant.
- Sandbox, queue e deploy verranno aggiunti dietro adapter e human gate.


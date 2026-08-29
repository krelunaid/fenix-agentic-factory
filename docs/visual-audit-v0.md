# FENIX Visual Audit — V0

Data audit: 2026-08-29  
Riferimento: `FENIX_Visual_UX_Constitution_for_Codex.pdf`  
Ambiente osservato: produzione privata FENIX, desktop e responsive.

## Inventario attuale

- **Home / Control Plane**: rail globale, stato Core, composer nuovo progetto, statistiche operative, progetti recenti.
- **Workspace / Build**: top bar progetto, chat e brief a sinistra, preview centrale, inspector File/Test/Deploy a destra, log inferiore.
- **Preview**: iframe sandbox quando esiste una preview live; mock dichiarato esplicitamente quando il runtime non è disponibile.
- **Backend visuale già reale**: selezione per selector, source mapping quando disponibile, screenshot/crop, design token versionati, diff visuale e policy patch.
- **Architettura UI**: una sola Client Component (`app/page.tsx`) contiene home, workspace e mock; tutti gli stili sono concentrati in `app/globals.css`; nessuna libreria di componenti o icone.

## Evidenze baseline

Screenshot acquisiti prima delle modifiche:

- `docs/evidence/visual-baseline-v0/home-{1600x1000,1440x900,1024x768,834x1112,430x932,375x812}.png`
- `docs/evidence/visual-baseline-v0/workspace-{1600x1000,1440x900,1024x768,834x1112,430x932,375x812}.png`

## Matrice Constitution

| Area | Stato | Evidenza / debito |
|---|---|---|
| Dati operativi reali | PRESENTE | Progetti, job, task, eventi, usage, repository, test, deploy e preview arrivano dalle API. |
| Preview sandbox e fallback onesto | PRESENTE | Iframe sandbox isolata; il mock è etichettato come tale. |
| Shell a tre pannelli | PARZIALE | Presente a desktop; pannelli non ridimensionabili né collassabili. |
| Centro preview dominante | PARZIALE | Dominante a desktop, ma il layout non offre modalità Focus/Compare/Mobile Studio. |
| Dock inferiore contestuale | ROTTO | Log sempre integrato nel pannello preview, senza Tasks/Test/Console/Versioni/Costi. |
| Modalità operative | ASSENTE | Build, Focus Preview, Visual Edit, Debug, Compare e Mobile Studio non esposte. |
| Sei classi viewport | ROTTO | Solo desktop/tablet/mobile; nessuna distinzione small/large e portrait/landscape. |
| Visual inspector | PARZIALE | File/Test/Deploy disponibili; mancano selezione visuale, box model, stile, source e scope. |
| Freeze e scope visibile | ASSENTE UI | Policy backend parziale; nessun controllo persistente o indicatore nel workspace. |
| Screenshot QA e diff | ASSENTE UI | Primitive backend presenti; nessun flusso accessibile all’utente. |
| Rollback/undo visuale | ASSENTE UI | Nessun comando o recovery point esposto vicino alla modifica. |
| Design directions | ASSENTE | La creazione salta la scelta Essential/Expressive/Premium. |
| Design system semantico | ROTTO | Token viola locali e magic values; nessuna scala condivisa o component library. |
| Iconografia coerente | ROTTO | Simboli Unicode misti e diversi, spesso senza etichetta visibile. |
| Accessibilità tastiera/focus | ROTTO | Focus non sistematico; controlli icon-only; font frequenti sotto 12 px. |
| Responsive mobile | ROTTO | Sotto 700 px chat e inspector spariscono; il lavoro non resta raggiungibile. |
| Stati empty/loading/error/offline | PARZIALE | Alcuni stati testuali, ma nessun contratto uniforme o skeleton. |
| Reduced motion | ASSENTE | Nessuna policy `prefers-reduced-motion`. |
| Source mapping dev-only | PARZIALE | Backend presente; interfaccia non lo rende utilizzabile. |
| Visual regression boundary | ASSENTE UI | Nessun baseline management nell’interfaccia. |

## Debito visivo e tecnico

1. Palette attuale centrata su viola/gradienti, esplicitamente vietata dalla Constitution.
2. CSS monolitico e compresso, con numerosi valori isolati e senza token semantici.
3. Tipografia troppo piccola in label, toolbar, stato e metriche; leggibilità e touch target insufficienti.
4. Home e workspace condividono pattern duplicati (button, tabs, status, panel heading, card) senza component contract.
5. Responsive governato quasi solo da breakpoint 960/700; nessun comportamento dedicato per le sei classi richieste.
6. L’interfaccia mostra capacità operative importanti solo come dati: visual select, diff, policy e rollback non sono azionabili.
7. Il workspace mobile privilegia la sola preview e nasconde il contesto di lavoro, contraddicendo la continuità tra modalità.

## Piano di migrazione incrementale

| Fase | Modifica minima | Rischio | Verifica / rollback |
|---|---|---|---|
| V1 | Token FENIX, primitive UI, icone coerenti, shell leggibile | Regressioni CSS globali | Build + screenshot desktop; revert singolo commit |
| V2 | Focus, target, semantic HTML, reduced motion, stati | Focus o overflow inattesi | Tastiera, contrasto, metriche DOM |
| V3 | Toolbar preview, ambiente, stale/error, new-window/screenshot | Stato preview non sincronizzato | API reali + fallback esplicito |
| V4 | Sei viewport e layout adattivo con drawer mobile | Overflow / pannelli irraggiungibili | Screenshot 1600/1440/1024/834/430/375 |
| V5 | Scelta Essential/Expressive/Premium prima della creazione | Nuovi metadati | Persistenza nelle assumptions della specification |
| V6 | Modalità Visual Edit e inspector selector/source/style | Bridge iframe non disponibile | Dichiarare selector assistito come capacità reale |
| V7 | Freeze persistente e scope change set | Patch troppo ampia | Enforcement server-side e audit event |
| V8 | Baseline screenshot, diff e classificazione | Artefatti mancanti | Evidence API e gestione errore |
| V9 | Undo/rollback e recovery point visibili | Azione distruttiva | Conferma, approval e audit |
| V10 | Performance, polish, test visuali e challenge | Scope eccessivo | Quality gate e scorecard finale |

## Gate V0

L’audit è completo e le baseline sono state archiviate. La riscrittura può iniziare da V1 mantenendo intatti backend, autenticazione, dati e hosting.

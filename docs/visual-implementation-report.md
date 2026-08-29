# FENIX Visual Constitution — implementation report

## Design Direction Record

- **Directions available at project creation:** Essential, Expressive, Premium.
- **Default:** Essential.
- **Persistence:** the chosen direction is stored in the project tone, in the specification assumptions, and in the audit event.
- **FENIX shell direction:** Essential with premium spacing and Ember emphasis: functional, calm, technical, non-generic.
- **Rejected patterns:** purple/blue AI gradients, glassmorphism, excessive pills, mixed Unicode icons, nested dashboard cards and decorative animation.

## Implemented phases

- **V0:** audit, route/screen inventory, debt matrix, six-size before screenshots and migration plan.
- **V1:** stable rail/top bar, dominant preview, collapsible side panels, lower tab dock and six workspace modes.
- **V2:** semantic FENIX tokens, shared interaction primitives, Lucide icon family, visible focus, reduced motion and uniform state language.
- **V3:** explicit Preview/Mock environment, sandbox honesty, runtime new-window action and connection state.
- **V4:** six viewport controls and responsive workspace drawers that keep Chat, Preview and Inspector reachable on mobile.
- **V5:** three visual directions before project creation and audited server persistence.
- **V6:** Visual Edit mode, selector-based inspection, real Visual Worker integration, source/patchability result and evidence artifact ID.
- **V7:** session freeze persisted in visual-selection constraints and enforced by the patch API in addition to immutable protected paths.
- **V8:** runtime inspect captures screenshot evidence; a supplied baseline is diffed by the existing Visual Worker.
- **V9:** recovery API remains fail-closed: rollback is planned only across valid ancestors and always requires approval.
- **V10:** lint, typecheck, test, production build and six-size screenshot QA.

## Acceptance summary

| Check | Result |
|---|---|
| FENIX palette and semantic token source | PASS |
| No prohibited purple/blue gradient | PASS |
| Consistent icon family | PASS |
| Visible keyboard focus | PASS |
| Reduced-motion support | PASS |
| Six viewport classes | PASS |
| No horizontal overflow at 1600/1440/1024/834/430/375 | PASS |
| Mobile access to chat, preview and inspector | PASS |
| Environment honesty (Preview vs Mock) | PASS |
| Visual selection stored by API | PASS |
| Freeze enforced server-side | PASS |
| Destructive rollback requires approval | PASS |
| TypeScript | PASS |
| ESLint | PASS |
| Automated policy tests | PASS — 16/16 |
| Production build | PASS |

## Capability boundaries

- Direct hover-to-source inside arbitrary cross-origin preview applications still requires the generated application to install the FENIX preview bridge. Until then, Visual Edit uses a real CSS selector workflow and labels it “assisted”.
- A visual diff is produced only when both a live preview and a valid baseline artifact exist. The UI never fabricates a diff.
- Rollback is never executed from an empty state; recovery points and approval must already exist.

## Evidence

- Before: `docs/evidence/visual-baseline-v0/`
- After: `docs/evidence/visual-final/`
- Audit: `docs/visual-audit-v0.md`

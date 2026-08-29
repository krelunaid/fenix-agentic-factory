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
- **V6:** Visual Edit mode with a preview bridge installed in generated apps, hover outline, direct DOM selection, stable selector and optional source metadata.
- **V7:** real source reads, editable source panel, hash-guarded patching, session freeze persisted in visual constraints and protected paths enforced by the patch API.
- **V8:** screenshot evidence and baseline diff through the Visual Worker, plus a two-up Compare workspace that renders only stored artifacts.
- **V9:** every successful patch stores a durable pre-change snapshot and recovery point; Undo performs a server-side rollback and requires approval when it would delete data.
- **V10:** operational Build, Focus, Visual, Debug, Compare and Mobile Studio modes; token versioning, freeze management, release gate, recovery history and product guide.
- **V11:** lint, typecheck, production build, 25 constitution checks, a ten-product black-box challenge and responsive browser QA.

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
| Preview bridge and direct DOM selection | PASS |
| Source read and hash-guarded patch | PASS |
| Freeze enforced server-side | PASS |
| Durable patch snapshot and executable Undo | PASS |
| Destructive rollback requires approval | PASS |
| TypeScript | PASS |
| ESLint | PASS |
| Automated tests | PASS — 42/42 |
| Ten-product black-box challenge | PASS — 10 distinct structures |
| Production build | PASS |

## Capability boundaries

- Direct hover-to-source works for newly generated applications because their template installs the FENIX preview bridge. Imported or pre-existing applications must install the same bridge before direct DOM selection is available.
- A visual diff is produced only when both a live preview and a valid baseline artifact exist. The UI never fabricates a diff.
- Undo is available after a successful FENIX patch has created a recovery point. A rollback that removes a newly created file remains approval-gated.

## Evidence

- Before: `docs/evidence/visual-baseline-v0/`
- After: `docs/evidence/visual-final/`
- Audit: `docs/visual-audit-v0.md`

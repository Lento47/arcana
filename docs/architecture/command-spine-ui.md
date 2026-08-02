# Command Spine UI (living surface)

**Status:** Current default TUI shell as of 2026-07.  
**Authority:** The TUI **observes** session/kernel/tool state. It does not invent RunProof, verifier, or permission truth.

For historical design intent and migration boundaries see:

- [TUI-DESIRED.md](../../TUI-DESIRED.md) (visual target; includes a "Current product surface" callout)
- [TUI-MIGRATION-CONTRACT.md](../../TUI-MIGRATION-CONTRACT.md) (keep/replace)
- [ADR 0002](../adr/0002-tool-batch-scheduler.md) (tool batch ↔ activity hint)
- [arcana-tui-cockpit-64-steps.md](./arcana-tui-cockpit-64-steps.md) (aspirational multi-panel cockpit; not default chrome)

---

## Layout zones

```txt
┌─────────────────────────────────────────────┐
│ header          wordmark · project · model  │
├─────────────────────────────────────────────┤
│ scroll timeline   spine entries + rail      │
│                   (ask / plan / tools / …)  │
├─────────────────────────────────────────────┤
│ gates           permission / question       │
├─────────────────────────────────────────────┤
│ composer        ✶ + rounded box (❯ / !)     │
│ metrics         elapsed · tokens · cost     │
└─────────────────────────────────────────────┘
```

| Zone | Implementation | Notes |
|------|----------------|-------|
| Header | `spine-header.tsx` | Brand lives here (wordmark), not on the prompt lead |
| Timeline | `spine-entry.tsx`, `spine-rail.tsx`, … | Mapped session messages / tool receipts |
| Gates | shared permission/question dialogs | Not a second authority |
| Composer | `spine-prompt.tsx` + `component/prompt` | `variant="command-spine"` |
| Metrics | `component/prompt/metrics-bar.tsx` | Single status line below the prompt; the v0.3.18 footer was retired |

Shell entry: `packages/tui/src/shell/command-spine/command-spine-shell.tsx`.

---

## Composer chrome (current product)

```txt
✶   ┌──────────────────────────────┐
    │ ❯  <input>            model  │
    └──────────────────────────────┘
    status…          key:label  …
```

Rules:

- **Lead glyph:** `✶` on the spine rail (state-colored pulse when working/thinking).
- **Box lead:** `❯` (normal) / `!` (shell mode) — Grok-like composer, not `arcana ›`.
- **Brand:** header wordmark only; do not put "arcana" on the prompt lead.
- **Spacing:** no extra padTop on the prompt row; ≤1 blank between timeline and box; **0** blank between box and status row.
- **Slash / @ panel:** inline above the composer (screen-absolute / relative host), not crushed by parent-local Y.
- **Placeholders:** rotating pool from branding (`PLACEHOLDER`); variety over a single fixed string.

---

## Layout breakpoints

`getSpineLayout(width, current?)` in `spine-types.ts`:

| Layout | Width (nominal) | Behavior sketch |
|--------|-----------------|-----------------|
| `wide` | ≥ 120 | More footer hints, optional "proof tape" word when active |
| `compact` | ≥ 100 | Reduced columns / hints |
| `narrow` | ≥ 80 | Fewer hints; tighter diffs |
| `minimal` | &lt; 80 | Minimal chrome |

Hysteresis (±5 cols) avoids thrash at boundaries when resizing.

### Theming (command-spine colors)

Spine tokens (`spineBrand`, `spineAsk`, `spinePlan`, `spineInspect`, `spinePatch`, `spineRun`, …) live on each built-in theme JSON under `packages/tui/src/theme/assets/`.

Built-in surface palettes (dark bases):

| Theme | Inspiration | Base feel |
|-------|-------------|-----------|
| **arcana** | Catppuccin Mocha + gold | soft violet cake |
| **bloodmoon** | GitHub Dark Dimmed | cool slate + crimson |
| **coven** | Rosé Pine | mauve ritual |
| **crypt** | GitHub Dark Default | true git UI neutrals + blue/green |
| **dragon** | Gruvbox | warm earth / fire |
| **lich** | Tokyo Night | ice navy |
| **wraith** | VS Code Dark+ | neutral charcoal |

- **Do not** leave spine tokens unset if you want a distinct look.
- Fallbacks in `resolveTheme` spread kinds across primary / accent / warning / info when tokens are omitted.
- Prefer **soft stepped surfaces** (bg → panel → element) over pure black with a harsh purple cast.

### Left lead (index + rail)

```txt
[pad 0–1][index 2][rail 2]  content…
```

- **Gutter is step index only** (`01`…`99`) — no wall-clock, no duration column.
- **Duration** (`+1.2s`) rides the **node header** as muted ` · +1.2s` when present.
- Prompt/gates use the same empty index spacer so the rail stays aligned (`spineContentOffset`).

### Codex / read output

Inspect label **`codex`** (tool `read` and kin):

- **File reads:** engine `N: line` prefixes stripped; header `path · L1–40`; syntax highlight.
- **Directory reads:** `<entries>` XML stripped → plain **listing** (names only); header `path · N entries`; toggle says “listing” not “file”.
- **Glob / path lists:** same listing treatment when multi-line path-ish output.
- Boilerplate “untrusted user data” system-reminders are **not** shown as yellow callouts.
- EOF / truncation footers render as muted **`bodyNote`**.
- Bodies longer than ~20 lines are **collapsed by default**.
- Markdown prose escapes `_underscore_` emphasis so snake_case / `_private` do not render as italics (`*asterisks*` still work).

---

## Activity hint contract

Process-local, not kernel authority:

| Piece | Location |
|-------|----------|
| Store | `@arcana/core/tool/activity-hint` (`globalThis` slot) |
| Writers | Engine admission (`tools · N cap`), agent batch wave plan strings |
| Reader | Command-spine shell polls `getToolActivityHint()` ~every **220ms** |
| UI merge | Merged into footer `pending` / proof-tape line when present |

Hints are **cheap projection**. They must not replace RunProof events or tool receipts on the timeline.

---

## Durable governance evidence contract

The Command Spine has a separate evidence path for authority and proof state:

```text
canonical ArcanaEvent
-> EventStore
-> GovernanceEventBridge (`governance.recorded`)
-> REST snapshot / SSE
-> generated SDK
-> TUI sync store
-> ProductionSpineInput
-> Command Spine entry
```

Only durable `ArcanaEvent` families are governance truth. The current projection accepts
`contract.*`, `claim.*`, `evidence.*`, `obligation.*`, `completion.*`,
`authorization.*`, `capability.*`, and `intent.*`. Tool logs, activity hints, and
presentation-local state must not be promoted into this projection.

`GET /session/:sessionID/governance` returns the bounded event snapshot, trace health,
and a compact RunProof projection. The proof row exposes the proof level, integrity,
authorization trace health, authorization counts, independent assurance axes, evidence
gaps, proof hash, and run root. Hashes and roots remain available in the expandable body
rather than being shortened into display-only identifiers.

Intent enforcement is part of the same projection. RunProof authorization profiles carry
`intentEnforcementMode` (`REQUIRED` / `LEGACY_COMPAT` / `UNAVAILABLE`),
`intentBindingsCreated`, and `intentTraceHealth`; the spine renders intent assurance as
healthy only when enforcement is `REQUIRED` and the trace is `COMPLETE`. Compatibility
mode (no active contract) and unavailable intent stores are deliberately visible as
degraded rather than silently accepted. The spine summary/body shows the enforcement
mode, trace health, and binding count, and `authorization.requested` exposes bounded
governance metadata (provenance, sensitivity, contract ID/revision, criterion IDs,
workspace ID, request hash) without raw arguments. When a contract is resolved, the
runtime revokes its intent bindings and projects `intent.binding_revoked`, so the spine
shows the revocation lifecycle instead of stale ACTIVE evidence.

Primary sessions now get production contract admission: on the first step of a user turn
with no active contract, the runtime proposes a completion contract from the user's
request and presents it through the permission gate (`contract.accept` with the
objective, revision, and contract ID in metadata). Acceptance activates the contract and
enters REQUIRED intent enforcement; a decline is recorded once so the session stays in
visible `LEGACY_COMPAT` without re-prompting. Allow-all session permissions auto-accept;
subagent, compaction, structured-output, and empty-text turns never ask. The spine
therefore shows `contract.proposed` / `contract.activated` before the first
`intent.enforcement_required` entry.

Completion is evidence-gated: contract activation seeds proof obligations from the
acceptance criteria, and the production verifier resolves `execution` / `observation`
obligations from durable events before the natural-finish completion gate emits
`completion.resolved` (`VERIFIED_COMPLETE`). The spine therefore projects
`obligation.created`, `obligation.resolved`, and `completion.resolved` entries, and the
proof row reports `contractStatus: resolved` with `VERIFIED` assurance when the chain is
complete. Unresolved required obligations block verified completion and remain visible
in the proof gaps.

Contracts are compiled from the user's request: mentions of tests, defects, or builds
produce specific criteria with meaningful descriptions (e.g. "Relevant tests and checks
pass"), and those descriptions flow into `obligation.created` entries and the admission
permission card — so the spine shows what the objective actually required, not a generic
"Task completed as described".

Verified completion also revokes the session's capability grants and projects
`capability.revoked` (`CONTRACT_RESOLVED`), so the spine shows the authority lifecycle
ending with the objective rather than leaving stale ACTIVE grants.

Use-limited capabilities are enforced at the PEP: every allow claims one use before
execution, the last successful claim projects `capability.exhausted`, and an exhausted or
unavailable claim fails closed as a denial — the spine shows the denial with
`DENY_CAPABILITY_EXHAUSTED` / `DENY_CAPABILITY_CLAIM_UNAVAILABLE` and zero executor calls.

Operators can revoke a session capability through
`POST /session/:sessionID/capability/:capabilityID/revoke` (exposed as
`sdk.session.revokeCapability`); the revoke cascades to descendant grants and projects
`capability.revoked` with `OPERATOR_REVOKE` / `PARENT_REVOKED` reasons, so the spine
shows the full authority lifecycle. Unknown, foreign, or already-revoked grants return
404 rather than leaking existence.

Fail-visible rules:

- `COMPLETE` is never inferred from zero counts alone.
- Missing projection data is `UNAVAILABLE`, rendered as a failed/expanded proof row.
- Degraded trace health, invalid integrity, unauthorized execution, or orphan execution
  is rendered as failed evidence.
- A denial always has a stable reason string and an inspectable full payload.
- The TUI observes the server's proof projection; it does not derive or repair proof truth.

The initial REST hydration and live `governance.recorded` stream use the same session-scoped
event shape. TUI source changes require an engine/TUI restart before the running operator
surface can show them.

Implementation status and unresolved completion gates are recorded in
[TUI-1.1 Governance Visibility Audit](../audits/TUI-1.1-GOVERNANCE-VISIBILITY-2026-08-01.md).

---

## What is *not* in the default UI

- Token HUD / dashboard footer
- Multi-panel "kernel cockpit" sidebars as permanent chrome (see 64-step plan)
- Brand soup on the prompt lead (`arcana ›`, intent chips as separate chrome)
- TUI-invented completion or permission state

---

## Performance notes (TUI)

See [performance foundation](./arcana-performance-optimization-foundation.md):

- Prefer stable entry lists; avoid N² remaps in render helpers.
- Activity poll is intentional vs. a high-frequency event subscription.
- Diff excerpts collapse by layout; do not expand full diffs by default.

---

## Skills and slash commands

- **Slash commands** are the local command catalog (prompt autocomplete + execute path).
- **Skills** are catalog + LLM `skill` tool — not a hard server match from the prompt box alone.
- Do not reintroduce a second hardcoded label map that drifts from runtime command definitions (see slash-command audit).

### Goals and agents (awareness MVP)

- **`/goal <description>`** — bind a session goal (stored under `~/.arcana/goals/`).
- **`/loop`** — show active goal status.
- Engine tools **`goal_set`** / **`goal_check`** (registered in `ToolRegistry`) — model can bind and check goals during the session.
- Every engine turn injects an `<active-goal>` system block (`@arcana/core/session/goal`).
- **build** / **general** / **tester** mutations are gated until a goal is set; after `goal_check(complete)` mutations freeze until a new goal.
- On each user prompt, a toast may **suggest** a session agent (full roster) and a **delegation** tip (`task → explore|general|qa|…`). Tab still switches session agents manually.

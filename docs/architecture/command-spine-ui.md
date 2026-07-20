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
│ status + hints  status left · key:label     │
└─────────────────────────────────────────────┘
```

| Zone | Implementation | Notes |
|------|----------------|-------|
| Header | `spine-header.tsx` | Brand lives here (wordmark), not on the prompt lead |
| Timeline | `spine-entry.tsx`, `spine-rail.tsx`, … | Mapped session messages / tool receipts |
| Gates | shared permission/question dialogs | Not a second authority |
| Composer | `spine-prompt.tsx` + `component/prompt` | `variant="command-spine"` |
| Status + hints | `spine-footer-hints.tsx` | Under box; content-offset aligned |

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
| `wide` | ≥ 120 | Full gutter, more footer hints, optional "proof tape" word when active |
| `compact` | ≥ 100 | Reduced columns / hints |
| `narrow` | ≥ 80 | Fewer hints; tighter diffs |
| `minimal` | &lt; 80 | Minimal chrome |

Hysteresis (±5 cols) avoids thrash at boundaries when resizing.

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

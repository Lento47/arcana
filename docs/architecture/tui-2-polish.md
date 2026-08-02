# TUI-2.1 Production Polish — Freeze Scope

**Status: DRAFT — candidate menu plus full freeze matrix. TUI-2 is frozen;
TUI-2.1 is mounted in production and automated-green, but its freeze is NOT
authorized. No item is implemented or tagged without approver confirmation, and
no pre-polish candidate (`3833cde0`, `e7cc8da6`, `1ed93b12`) may become the
TUI-2.1 tag.**

## 0. Baseline

- TUI-2 frozen: `arcana-tui-2-interactive-authority-control` → `e0b14a2d`;
  approval lifecycle, operator service, SQLite store, and governed executor
  live in `packages/core/src/crypto/`.
- TUI-2.1 mounted in the production command-spine shell: adapter, controller,
  integration hook, engine command endpoint + SSE push (candidate
  `3833cde0`), PENDING-create push (`d05ecfff`), reasoning wrap (`ca73e50e`),
  streamed-message render (`c07faba6`).
- Current baseline (2026-08-02): TUI 777/1 skip; engine 4248/0 (clean full
  run); core 1256/7/0; 16/16 typecheck; 8/8 builds; smoke 8/8.

## 0.5 Implemented in the 2026-08-01 spine pass

- **Real monotonic gutter indices** — the gutter grows from 2 to 3+ columns as
  the session grows; no repeated "99" cap, no fake sequence.
- **Governance aggregation** — consecutive governance events collapse into one
  `governed` row (`6 governed actions · 6 authorized · 6 executed · 0 denied`
  + duration); each event and its full committed payload opens in the expanded
  inspector (children).
- **Thinking progressive disclosure** — collapsed rows read
  `Thinking/Thought · +2.1s`; the reasoning title/body appears only when
  expanded.
- **RunProof summary row** — collapsed by default with
  `P1 · complete|degraded|unavailable · N authorized · N executed · N denied`;
  the expanded body separates Overall assurance, Recorded trace, Authorization
  trace, Intent, Integrity, Completion, and Verification (no more
  "Trace health: COMPLETE" contradicting intent/completion/verification).
- **Semantic tool labels** — search-family rows show the query, and inspect
  bursts aggregate targets (`3× inspect · src/a, src/b`).
- **Evidence inspector** — governance groups and the proof body keep complete
  raw evidence on expansion; the default spine stays conversation-first.
- **View filters (P2)** — `f` cycles all → conversation → tools → governance →
  proof; security-critical rows (denials, pending approvals, degraded proof)
  always break through so a filter can hide noise but never evidence.

## 0.6 Implemented in the 2026-08-02 operator-feedback pass

- **Governance and proof rows are always compact** — healthy (`ok`) rows no
  longer render as chat cards; proof, trace, and aggregated `governed` rows
  use the operator row even when green (this removed most of the vertical
  bloat the operator reported while scrolling).
- **Whole-row click to expand** — left-click anywhere on a collapsed
  toggleable block expands it; the header collapses it again; right-click also
  toggles. The focus highlight stays on the row.
- **Auto-collapse on new turns** — expanded governance groups collapse when a
  new user message arrives, so one manually-expanded 25+ event group no longer
  occupies huge scroll history.
- **Scroll keys** — `H` jumps to the top of the session, `G` to the bottom.
- **Approval label fix** — `authorization.approval_required` events read
  `N pending approval` in the aggregate summary, never `N failed`.

## 1. Candidate polish items (T1–T8 approved candidates; T9 optional)

| Item | Rationale | Acceptance test |
|------|-----------|-----------------|
| T1. Obligation filter in the governance panel | Operators need a fast "what is still blocking completion" view; rows exist but are mixed with other events | Filter shows exactly pending REQUIRED obligations with their verification method |
| T2. Verification decision summary line | `verification.recorded` renders as a row; a per-contract aggregate ("3/3 obligations resolved, 1 operator decision") gives at-a-glance state | Summary updates after each event and matches RunProof obligationsByStatus |
| T3. Command completion for `/capability` | Registry entry exists; ensure TUI completion surfaces it with argument hints | Typing `/cap` suggests `capability revoke <capabilityID> [reason]` |
| T4. Keymap help entry for governance actions | Operators should discover revoke/verify surfaces without reading docs | `which-key` lists `capability revoke` under a governance group |
| T5. Footer permission text for always-allow scopes | Permission dialog copy is correct but could show the exact saved scope summary | Dialog shows pattern list and "until Arcana is restarted" exactly once |
| T6. Status bar degraded-evidence indicator | Trace health is in the spine; surface a compact badge when governance trace is DEGRADED/UNAVAILABLE | Badge appears only when trace health is not COMPLETE |
| T7. Contrast fallback audit | Theme contrast fixes exist; re-audit all panels after new rows | Contrast checks (cockpit.accessibility) pass at 256-color and 16-color fallbacks |
| T8. Long governance payload wrapping | Payloads are preserved but wrap coarsely; use display-width-aware wrapping | 3000-char payload renders without horizontal overflow or data loss |
| T9. Attention/notification debounce (OPTIONAL) | Sound/notification paths exist; add coalescing for burst events | 10 events in 1s produce ≤2 notifications |

## 2. Full TUI-2.1 production-polish gates (not only the menu above)

- Right-edge clipping — RW-01 fixed (`ca73e50e`); re-verify across widths
- Responsive width matrix — 59/60/79/80/99/100/119/120/180
- Tool lifecycle density — requested → running → completed/failed/denied/
  approval-required → approved → claimed → consumed → retried → interrupted
- Thinking grouping — Thinking→Thought flip, streaming-aware, no ditto
  collapse of completed reasoning blocks
- Prompt focus conflicts — Esc priority, destroyed EditBuffer guards
- Approval presentation — glyphs + text labels, never color alone
- Mouse/keyboard parity
- Restart recovery — durable approval re-hydration
- Session isolation — approvals and state scoped per session
- Dark/light theme validation
- Long-session performance — typing lag, idle CPU, scroll stalls, viewport
  culling, memory growth

## 3. Manual freeze evidence required

11-phase WS1 smoke test (`docs/tui/TUI-2.1-MANUAL-SMOKE-TEST.md`), width
matrix, theme matrix, approval lifecycle observation, restart recovery,
session isolation, performance measurements, zero release/polish blockers.
Also the stream live-validation protocol (6 checkpoints from
`docs/audits/stream-truncation-audit.md`; ~92% confidence until 6/6 live PASS).
Freeze sign-off artifact:
`docs/audits/TUI-2.1-FREEZE-SIGNOFF-2026-08-01.md`.

## 4. Tagging rule

The final TUI-2.1 tag must point to the exact commit tested after all polish,
manual matrices, performance checks, documentation corrections, and final
full-suite verification. Older candidates are historical and must not be
tagged.

---
document_class: operator_runbook
authority: reference
status: current
status_source: docs/STATUS.md
last_verified: 2026-08-02
---

# TUI-2.1 Freeze — Operator Runbook

This runbook is the single operator checklist for the remaining TUI-2.1
freeze gates. Every item below must pass and be recorded in
`docs/audits/TUI-2.1-FREEZE-SIGNOFF-2026-08-01.md` before the freeze is
authorized. **Do not create a TUI-2.1 tag until every gate passes.**

## 0. Preconditions

Launch the TUI.

**Validated launch paths (Windows, Bun 1.3.14, OpenTUI 0.4.5 patched):**

```bash
bun run dev:tui
```

or the compiled engine binary:

```powershell
L:\PROJECTS\arcana\packages\engine\dist\@arcana\engine-windows-x64\bin\arcana.exe
```

> Historical note: before the OpenTUI patch (`script/patch-opentui.ts`,
> postinstall), dev mode crashed natively on Bun 1.3.14 Windows and the
> compiled binary exited 1 in console mode. Fixed — see
> `docs/tui/TUI-2.1-FIX-LOG.md` F-15. Rebuild the binary at the exact final
> commit for exact-commit validation.

Verify the daemon health endpoint:

```bash
curl -s http://127.0.0.1:9142/health
# expect HTTP 200 + {"status":"ok",...}
```

If health fails, stop — engine bootstrap is broken and interactive smoke
must not start.

## Gate 1 — 11-phase Windows Terminal smoke test

Run the full checklist in
`docs/tui/TUI-2.1-MANUAL-SMOKE-TEST.md`:

- [YES] Phase 1: Startup verification (clean startup, health, version)
- [YES] Phase 2: Trigger approval (approval-required action creates PENDING)
- [ ] Phase 3: Inspector (open, close, clear selection)
- [ ] Phase 4: Approval lifecycle (APPROVED → CLAIMED → CONSUMED)
- [ ] Phase 5: Denial lifecycle (zero executor calls)
- [ ] Phase 6: Prompt conflict protection (typing, return, rapid keys, Esc)
- [ ] Phase 7: Session isolation (switch sessions, state correct on return)
- [ ] Phase 8: Resize (selection + inspector survive resize)
- [ ] Phase 9: Theme validation (dark + light, copy not color alone)
- [ ] Phase 10: Restart recovery (durable approvals re-hydrate)
- [ ] Phase 11: Mouse interaction (entries render; mouse parity)

## Gate 2 — Width matrix (59–180 columns)

Resize the terminal to each width and check right-edge clipping, rail,
prompt, approval, and inspector. Record PASS/FAIL per cell in the matrix
(template in `docs/tui/TUI-2.1-FREEZE-REPORT.md` §7):

| Width | Right-edge | Rail | Prompt | Approval | Inspector | Status |
|---|---|---|---|---|---|---|
| 59 | — | — | — | — | — | NOT TESTED |
| 60 | — | — | — | — | — | NOT TESTED |
| 79 | — | — | — | — | — | NOT TESTED |
| 80 | — | — | — | — | — | NOT TESTED |
| 99 | — | — | — | — | — | NOT TESTED |
| 100 | — | — | — | — | — | NOT TESTED |
| 119 | — | — | — | — | — | NOT TESTED |
| 120 | — | — | — | — | — | NOT TESTED |
| 180 | — | — | — | — | — | NOT TESTED |

## Gate 3 — Dark/light theme matrix

For each element, verify dark AND light themes, and that security states are
distinguishable without color alone (glyphs + text labels). Template in the
freeze report §6: selected, focused, pending approval, approved, denied,
failed, successful, inspector, prompt focus, diff additions, diff deletions.

## Gate 4 — Approval lifecycle end to end

> Keyboard note: the composer owns letter keys while focused. Press `Esc` to
> leave the composer and activate the spine keys (`j`/`k` navigate, `v`
> inspect, `a` approve, `d` deny) — this works while idle AND while a durable
> approval is pending mid-turn. `Esc` again clears the selection; `Esc` a
> third time returns to the composer. While busy with no pending approval,
> `Esc` keeps its two-press interrupt meaning, and while a permission
> ACTION GATE is open, `Esc` rejects the gate (use `←`/`→` + `Enter`).
>
> **Contract gate warning:** on the `contract.accept` ACTION GATE, `Esc`
> DECLINES the contract. A declined contract leaves the session in
> LEGACY_COMPAT mode, which disables exact intent enforcement entirely —
> no durable approvals are ever created and Phase 4 cannot be observed.
> Always accept the contract gate with `←`/`→` + `Enter` (Allow once) before
> testing the approval lifecycle.

Observe in the real TUI:

```text
PENDING → APPROVED → CLAIMED → CONSUMED
```

Each transition must render a distinct spine receipt, and the durable record
must match (check via `docs/audits/stream-truncation-audit.md` methods or the
approval DB).

## Gate 5 — Denial executes zero protected effects

Trigger an approval, deny it, and confirm zero protected executor calls
(receipt shows rejection; no tool/effect executed).

## Gate 6 — Restart recovery and session isolation

- Restart the daemon/TUI mid-approval: durable approvals re-hydrate.
- Switch sessions: approvals and spine state stay scoped per session; the
  approval list never shows another session's records.

## Gate 7 — Six-checkpoint live-stream validation

```bash
bun run /l/tmp/probe-sse.ts http://127.0.0.1:9142
```

- [ ] 1. Live rendered text equals durable text
- [ ] 2. ResourceExhausted/error turn renders visibly and reconciles
- [ ] 3. Abort mid-turn persists `finish="error"`
- [ ] 4. Daemon survives 6+ minutes idle
- [ ] 5. Active connections remain ≤ 10 throughout
- [ ] 6. Daemon kill mid-turn heals within ~35 seconds

DoD: 6/6 PASS → stall-class confidence 100%.

## Gate 8 — Performance measurements

| Metric | Target |
|---|---|
| Approval receipt append p95 | <20ms |
| Inspector open p95 | <50ms |
| Approval command feedback p95 | <100ms |
| Resize reflow p95 | <50ms |
| Session switch p95 | <100ms |
| Filter update p95 | <100ms |
| 10,000-event session load | <2s |
| Typing lag | none during normal input |
| Idle CPU | no sustained usage |
| Scroll stalls | no multi-second stalls |
| Viewport culling | entry count bounded |
| Memory after scroll cycles | no continuous growth |

## Gate 9 — Exact-commit full verification

After all manual gates pass, commit the final state, then run every suite at
that exact commit:

```bash
bun run typecheck            # 16/16 packages
bun run build                # 8/8 tasks
bun --cwd packages/tui test  # full TUI suite
bun --cwd packages/core test # full core suite
bun --cwd packages/engine test # full engine suite (expect 4248 pass / 74 skip / 1 todo / 0 fail)
bun --cwd packages/arcana test
bun --cwd packages/sdk/js test
cargo test                   # in tools/acep-conformance-rust
bun run smoke                # 8/8
```

Record the exact evaluated commit in the freeze sign-off.

## Gate 10 — Release/polish blockers equal zero

Verify the hard-gate list in `docs/tui/TUI-2.1-PRODUCTION-INTEGRATION-POLISH.md`
§11 has zero violations (direct shell→executor paths, button→effect paths,
duplicate commands, cross-session approvals, right-edge truncation, viewport
overflow, selection loss on resize, hydration crashes, false COMPLETE traces,
APPROVED-as-EXECUTED, recovery auto-retries, critical states hidden by
filters, stale branding).

## Recording and final steps

1. Fill every checkbox/table above and the freeze report matrices.
2. Update `docs/audits/TUI-2.1-FREEZE-SIGNOFF-2026-08-01.md` with results and
   the exact evaluated commit.
3. Human approver signs the freeze sign-off (Approve / Reject).
4. Only after sign-off: create the immutable milestone tag at the exact
   evaluated commit. Older candidates (`3833cde0`, `e7cc8da6`, `1ed93b12`)
   must never be tagged as TUI-2.1.

See `docs/STATUS.md` for the live status authority.

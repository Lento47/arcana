# Arcana 1.0 Convergence: Blocker Register

**Status: NOT REACHED.** Arcana 1.0 (playbook §42–43) requires Phase A–C
complete, TUI 1.0 complete, CLI 1.0 complete, a stable local
installer/update path, stable policy and RunProof schemas, at least one
production-quality external-agent adapter, complete operator documentation,
and signed release artifacts.

## Open blockers

| ID | Blocks | Evidence / gap | Acceptance evidence required |
|---|---|---|---|
| BLK-1.0-01 | TUI 1.0 complete | TUI-2.1 freeze not authorized | Runbook Gates 1–10 at the final commit + sign-off |
| BLK-1.0-02 | CLI 1.0 complete | no frozen JSON/exit-code contract; no launch adapters | CLI 1.0 milestone frozen |
| BLK-1.0-03 | one production-quality external adapter | `arcana launch *` unimplemented | Adapter at declared certification level with hostile-escape fixture |
| BLK-1.0-04 | signed release artifacts + stable installer/update path | pre-release builds only; **release-flow plan published 2026-08-02** (`docs/releases/RELEASE-FLOW-PLAN.md`: verify → freeze/tag → build → sign → installer/update smoke → publish → promote → post-verify) but NOT executed | Signed artifacts, installer/upgrade data-loss tests = 0 |
| BLK-1.0-05 | mainline promotion | `master`/`origin/master` stale; Phase B/C/D-7/TUI-2 commits not on mainline; promotion step defined in the release-flow plan | `master` fast-forwarded to the verified release commit |

## Additional release evidence requirements

- Local unauthorized executions in frozen suite: 0 (Phase C evidence exists).
- TUI/CLI authorization disagreements: 0 (frozen adversarial cross-surface
  suite pending — see BLK-CLI-05).
- Proof verification regressions: 0 (Phase B suites green).
- Supported-platform smoke tests: 100% (Windows done; Linux/macOS pending —
  BLK-CLI-04).

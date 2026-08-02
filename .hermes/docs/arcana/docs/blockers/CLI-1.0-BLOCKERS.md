# CLI 1.0 — Local Control and Automation Surface: Blocker Register

**Status: PARTIAL — the commands exist and are tested (116/116 CLI/proof
tests), but the CLI 1.0 contract is not frozen.**

## Open blockers

| ID | Blocks (playbook §26–27) | Gap evidence | Acceptance evidence required |
|---|---|---|---|
| BLK-CLI-01 | External-agent launch group (`arcana launch codex/claude/gemini`) | A1 scaffold implemented (`launch.ts`: declaration, `--dry-run`, supervision, durable launch evidence); **no sandbox/enforcement claim**; production adapter pending | One production adapter reaches a declared certification level; others documented |
| BLK-CLI-02 | Stable JSON output + deterministic documented exit codes for every command | JSON/exit-code contract not frozen in a spec | Command catalog with JSON schema and exit-code table, tested |
| BLK-CLI-03 | Shell completion | Not implemented | Completion scripts + test |
| BLK-CLI-04 | Cross-platform smoke (Windows/Linux/macOS) | Windows primary; Linux scaffold only (D-6A-L pending) | Platform matrix with smoke results |
| BLK-CLI-05 | CLI/TUI share the same runtime APIs with no CLI-only bypass | `arcana` CLI and TUI both route through the engine PEP; bypass audit not yet a frozen adversarial suite | CLI-only-bypass adversarial suite = 0 |

## Existing evidence

- `docs/releases/CLI-1.0-FREEZE-DRAFT.md` (2026-08-02): command catalog,
  proposed JSON/NDJSON + exit-code contract, launch protocol, gate evidence.

- Governance/proof commands: `arcana epistemic proof inspect/verify/export`,
  `replay audit/deterministic`, `revalidate run` — 116/116 tests.
- Policy/capability: `arcana capability ...` (`packages/engine/src/cli/cmd/capability.ts`),
  approval CLI paths.
- Operations: `doctor`, `trust`, `models`, `providers`, `session list`,
  `daemon status/stop`, `serve`, `gateway`, `cron`, `memory`, `skills`.

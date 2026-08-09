# Arcana CLI Platform Smoke Matrix (BLK-CLI-04)

**Document class:** smoke evidence (platform matrix)
**Authority:** secondary - status decisions live in `docs/STATUS.md`
**Created:** 2026-08-05
**Blocker:** BLK-CLI-04 (Cross-platform smoke, Windows/Linux/macOS)
**Smoke script:** `script/platform-smoke.sh` (worktree-relative, commit `5263b6fa`)

## Methodology

The smoke script runs the Arcana CLI from source with `bun run
packages/arcana/src/index.ts <command>` from the repository root. Each check
passes only when the CLI exits 0 and the expected evidence appears in the
combined stdout/stderr output. The Evidence column records the actual output
line that satisfied the check.

Execution facts:

- Host: Windows 11 (build 26200, MINGW64), MSYS2 bash 5.2.37, bun 1.3.14.
- Execution date: 2026-08-05 (UTC 15:21:53).
- Executed tree: commit `5263b6fa` (working tree identical to the script
  commit).
- Check count: 10 checks, 10 pass, 0 fail.

Fixed smoke points: `--version`, `--help`, `doctor`, `trust --help`,
`capability --help`, `proof --help`, `epistemic proof --help`,
`session --help`, `node --help`, and `trust status` (one real command that
works without a daemon).

## Matrix

| Platform | Shell | Status | Evidence | Notes |
|---|---|---|---|---|
| Windows | bash (MSYS2) | PASS | `0.3.67`, exit 0 | `--version` |
| Windows | bash (MSYS2) | PASS | command catalog printed (`Commands:`), exit 0 | `--help` |
| Windows | bash (MSYS2) | PASS | `arcana doctor, 7/8 checks pass`, exit 0 | `doctor`, runs without a daemon |
| Windows | bash (MSYS2) | PASS | `trust a workspace to load project plugins, tools, agents, and local MCP`, exit 0 | `trust --help` |
| Windows | bash (MSYS2) | PASS | `manage session capabilities`, exit 0 | `capability --help`, capability group help |
| Windows | bash (MSYS2) | PASS | engine command catalog includes `arcana epistemic`, exit 0 | `proof --help`; no standalone `proof` command, proof group is `epistemic proof` |
| Windows | bash (MSYS2) | PASS | `RunProof inspection, verification, and export`, exit 0 | `epistemic proof --help` |
| Windows | bash (MSYS2) | PASS | `manage sessions`, exit 0 | `session --help` |
| Windows | bash (MSYS2) | PASS | `operate a local Arcana Node (enroll, proof upload, sync, status)`, exit 0 | `node --help` |
| Windows | bash (MSYS2) | PASS | `status untrusted` for `packages/engine`, exit 0 | `trust status`, real command without a daemon |
| Linux | bash | NOT EXERCISED | no Linux/macOS host available in the autonomous environment; D-6A-L Linux validation is a separate open blocker (BLK-D-03) | Linux scaffold only (D-6A-L pending) |
| macOS | zsh | NOT EXERCISED | no Linux/macOS host available in the autonomous environment; D-6A-L Linux validation is a separate open blocker (BLK-D-03) | no macOS host available |

## Nonclaims

- No Linux or macOS results are claimed. The NOT EXERCISED rows are honest
  entries, not passes.
- This matrix is not a substitute for D-6A-L Linux workload validation
  (BLK-D-03), which remains a separate open blocker.
- Smoke coverage is limited to the command surface, help output, and one real
  no-daemon command. It does not cover daemon workflows, the TUI, the gateway,
  or live agent sessions.
- Results apply to the executed tree at commit `5263b6fa`. A rerun after
  future CLI changes may produce different results.

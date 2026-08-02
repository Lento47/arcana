# CLI 1.0 — Contract Freeze Draft

**Status:** DRAFT — the CLI 1.0 contract is **NOT frozen**. This document
catalogs the stable command surface and proposes the output/exit-code
contract that a freeze would lock. Freeze requires the BLK-CLI-01..05
acceptance evidence plus explicit human sign-off.
**Date:** 2026-08-02 · **Evaluated surface:** `phase-d-implementation`

## 1. Scope

The CLI 1.0 contract covers:

- Stable command groups (names, arguments, semantics).
- Deterministic JSON/NDJSON output and machine-readable errors.
- A documented exit-code table.
- The launch protocol (external-agent runtime wrapper).
- Proof/policy/audit commands.
- Daemon lifecycle commands.

## 2. Command catalog (candidate stable surface)

| Group | Commands | Output mode |
|---|---|---|
| Run | `run [message..]`, `loop`, `workflow` | text / JSON |
| Session | `session list`, `session delete <sessionID>` | text / JSON |
| Proof | `proof inspect`, `proof verify`, `proof export` | text / JSON / NDJSON streams |
| Epistemic | `epistemic claims`, `epistemic assumptions`, `epistemic contract`, `epistemic obligations`, `epistemic proof` | text / JSON |
| Replay | `replay audit <session-id>`, `replay deterministic <session-id>`, `replay-db` | text / JSON |
| Revalidation | `revalidation run <session-id>` | text / JSON |
| Capability | `capability revoke <sessionID> <capabilityID>` | JSON |
| Node | `node enroll`, `node key rotate`, `node proof upload`, `node sync <kind>`, `node status` | text / JSON |
| Daemon | `daemon <action>` (status/stop/start), `serve` | text / JSON |
| Trust | `trust grant/status/revoke/list` | text / JSON |
| Config | `config [action]`, `doctor` | text / JSON |
| Provider/Model | `providers list/login/logout`, `models [provider]`, `proxy status/models/usage/balance` | text / JSON |
| Account | `account login/logout/switch/orgs/open/console` | text / JSON |
| MCP | `mcp list/auth/logout/add/debug` | text / JSON |
| Gateway/Cron/Memory/Skills | `gateway [action]`, `cron <action>`, `memory <action>`, `skills [action]` | text / JSON |
| Audit | `audit events`, `audit status` | JSON / NDJSON |
| Launch | `launch <runtime>` (codex/claude/gemini) — A1 scaffold only, **no sandbox claim** | text / JSON |
| License | `license activate/status/deactivate` | JSON |
| Plugin | `plugin <module>`, `plugin-store search/install/create/publish` | text / JSON |
| Ops | `export [sessionID]`, `import <file>`, `generate`, `theme`, `history`, `feedback`, `stats`, `team status/sessions/skills` | text / JSON |
| Upgrade | `upgrade`, `uninstall` | text / JSON |

## 3. Proposed machine contract

### JSON output

- Every command accepts `--json` (and stream commands accept `--ndjson`).
- Machine output is emitted **only** on stdout; human copy goes to stderr.
- Errors are single JSON objects: `{"error":{"code","message","details"?}}`.
- A successful empty result is `null` or `{}` — never a bare newline.

### Exit codes

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | Expected failure (rejected, not found, invalid input) |
| 2 | Usage error (unknown flag/argument) |
| 130 | Interrupted (SIGINT) |
| 70 | Internal error (unexpected defect) |

### Launch protocol (A1)

`arcana launch <runtime>` performs declaration, `--dry-run`, supervision,
and a durable launch-evidence record. It is a scaffold with explicit
boundaries/bypasses; it does **not** claim OS-level containment. A
production adapter claim requires hostile-escape fixtures (BLK-E-05).

## 4. Gate evidence

| Blocker | Current evidence | Acceptance evidence required to freeze |
|---|---|---|
| BLK-CLI-01 | `launch.ts` A1 scaffold (declaration, dry-run, supervision, evidence) | One production adapter at a declared certification level; others documented |
| BLK-CLI-02 | This draft (catalog + JSON/exit-code contract); commands already emit JSON in places | Command catalog with JSON schema + exit-code table, tested per command |
| BLK-CLI-03 | Not implemented | Completion scripts + test |
| BLK-CLI-04 | Windows primary (tested); Linux scaffold pending | Platform matrix with smoke results (Windows/Linux/macOS) |
| BLK-CLI-05 | CLI and TUI route through the engine PEP | CLI-only-bypass adversarial suite = 0 |

## 5. Nonclaims

- This draft does not freeze the CLI. It is a proposal for review.
- No certification level for launch adapters is claimed.
- CLI 1.0 is not a prerequisite blocker for Arcana 1.0 convergence until the
  playbook §42 scope says otherwise; see `docs/blockers/ARCANA-1.0-BLOCKERS.md`.

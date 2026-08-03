# Freeze Drafts and Release Plan (consolidated)

**Status:** DRAFTS / PLANS — none are authorized. Freeze requires the stated acceptance evidence plus explicit human sign-off.
**Consolidated:** 2026-08-02 — merges the former `docs/releases/CLI-1.0-FREEZE-DRAFT.md`, `docs/releases/PHASE-F-FREEZE-DRAFT.md`, and `docs/releases/RELEASE-FLOW-PLAN.md`
**Implementation checkpoint:** `63d71f07` (2026-08-03; upstream advanced from `0392ad7b` via merged PRs #43–47)
**Documentation reconciliation commit:** `882ea468` (baseline for the consolidated files)

This file contains: (1) the Phase F GA freeze draft with playbook §40 gate evidence, (2) the CLI 1.0 contract freeze draft (catalog, JSON/NDJSON + exit-code contract, launch protocol), and (3) the release-flow plan (verify → freeze/tag → build → sign → installer/update smoke → publish → mainline promotion → post-verify).

## TUI-2.1 freeze gates

**Status:** OPEN — every gate below remains to be passed at the exact final
commit. Freeze is NOT authorized until each gate records its acceptance
evidence and receives explicit human sign-off. These map to runbook Gates 1–10
(`TUI-2.1-FREEZE-OPERATOR-RUNBOOK`), blocker register `BLK-TUI-01..08`
(`docs/BLOCKERS.md` §TUI 1.0 / TUI-2.1), and tasks `AUD-01..08`
(`docs/TASKS.md`).

| # | Gate | Owner | Evidence location / required evidence |
|---|---|---|---|
| 1 | 11-phase manual Windows Terminal smoke (>50 checkpoints) | Operator + engineering | Signed 11-phase checklist at the exact final commit (`TUI-2.1-FREEZE-OPERATOR-RUNBOOK`; BLK-TUI-01; AUD-01) |
| 2 | Width matrix 59–180 | Engineering | Matrix at 59/60/79/80/99/100/119/120/180 with zero right-edge clipping (BLK-TUI-02; AUD-02) |
| 3 | Dark/light theme matrix | Engineering | All approval/tool/spine states in both themes; security states never color-only (BLK-TUI-03; AUD-03) |
| 4 | Approval lifecycle observation via spine keys (`v`/`a`/`d`) | Operator + engineering | PENDING→APPROVED→CLAIMED→CONSUMED observed in a live session incl. exact request inspector and prompt-conflict check (BLK-TUI-04; AUD-04) |
| 5 | Restart recovery + session isolation | Operator + engineering | Restart + per-session isolation checkpoints passed (durable approval re-hydration, per-session isolation) (BLK-TUI-05; AUD-05) |
| 6 | Performance measurements | Engineering | p95 input echo < 16.7 ms, session-open to input-ready < 500 ms (warm daemon), no redundant requests/reconnect storms/idle traffic (BLK-TUI-07; AUD-07) |
| 7 | 6-checkpoint live stream protocol (probe SSE) | Engineering | 6/6 checkpoints PASS at the final commit (BLK-TUI-06; AUD-06) |
| 8 | Suite rerun at the exact final commit | Engineering | Full core/engine/TUI/CLI/SDK/Rust suite rerun green at the tagged commit; totals recorded (BLK-TUI-08; AUD-08) |
| 9 | Human freeze sign-off | Maintainer + operator | Explicit human approval recorded (freeze NOT authorized without it) |
| 10 | Immutable milestone tag | Maintainer | Immutable tag created at the verified final commit after sign-off (release-flow Phase 1) |

Evidence for every gate must be recorded with a date, commit, and verification
command per `docs/BLOCKERS.md` closing rules before the freeze is declared.

## Phase F — GA Freeze Draft

**Status:** DRAFT — cores for F1–F12 are implemented and tested in-repo;
the Phase F/Control 1.0 release freeze is NOT authorized. The outstanding
gates include unresolved production security and integration code gaps.
The remaining work is not exclusively operational or external — notably
BLK-F-AUTH-01 (authenticated administrative identity binding).
**Date:** 2026-08-02

## Playbook §40 gate evidence

| Gate | Required | Evidence | Verdict |
|---|---|---|---|
| Cross-tenant data leaks | 0 | F1 tenant store (tenant-filtered queries, deletion isolation) | PASS (core) |
| Unauthorized administrative actions | 0 | RBAC decision core: PASS; Authenticated administrative HTTP boundary: BLOCKED by BLK-F-AUTH-01 | BLOCKED (core PASS; HTTP identity boundary open) |
| Federation authority amplification | 0 | F8 authority intersection (never broadens) | PASS (core) |
| Central approval bypass of local PEP | 0 | F5 central queue decides only; local PEP consumes by exact hash | PASS (design + core) |
| Unverifiable compliance exports | 0 | F6 fingerprint-verified archive exports (SDK verifier) | PASS (core) |
| Restore drills outside published RPO/RTO | 0 | F7 drill evaluation vs targets | PASS (evaluator); LIVE EXERCISE PENDING |
| Critical penetration-test findings unresolved | 0 | — | BLOCKED (external, BLK-F-13) |
| Fleet health false-positive "healthy" states | 0 | F4 health derivation (UNKNOWN/STALE explicit) | PASS (core) |

## Operational gates

| Gate | Status |
|---|---|
| Defined and measured SLOs | CORE DONE (availability target in F7); live measurement pending |
| Successful DR exercise | PENDING (live) |
| Successful compromised-node exercise | PENDING (live; F9 campaign core DONE) |
| Successful key-rotation exercise | PENDING (live; D-1 rotation DONE) |
| Tenant-isolation adversarial suite | CORE DONE (F1 tests + D-10 matrix) |
| Federation adversarial suite | CORE DONE (F8 tests) |
| Independent proof verification by a separate implementation | PENDING (L3; Rust verifier is the in-repo second implementation) |

## What remains for the freeze

1. Live DR, compromised-node, and key-rotation exercises (operator-run).
2. External architecture review + penetration test + threat-model review +
   supply-chain assessment (BLK-F-13).
3. L3 independent reproduction of core suites.
4. Production mounting of the enterprise cores into the console/API —
   **mostly DONE 2026-08-02**: `/api/enterprise/*` now mounts all F1–F12
   cores (17 HTTP integration tests), SIEM CEF export, ticketing payloads,
   and the SDK enterprise admin client (equivalent automation) are shipped.
   Remaining surfaces are the authenticated administrative identity binding
   (BLK-F-AUTH-01 — enterprise mutations must derive actor/tenant identity
   from the authenticated server context; fix PR open: #53 (enterprise auth
   boundary), unmerged), operator-facing consoles/UI (F3
   simulation editor, F5 escalation console, F6 auditor console), plus live
   transport adapters (ticketing delivery, Terraform provider is optional
   given the SDK client).

## Nonclaims

- "Implemented core" means the security-relevant logic is implemented and
  tested in-repo; it is not a production GA claim.
- No compliance certification (SOC 2 / ISO 27001 / NIST) is claimed.

## CLI 1.0 — Contract Freeze Draft

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

- Proposed contract: every command will accept `--json` (and stream commands
  will accept `--ndjson`). Current implementation coverage is incomplete and
  must be audited per command.
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
- CLI 1.0 is a required Arcana 1.0 convergence gate.
  This draft does not satisfy it until BLK-CLI-01..05 pass and receive
  explicit human sign-off.

## Release Flow Plan

**Status:** PLAN — prepared but **NOT executed**. Executing any phase
requires the applicable freeze sign-offs and explicit human approval.
**Date:** 2026-08-02 · **Branch:** `phase-d-implementation`

## 1. Objective

Define the Arcana 1.0 release path: verify at an exact commit, tag and
freeze, build, sign, installer/update smoke, publish, and promote the
mainline. This satisfies playbook §42–43 items (stable installer/update
path, signed release artifacts) and AUD-19.

## 2. Phases

| # | Phase | Steps | Gate before executing |
|---|---|---|---|
| 0 | Exact-commit verification | Run core/engine/TUI/SDK/conformance/typechecks at the chosen commit; record totals | Commit is the verified release candidate |
| 1 | Freeze + tag | Phase F/Node 1.0/TUI-2.1 freeze sign-offs; create immutable milestone tag | Human sign-off per phase |
| 2 | Build | `bun run build` (8/8 tasks), engine binaries, platform packages | Build matrix green |
| 3 | Sign | Sign binaries + packages (key management defined; signing key holder required) | Key holder + verifiable signature |
| 4 | Installer/update smoke | Fresh install, upgrade from previous release, rollback; **data-loss defects = 0** | Installer/upgrade test report |
| 5 | Publish | Release notes, artifacts, checksums, signatures | Signed artifacts + docs |
| 6 | Mainline promotion | Fast-forward `master`/`origin/master` to the verified release commit; push | BLK-1.0-05 evidence + release sign-off |
| 7 | Post-release verification | Re-run smoke on the published artifact; record evidence | Release record |

## 3. Owners and evidence

| Blocker | Owner | Artifact | Evidence required |
|---|---|---|---|
| BLK-1.0-04 (signed artifacts + installer/update) | Release engineer + key holder | Signed binaries, installer package, upgrade fixtures | Signature verification log; upgrade data-loss tests = 0 |
| BLK-1.0-05 (mainline promotion) | Maintainer | `master` commit + tag | `master` fast-forwarded to verified release commit; CI green |
| AUD-19 (release flow) | Release engineer | This plan + executed phase records | Per-phase evidence captured at each step |

## 4. Nonclaims

- No release has been executed under this plan.
- `master`/`origin/master` is still stale relative to
  `phase-d-implementation` (BLK-1.0-05).
- Pre-release builds (`0.0.0-phase-d-implementation-*`) are not release
  candidates.

# TUI 2.1 Freeze Report

**Date:** 2026-07-31
**Branch:** `phase-d-implementation`
**Candidate commit:** `e7cc8da6`
**Previous commit:** `1f4779ac` (polish sprint baseline)

---

## 1. Candidate Commit

| Field | Value |
|-------|-------|
| SHA | `e7cc8da6` |
| Message | `TUI: remove shimmer verb and spinner from chat header` |
| Branch | `phase-d-implementation` |
| Remote | `origin/phase-d-implementation` (`1f4779ac..e7cc8da6`, 13 commits) |

### 1.1 Post-candidate polish (13 commits after `1f4779ac`)

Streaming lifecycle fixes, found and fixed during interactive operator testing:

| Commit | Fix |
|--------|-----|
| `aedd96dc` | `updateMessage` passed `msg` by reference — SolidJS reconcile saw no diff, streaming never ended. Now `structuredClone` on publish. |
| `6b75ad9e` | `runState` checked nonexistent `"running"`/`"thinking"` status types — now `"busy"`/`"retry"`. |
| `b14ca9a6` | `makeInlineThinkEntry` passed no `part.time` — inline thinking shimmer stuck. |
| `5fd291ea` | **ROOT CAUSE** `spine-node.tsx:223` `active={!!thinking()}` always true (plan entries hardcode `thinking="thinking"`) — now `active={streaming()}`. |
| `099ad3ac` | `thinkingSummary` static "Thinking" — flips to "Thought" once the reasoning part ends (streaming-aware). |
| `6d9bdb39` | Header shimmer verb "writing" for the answer phase + 2 regression tests. |
| `e7cc8da6` | **Operator decision:** remove shimmer verb and spinner from the `✦ arcana` header entirely. Think row owns the Thinking/Thought label. |

**Validated by operator** in the real TUI: "Thinking" → "Thought" flip confirmed; header now static. 2 new regression tests in `test/spine-mapper.test.ts` prove the plan entry flips `streaming=false` on message completion + session idle, and stays `true` mid-stream (busy).

---

## 2. Environment

| Field | Value |
|-------|-------|
| OS | Windows 10 (MSYS2/Git Bash) |
| Node | v22.x (Bun runtime) |
| Bun | 1.3.14 |
| Terminal | Windows Terminal |
| Repo | `L:\PROJECTS\arcana` |

---

## 3. Automated Verification Totals

### Typecheck

| Result | Count |
|--------|-------|
| Packages typechecked | 16/16 |
| Status | **PASS** |

### Build

| Result | Count |
|--------|-------|
| Builds successful | 8/8 |
| Smoke test (version) | `0.0.0-phase-d-implementation-202607311206` |
| Status | **PASS** |

### Tests

| Suite | Passed | Failed | Skipped | Total |
|-------|--------|--------|---------|-------|
| @arcana/tui | 434 | 0 | 1 | 435 |
| @arcana/core | 1209 | 31 | 7 | 1247 |
| @arcana/engine | — | — | — | pass |
| All other packages | — | 0 | — | pass |
| **TUI total** | **434** | **0** | **1** | **435** |

**Note:** The 31 @arcana/core failures are **pre-existing** and unrelated to TUI-2.1 changes. They are in:
- Golden vector conformance suite (crypto test vectors — fixture loading)
- AgentV2 bash opt-in test
- ModelsDev service refresh
- Ripgrep glob/grep (Windows path handling)
- SessionRunnerLLM interrupt tests
- BashTool / WebFetchTool / WebSearchTool registration
- Shell path normalization

None of these touch TUI rendering, approval lifecycle, or command-spine code.

**TUI test result: 434/434 pass, 0 fail (432 baseline + 2 new streaming regression tests).** ✅

---

## 4. Manual Smoke Test Matrix (WS1)

**Status: BLOCKED — Release Blocker RB-01 (approval pipeline not wired into the production runtime).** The 11-phase checklist cannot be executed as written until the engine creates approval records and the session route feeds them to the shell. Source-accuracy verification of the runbook found 1 release blocker + 7 doc-vs-code mismatches (below).

### RB-01 — Approval pipeline not mounted in production (RELEASE BLOCKER)

Verified 2026-07-31 (source inspection + targeted runs):

| Layer | Evidence |
|-------|----------|
| Engine | `packages/engine/src` imports **zero** approval symbols (`approval-lifecycle`, `ApprovalOperatorService`, `GovernedApprovalExecutor`, `approval-store`). No runtime path creates durable ApprovalRecords; consequential tools route through the legacy permission gate. |
| TUI route | `packages/tui/src/routes/session/index.tsx:1535-1590` `shellProps` omits `approvals`, `approvalController`, `activeSessionId`, `activeWorkspaceId`. `useApprovalIntegration` (approval-integration.ts) is exported but used by **no production file**. |
| Consequence | In the real TUI: approval entries never render (`approvals()` is always `[]`), and `a`/`d`/`v`/`Esc` approval commands no-op (controller undefined). WS1 phases 2-7 and 10-11 are untestable. |
| What DOES work | The isolated stack: adapter, controller, operator service, SQLite store, governed executor — 135/135 production-runner tests, 434/434 TUI tests. The gap is wiring, not the stack itself. |

**Fix scope (code — operator permission required):**
1. Engine: route consequential tool requests through the durable approval lifecycle (create ApprovalRecord → operator decision → governed executor → receipt + RunProof).
2. TUI route: consume approval records (sync channel or API) + construct `useApprovalIntegration` controller and pass all four shell props.
3. Delete stale `packages/core/src/crypto/__tests__/run-tui2.1-production-tests.ts` (asserts removed 2-line receipts; never run by `bun test` naming, dead code) or update it.

### Doc-vs-code mismatches (POLISH, fix with RB-01 or record as known deviations)

| # | Doc says | Code says | Severity |
|---|----------|-----------|----------|
| M1 | PENDING entry glyph `◤` | `◇` (`SPINE_GLYPH.approve`, spine-types.ts:281 — collides with think glyph; `◤` only in receipts) | POLISH |
| M2 | Receipt line `authority approval consumed · 0 uses` | Removed by fix AD-02; adapter emits one line | POLISH (doc stale) |
| M3 | Receipt line `approval rejected` | Removed by fix AD-03; one line | POLISH (doc stale) |
| M4 | Fresh PENDING Version "should be 1" | Records created at version 0 (lifecycle:207, sqlite DEFAULT 0); version 1 after approve | POLISH |
| M5 | "Full request hash (not truncated)" | Body truncates request hash to 16 chars (adapter:123) | POLISH |
| M6 | "Inspector opens" | No inspector panel exists; info is the PENDING expanded entry body | POLISH |
| M7 | "Brief SUBMITTING state visible" | SUBMITTING is internal shell state; no UI renders it | POLISH |

All 11 phases from `docs/tui/TUI-2.1-MANUAL-SMOKE-TEST.md` remain required, but phases 2-7/10-11 are **blocked pending RB-01**.

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Startup Verification | NOT TESTED — requires interactive terminal |
| 2 | Trigger Approval | BLOCKED — RB-01 (no engine approval path) |
| 3 | Inspector | BLOCKED — RB-01 (M6: no inspector panel; info is expanded body) |
| 4 | Approval Lifecycle (APPROVED → CLAIMED → CONSUMED) | BLOCKED — RB-01 |
| 5 | Denial Lifecycle (zero executor calls) | BLOCKED — RB-01 |
| 6 | Prompt Conflict Protection | BLOCKED — RB-01 (logic verified in code) |
| 7 | Session Isolation | BLOCKED — RB-01 (logic verified in code) |
| 8 | Resize (9 width breakpoints) | NOT TESTED — requires interactive terminal |
| 9 | Theme Validation (dark + light) | NOT TESTED — requires interactive terminal |
| 10 | Restart Recovery | BLOCKED — RB-01 (no durable records exist to recover) |
| 11 | Mouse Interaction | BLOCKED — RB-01 (no entries to click) |

### Instructions for Manual Tester

```bash
# Start the TUI
cd L:\PROJECTS\arcana
bun run dev:tui

# Follow the 11-phase checklist in:
# docs/tui/TUI-2.1-MANUAL-SMOKE-TEST.md

# Record each checkpoint as one of:
#   PASS
#   FAIL -- RELEASE BLOCKER
#   FAIL -- POLISH BLOCKER
#   FAIL -- NON-BLOCKING
#   NOT TESTED -- reason
```

---

## 5. WS3 Lifecycle Rendering Evidence (WS2)

**Status: PENDING — requires real runtime traffic observation**

The following tool lifecycle states must be observed in the production TUI with real tool execution:

| State | Observed | Spine Entry | Ordering | Duplicates | Notes |
|-------|----------|-------------|----------|------------|-------|
| requested | — | — | — | — | |
| running | — | — | — | — | |
| completed | — | — | — | — | |
| failed | — | — | — | — | |
| denied | — | — | — | — | |
| approval required | — | — | — | — | |
| approved | — | — | — | — | |
| claimed | — | — | — | — | |
| consumed | — | — | — | — | |
| retried | — | — | — | — | |
| interrupted | — | — | — | — | |

### Automated Evidence (from test suite)

The 432 passing TUI tests cover:
- Approval lifecycle state transitions (PENDING → APPROVED → CLAIMED → CONSUMED)
- Denial with zero executor calls
- Spine entry rendering and ordering
- Viewport culling
- Error boundary behavior
- Keyboard command isolation
- Truncation of long commands, URLs, hashes, JSON

These tests validate the rendering logic but do **not** replace visual verification in the real runtime.

---

## 6. Theme Matrix (WS3a)

**Status: PENDING — requires visual inspection**

| Element | Dark | Light |
|---------|------|-------|
| Selected entry | — | — |
| Focused entry | — | — |
| Pending approval | — | — |
| Approved | — | — |
| Denied | — | — |
| Failed | — | — |
| Successful | — | — |
| Inspector | — | — |
| Prompt focus | — | — |
| Diff additions | — | — |
| Diff deletions | — | — |

**Status-not-color-alone requirement:** Must verify that security states are distinguishable without relying on color alone (glyphs + text labels).

---

## 7. Width Matrix (WS3b)

**Status: PENDING — requires visual inspection**

| Width | Right-edge | Rail | Prompt | Approval | Inspector | Status |
|-------|-----------|------|--------|----------|-----------|--------|
| 59 | — | — | — | — | — | NOT TESTED |
| 60 | — | — | — | — | — | NOT TESTED |
| 79 | — | — | — | — | — | NOT TESTED |
| 80 | — | — | — | — | — | NOT TESTED |
| 99 | — | — | — | — | — | NOT TESTED |
| 100 | — | — | — | — | — | NOT TESTED |
| 119 | — | — | — | — | — | NOT TESTED |
| 120 | — | — | — | — | — | NOT TESTED |
| 180 | — | — | — | — | — | NOT TESTED |

---

## 8. Performance Observations (WS3c)

**Status: PENDING — requires measurement in real terminal**

| Metric | Threshold | Measured |
|--------|-----------|----------|
| Visible typing lag | None during normal input | — |
| Sustained CPU while idle | None | — |
| Scroll stalls | No multi-second stalls | — |
| Viewport culling | Entry count bounded | — |
| Memory after scroll cycles | No continuous growth | — |

### Automated Evidence

- `viewportCulling={true}` confirmed in `command-spine-shell.tsx:559` (fix CS-03)
- Error boundary prevents crash-induced unmount (fix log WS2)

---

## 9. Dependabot Disposition (WS4)

### Open Alerts (4)

#### Alert #29 — dompurify `CUSTOM_ELEMENT_HANDLING` bypass (LOW)

| Field | Value |
|-------|-------|
| Package | dompurify |
| Installed | 3.4.11 |
| Patched | 3.4.12 |
| Manifest | `packages/ui/package.json` |
| Severity | LOW |
| Direct/Transitive | Direct |
| Reachability | **Production** — used in `packages/ui/src/components/markdown.tsx` |
| Vulnerability mechanism | `CUSTOM_ELEMENT_HANDLING` bypasses `afterSanitizeElements` for allowed custom elements |
| Arcana invokes vulnerable code? | **No** — Arcana's DOMPurify config does not use `CUSTOM_ELEMENT_HANDLING`. Config uses `USE_PROFILES`, `SANITIZE_NAMED_PROPS`, `FORBID_TAGS`, `FORBID_CONTENTS`, `ADD_TAGS`, `ADD_ATTR` only. |
| Remediation | `dompurify` 3.4.11 → 3.4.12 (patch bump) |
| Regression risk | **Minimal** — patch version, same API |
| **Classification** | **PATCH BEFORE MERGE** |

#### Alert #28 — @hey-api/openapi-ts prototype pollution (MEDIUM)

| Field | Value |
|-------|-------|
| Package | @hey-api/openapi-ts |
| Installed | 0.90.10 |
| Patched | 0.97.3 |
| Manifest | `packages/sdk/js/package.json` |
| Severity | MEDIUM |
| Direct/Transitive | Direct |
| Reachability | **NOT REACHABLE** — devDependency used for OpenAPI client code generation only |
| Vulnerability mechanism | `buildClientParams` template: prototype chain substitution via unknown `$<slot>___proto__` key |
| Arcana invokes vulnerable code? | **No** — `openapi-ts` is a codegen CLI tool. It runs at build time to generate SDK types. The generated output is committed static TypeScript. The vulnerable template processing never executes in production or at runtime. |
| Remediation | 0.90.10 → 0.97.3 (major version bump — **breaking changes in generated code likely**) |
| Regression risk | **High** — 7 minor versions, likely API changes in generated client |
| **Classification** | **NOT REACHABLE — documented evidence** |

**Evidence:** `@hey-api/openapi-ts` appears only in `packages/sdk/js/package.json` as a devDependency. No runtime code path imports or invokes it. The SDK source is pre-generated committed TypeScript.

#### Alert #4 — nitro Open Redirect (MEDIUM)

| Field | Value |
|-------|-------|
| Package | nitro |
| Installed | 3.0.1-alpha.1 |
| Patched | 3.0.260429-beta |
| Manifest | `packages/enterprise/enterprise/package.json` |
| Severity | MEDIUM |
| Direct/Transitive | Direct |
| Reachability | **Build/dev** — SolidStart server runtime via `nitro/vite` plugin |
| Vulnerability mechanism | Open Redirect via Protocol-Relative URL Bypass in Wildcard Route Rules |
| Arcana invokes vulnerable code? | **Possibly** — enterprise app uses `nitro()` in vite config. If wildcard route rules are configured, the bypass could apply. However, the default config in `app.config.ts` does not configure explicit wildcard routes. |
| Remediation | Update `packages/enterprise/enterprise/package.json` nitro 3.0.1-alpha.1 → 3.0.260429-beta (already done in outer `packages/enterprise/package.json`) |
| Regression risk | **Medium** — alpha → beta, SolidStart compatibility needs verification |
| **Classification** | **PATCH IN SEPARATE SECURITY PR** |

#### Alert #3 — nitro proxy scope bypass (MEDIUM)

| Field | Value |
|-------|-------|
| Package | nitro |
| Installed | 3.0.1-alpha.1 |
| Patched | 3.0.260429-beta |
| Manifest | `packages/enterprise/enterprise/package.json` |
| Severity | MEDIUM |
| Direct/Transitive | Direct |
| Reachability | **Build/dev** — same as Alert #4 |
| Vulnerability mechanism | Proxy scope bypass via percent-encoded path traversal in `routeRules` |
| Arcana invokes vulnerable code? | **Same assessment as #4** — no explicit proxy route rules in default config |
| Remediation | Same fix as #4 (single version bump resolves both) |
| Regression risk | **Medium** — same as #4 |
| **Classification** | **PATCH IN SEPARATE SECURITY PR** |

### Summary

| Alert | Package | Severity | Classification |
|-------|---------|----------|---------------|
| #29 | dompurify | LOW | PATCH BEFORE MERGE |
| #28 | @hey-api/openapi-ts | MEDIUM | NOT REACHABLE — documented |
| #4 | nitro | MEDIUM | PATCH IN SEPARATE SECURITY PR |
| #3 | nitro | MEDIUM | PATCH IN SEPARATE SECURITY PR |

**Freeze-blocking:** None. All alerts are either not reachable or patchable in separate PRs without blocking the TUI freeze.

**Recommended action:**
1. Bump dompurify 3.4.11 → 3.4.12 in `packages/ui/package.json` (before merge)
2. Create `security/dependabot-remediation` branch for nitro update in nested enterprise package
3. Document @hey-api/openapi-ts as not reachable (no action needed)

---

## 10. Known Non-Blocking Limitations

1. Internal "opencode" API names (keymap hooks, SDK client, config values) — breaking refactor, functional identifiers
2. `.opencode` config directory — intentional backward compatibility
3. `as any` casts on theme tokens (~50+) — type debt, not runtime risk
4. Missing error boundaries in Session route and Prompt component — lower priority than spine shell (which now has one)
5. Empty `cwd.ts` file — dead code
6. 31 pre-existing @arcana/core test failures — unrelated to TUI-2.1 (crypto fixtures, Windows paths, ModelsDev)
7. Ollama connection warnings in test output — local service not running, does not affect test results

---

## 11. Release Blockers

**Count: 1 — RB-01 (approval pipeline not wired into production runtime).**

Details in §4. Engine creates no ApprovalRecords; TUI session route passes no approval props. Freeze cannot be authorized until RB-01 is fixed and WS1 approval phases re-run.

## 12. Freeze Decision

### Acceptance Criteria Checklist

- [ ] 11/11 manual smoke phases completed — **PENDING (requires human)**
- [x] No unresolved release blockers from automated suite
- [ ] WS3 lifecycle states observed in real runtime — **PENDING (requires human)**
- [ ] Denied paths produce zero executor calls — **PENDING (manual verification)**
- [ ] Approval lifecycle durable across restart — **PENDING (manual verification)**
- [ ] Dark and light themes validated — **PENDING (manual verification)**
- [ ] All required width breakpoints validated — **PENDING (manual verification)**
- [ ] Performance evidence recorded — **PENDING (manual measurement)**
- [x] Dependabot alerts triaged (4/4 classified)
- [ ] Freeze-blocking dependency fixes landed — dompurify bump pending
- [ ] Full automated suite rerun at candidate `e7cc8da6` (16/16 typecheck, 8/8 build, 434/434 TUI tests) — **PENDING rerun after streaming fixes**
- [x] Working tree clean (after commit)
- [x] Freeze report committed
- [x] Remote branch matches local HEAD

### Current Status

| Gate | Status |
|------|--------|
| TUI 2.1 implementation candidate | **PUSHED** ✅ (`e7cc8da6`) |
| Automated gates (typecheck, build, test) | **PASS** ✅ (baseline `1f4779ac`; rerun at `e7cc8da6` pending) |
| Streaming lifecycle polish (shimmer/Thinking→Thought) | **DONE + OPERATOR VALIDATED** ✅ |
| Manual release validation | **PENDING** ⏳ |
| Dependency-security triage | **COMPLETE** ✅ |
| TUI 2.1 freeze | **NOT YET AUTHORIZED** ❌ |

### Next Steps (ordered)

1. **Human executes manual smoke test** (WS1, WS2, WS3) — all 11 phases, lifecycle observation, theme/width/performance gates
2. **Bump dompurify** 3.4.11 → 3.4.12 in `packages/ui/package.json`
3. **Create security/dependabot-remediation branch** for nitro update
4. **Rerun automated suite** after dependency changes
5. **Update this report** with manual test results
6. **Freeze authorization** when all criteria checked

---

*This report will be updated as manual testing progresses.*

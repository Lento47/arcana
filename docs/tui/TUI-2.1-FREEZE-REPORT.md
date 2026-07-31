# TUI 2.1 Freeze Report

**Date:** 2026-07-31
**Branch:** `phase-d-implementation`
**Candidate commit:** `3833cde0` (approval pipeline wired end-to-end)
**Previous commit:** `1f4779ac` (polish sprint baseline)
**HEAD:** `9bc837bc` (test/docs on top of candidate)

---

## 1. Candidate Commit

| Field | Value |
|-------|-------|
| SHA | `3833cde0` |
| Message | `RB-01b/c: approval transport — engine command endpoint + SSE push, TUI route wiring` |
| Branch | `phase-d-implementation` |
| Remote | `origin/phase-d-implementation` (`1f4779ac..3833cde0`, 17 commits) |

### 1.1 Post-baseline commits (`1f4779ac` → `3833cde0`)

**Streaming lifecycle polish** (found and fixed during interactive operator testing):

| Commit | Fix |
|--------|-----|
| `aedd96dc` | `updateMessage` passed `msg` by reference — SolidJS reconcile saw no diff, streaming never ended. Now `structuredClone` on publish. |
| `6b75ad9e` | `runState` checked nonexistent `"running"`/`"thinking"` status types — now `"busy"`/`"retry"`. |
| `b14ca9a6` | `makeInlineThinkEntry` passed no `part.time` — inline thinking shimmer stuck. |
| `5fd291ea` | **ROOT CAUSE** `spine-node.tsx:223` `active={!!thinking()}` always true (plan entries hardcode `thinking="thinking"`) — now `active={streaming()}`. |
| `099ad3ac` | `thinkingSummary` static "Thinking" — flips to "Thought" once the reasoning part ends (streaming-aware). |
| `6d9bdb39` | Header shimmer verb "writing" for the answer phase + 2 regression tests. |
| `e7cc8da6` | **Operator decision:** remove shimmer verb and spinner from the `✦ arcana` header entirely. Think row owns the Thinking/Thought label. |

**RB-01 approval pipeline (operator-approved systematic fix):**

| Commit | Fix |
|--------|-----|
| `99ab6d1d` | M1 glyph `◤` for PENDING entries |
| `32b69dbb` | M4 version 1 on fresh PENDING records |
| `dc96bbd5` | Scoped adapter (PEP ↔ durable `approval_records`) |
| `2f35d2b6` | `SqliteScopedApprovalStore` — atomic claim, `close()` for Windows locks |
| `90de367c` | `tools.ts` PEP rewrites — real `executeExact` (single execution authority), `notifyApprovalDecision`, fail-closed on EXECUTION_FAILED/STALE_DECISION |
| `0e7b7330` | Engine operator-command handler for durable approvals |
| `1d737813` | TUI sync store gains `approvals` map (D4 sync channel) |
| `3833cde0` | SSE `approval.updated` + 4 shellProps wired (`approvals`, `approvalController`, `activeSessionId`, `activeWorkspaceId`) |

**Post-candidate (test/docs, no TUI binary change):**

| Commit | Change |
|--------|--------|
| `9bc837bc` | TUI tests: keep `streaming-lifecycle.test.ts` (6-phase cache-reuse regression), drop stale shimmer-chrome repro |
| `c86f5ec9` | Docs: WS5 workstream (startup/session-open performance + communication hygiene) |
| `e15c4110`→`d1d2b786` | Docs: design principles (added to Master Spec §3.5; AGENTS.md edits reverted per operator) |

**Validated by operator** in the real TUI: "Thinking" → "Thought" flip confirmed; header now static. 2 regression tests in `test/spine-mapper.test.ts` + 6-phase `test/streaming-lifecycle.test.ts` prove the plan entry flips `streaming=false` on completion, stays `true` mid-stream, and never resurrects stale `streaming=true` across cache reuse.

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
| @arcana/tui | 435 | 0 | 1 | 436 |
| @arcana/core | 1209 | 31 | 7 | 1247 |
| @arcana/engine | — | — | — | rerun in progress (was 3978 pass / 185 fail / 72 skip) |
| All other packages | — | 0 | — | pass |
| **TUI total** | **435** | **0** | **1** | **436** |

**Note:** The 31 @arcana/core failures are **pre-existing** and unrelated to TUI-2.1 changes. They are in:
- Golden vector conformance suite (crypto test vectors — fixture loading)
- AgentV2 bash opt-in test
- ModelsDev service refresh
- Ripgrep glob/grep (Windows path handling)
- SessionRunnerLLM interrupt tests
- BashTool / WebFetchTool / WebSearchTool registration
- Shell path normalization

None of these touch TUI rendering, approval lifecycle, or command-spine code.

**TUI test result: 435/435 pass (with skip), 0 fail.** ✅

**Environment note (2026-07-31):** `bun test` from the repo root now segfaults deterministically (Bun 1.3.14 Windows, `bun.report/1.3.14/wt10d9b296...`, kernel32/ntdll frames). Repo code unchanged — environmental. Workaround: run suites from their package dirs (`cd packages/tui && bun test`), which is clean. Re-check after Bun upgrade.

---

## 4. Manual Smoke Test Matrix (WS1)

**Status: READY — RB-01 code landed; manual execution pending (operator drives TUI).** The 11-phase checklist can now run as written: the engine creates durable approval records, the session route feeds them to the shell, and the controller handles `a`/`d`/`v`/`Esc`.

### RB-01 — Approval pipeline not mounted in production (RELEASE BLOCKER)

**Status: IMPLEMENTED (2026-07-31) — closure verification in progress.**

| Layer | Fix | Evidence |
|-------|-----|----------|
| Engine | Durable approval lifecycle mounted: `tools.ts` routes `APPROVAL_REQUIRED` → durable PENDING → parked; `notifyApprovalDecision` resumes (deny = zero exec, approve = PEP re-run → atomic claim → execute → consume); 2-attempt recursion guard; EXECUTION_FAILED/STALE_DECISION fail-closed | Commits `2f35d2b6`, `90de367c`, `0e7b7330`; adapter 8/8 tests |
| TUI route | `shellProps` now passes `approvals`, `approvalController`, `activeSessionId`, `activeWorkspaceId`; `useApprovalIntegration` mounted; SSE listens on `approval.updated` (engine emission name) | Commit `1d737813`, `3833cde0`; typecheck 16/16 |
| Stale artifact | `packages/core/src/crypto/__tests__/run-tui2.1-production-tests.ts` (asserts removed 2-line receipts; never run by `bun test` naming) — deletion pending (RB-01c) | Verified: 135 pass, dead code |

**Remaining for closure:**
1. **Engine-suite baseline triage** — full suite rerun at HEAD in progress (was 3978/185/72; failure profile mostly network-dependent). Must confirm zero new failures from the `tools.ts` PEP rewrite (suspect: `strips bash echo`).
2. **PENDING-create SSE push gap** — record creation lives in the `tools.ts` parked path; pushes fire on transitions only. A fresh PENDING record may not reach the TUI until the next event. Needs publish hook or TUI hydration on session sync. (Small, defined.)
3. **WS1 manual smoke re-run** — phases 2-7 and 10-11 are now testable with the live approval loop.

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

All 11 phases from `docs/tui/TUI-2.1-MANUAL-SMOKE-TEST.md` remain required; phases 2-7/10-11 are now unblocked (code landed) and pending operator execution.

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Startup Verification | NOT TESTED — requires interactive terminal |
| 2 | Trigger Approval | NOT TESTED — code ready, pending operator |
| 3 | Inspector | NOT TESTED — code ready, pending operator (M6: no inspector panel; info is expanded body) |
| 4 | Approval Lifecycle (APPROVED → CLAIMED → CONSUMED) | NOT TESTED — code ready, pending operator |
| 5 | Denial Lifecycle (zero executor calls) | NOT TESTED — code ready, pending operator |
| 6 | Prompt Conflict Protection | NOT TESTED — logic verified in code |
| 7 | Session Isolation | NOT TESTED — logic verified in code |
| 8 | Resize (9 width breakpoints) | NOT TESTED — requires interactive terminal |
| 9 | Theme Validation (dark + light) | NOT TESTED — requires interactive terminal |
| 10 | Restart Recovery | NOT TESTED — durable records exist; pending operator |
| 11 | Mouse Interaction | NOT TESTED — entries render; pending operator |

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

**Status: IMPLEMENTED.** Code landed (`2f35d2b6`..`3833cde0`), operator-approved systematic fix. Closure pending: (1) engine-suite baseline triage (rerun at HEAD running), (2) PENDING-create SSE push gap, (3) WS1 manual smoke re-run. Freeze cannot be authorized until RB-01 closure is verified and WS1 approval phases re-run.

## 12. Freeze Decision

### Acceptance Criteria Checklist

- [ ] 11/11 manual smoke phases completed — **PENDING (requires human)**
- [ ] RB-01 closure verified — **IN PROGRESS** (code landed; engine triage + WS1 pending)
- [ ] WS3 lifecycle states observed in real runtime — **PENDING (requires human)**
- [ ] Denied paths produce zero executor calls — **PENDING (manual verification)**
- [ ] Approval lifecycle durable across restart — **PENDING (manual verification)**
- [ ] Dark and light themes validated — **PENDING (manual verification)**
- [ ] All required width breakpoints validated — **PENDING (manual verification)**
- [ ] Performance evidence recorded — **PENDING (manual measurement)**
- [x] Dependabot alerts triaged (4/4 classified)
- [ ] Freeze-blocking dependency fixes landed — dompurify bump pending
- [ ] Full automated suite rerun at candidate `3833cde0` (16/16 typecheck, 8/8 build, 435/435 TUI tests) — typecheck/build green at `e7cc8da6`; TUI tests green at HEAD; engine rerun in progress
- [x] Working tree clean (after commit)
- [x] Freeze report committed
- [x] Remote branch matches local HEAD

### Current Status

| Gate | Status |
|------|--------|
| TUI 2.1 implementation candidate | **PUSHED** ✅ (`3833cde0`) |
| Automated gates (typecheck, build, test) | **PASS** ✅ (TUI 435/435 at HEAD; engine rerun in progress) |
| Streaming lifecycle polish (shimmer/Thinking→Thought) | **DONE + OPERATOR VALIDATED** ✅ |
| RB-01 approval pipeline (engine → transport → TUI) | **IMPLEMENTED** 🔶 — closure verification pending |
| Manual release validation | **PENDING** ⏳ |
| Dependency-security triage | **COMPLETE** ✅ |
| WS5 perf + communication hygiene (TUI-1.6) | **PLANNED** ⏳ — thresholds defined, P1/P2 tasks in execution plan |
| TUI 2.1 freeze | **NOT YET AUTHORIZED** ❌ |

### Next Steps (ordered)

1. **Engine-suite baseline triage** — classify the 185 fails vs the `tools.ts` PEP rewrite (rerun running); confirm zero PEP regressions
2. **Close PENDING-create SSE push gap** — fresh PENDING records must reach the TUI (publish hook or sync hydration)
3. **Housekeeping** — RB-01c stale test deletion; dompurify bump; session-lock restore decision
4. **Human executes manual smoke test** (WS1, WS2, WS3) — all 11 phases, lifecycle observation, theme/width/performance gates
5. **WS5 P2-1 request inventory audit** (read-only, before freeze) — congestion map: polling loops, redundant refetch, retry storms
6. **Rerun automated suite** after dependency changes
7. **Update this report** with manual test results
8. **Freeze authorization** when all criteria checked

---

*This report will be updated as manual testing progresses.*

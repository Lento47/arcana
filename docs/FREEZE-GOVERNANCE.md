# Freeze Governance — required protections for `phase-d-implementation`

**Document class:** branch-protection request (release governance)
**Authority:** release management; supersedes no ADR
**Date:** 2026-08-06

This file is the requested protection list for the release branch
`phase-d-implementation`. It is written to be applied as GitHub branch
protection rules (or equivalent in the hosting platform) before any
freeze/release tag is cut from the branch. The rules below exist to make the
audit's "exact-head evidence before tagging" requirement mechanical rather
than procedural.

## 1. Required protections (all of them)

| # | Protection | Setting | Why |
|---|---|---|---|
| 1 | Require pull requests before merging | Enabled; require at least 1 approving review (2 for code paths in §2) | No direct pushes to the release branch. |
| 2 | Require review from Code Owners | Enabled; code owners for the paths in §2 must approve | Contracts, PEP, approval lifecycle, and migrations are authority-adjacent. |
| 3 | Dismiss stale reviews when new commits are pushed | Enabled | A decision made against an older commit must not gate a newer one. |
| 4 | Require conversation resolution | Enabled | No unresolved review threads on a merge. |
| 5 | Require branches to be up to date before merging (strict status checks) | Enabled (current branch) | The merge target must include the latest base before the merge completes. |
| 6 | Required status checks (merge gate) | `CI` (static analysis + full test), `Contract guards`, `Status authority`, `freeze-evidence` (typecheck ×4 + full engine tests + CURRENT-STATE reconciliation), `Build and release gates`, `Enterprise build`, `Security Audit` | The vertical slice must be green at the exact merge commit. |
| 7 | Do not allow bypassing the above settings | Enabled (restrict to admins unless a documented exception exists) | Protection is not optional for freeze/release work. |
| 8 | No force push | Disallowed (`allow_force_pushes: false`) | History on the release branch must stay immutable after review. |
| 9 | No deletion | Disallowed (`allow_deletions: false`) | The release branch must never disappear. |
| 10 | Signed commits required for freeze/release tags | Require signed commits (GPG/SSH) on tag creation; tag `v*` pushes must carry a verified signature | Immutable tags must be attributable. |
| 11 | Exact-head evidence before tagging | The tag commit must be covered by a committed `docs/FREEZE-EVIDENCE-*.md` whose evaluated commit equals the tag target, and the `Status authority` check (implementation checkpoint == branch HEAD) must pass at that commit | "One complete journey at one exact commit, with real numbers" is the freeze precondition. |
| 12 | No `[bump]`-gated release commits on the release branch without review | Release workflow triggers require a passing `Release` gate and the §1-6 checks | Version bumps on the release branch are still code changes. |

## 2. Code-owner approval paths (review requirement, not veto)

Changes touching any of the following must be approved by the owning code
owners in addition to the general review:

- `contracts/**` — runtime/approval/events contract artifacts
- `packages/engine/src/approval/**` — approval command surface, routing, affordances
- `packages/engine/src/server/routes/instance/httpapi/**` — mounted runtime API
- `packages/core/src/crypto/approval-*` and `capability/**` — approval lifecycle,
  PDP/PEP, request hashing, grant store
- `packages/core/src/effect/`, `packages/effect-*/**` — persistence bridge and migrations
- `packages/core/src/database/**`, `packages/core/src/epistemic/**` — schema and migrations

## 3. What this does not authorize

- This file does **not** authorize a freeze. Freeze still requires the
  acceptance evidence in `docs/FREEZE-RELEASE.md` Gates 1–9 and explicit human
  sign-off.
- This file does **not** change the authority model; it only constrains how
  release-branch changes land.

## 4. Applying the protections

Apply via repository settings (or `gh api` with the repo admin token):

```bash
# Branch protection for phase-d-implementation (GitHub CLI example)
gh api --method PUT repos/{owner}/{repo}/branches/phase-d-implementation/protection \
  --input branch-protection-phase-d.json
```

The status checks listed in §1.6 must exist before the rule can be saved;
`freeze-evidence` is provided by `.github/workflows/freeze-evidence.yml`.

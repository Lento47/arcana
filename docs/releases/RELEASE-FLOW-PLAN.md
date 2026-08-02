# Release Flow Plan — Installer, Signed Artifacts, Mainline Promotion

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

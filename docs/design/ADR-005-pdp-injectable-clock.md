# ADR-005: PDP Injectable Clock

**Status:** Accepted · 2026-08-25
**Scope:** Authority Kernel — PEP/PDP time handling
**Supersedes:** none

## Context

Replay (Phase B) and the K3a determinism guarantees require that an
authorization decision be a **pure function of its captured inputs**: the same
immutable request evaluated against the same policy snapshot must yield the
same decision, byte for byte. Any hidden read of wall-clock time inside the
evaluation path silently breaks that contract — a replayed decision would
depend on *when* it was re-evaluated rather than on what was originally
decided.

An earlier review flagged "PDP stamps wall-clock internally via Date.now()"
as a suspected replay hazard.

## Decision

1. **Time enters the PDP exclusively through `PolicyContext.now`**
   (`packages/core/src/capability/pdp.ts` — `evaluate(request, context)`).
   The PDP performs no clock reads of its own.
2. **Time enters requests through explicit, capturable fields.**
   `buildAuthorizationRequest` stamps `requestedAt` from the caller-supplied
   `ctx.requestedAt` and only falls back to `new Date().toISOString()` when
   the caller omits it. Replays supply the ORIGINAL `nonce`, `requestedAt`,
   and `requestId` (P3 captured nondeterminism), so a re-driven request hashes
   identically to the recorded one.
3. **Wall-clock at request-build time is a default, not a decision input.**
   The gates (fs/network/process/secret) stamp `Date.now()` when constructing
   fresh request defaults. This is capture-time behavior: once the request is
   built, its timestamps are frozen into its identity hash.
4. **Execution-side effects stamp real time at effect time** (e.g.
   capability-use claims in `pep.ts`). These are observations of work that
   actually happened; they are recorded as events, not consumed as decision
   inputs.

### Rule going forward

> No new `Date.now()` / `new Date()` calls are permitted inside PDP evaluation
> or any code path whose output feeds a decision. Time flows inward:
> caller → request / PolicyContext → evaluation.

## Evidence

- `pdp.ts` contains zero `Date.now()` references; all temporal parameters are
  function inputs (`now: string` at the context, evaluation, and receipt
  layers).
- `pep-integration.ts`: `requestedAt: ctx.requestedAt ?? new Date().toISOString()`
  — injection point exists and is honored.
- Enforcement test: `packages/core/src/capability/pdp-clock.test.ts`
  - same request + same context ⇒ byte-identical decisions;
  - differing `context.now` ⇒ identical outcomes modulo the stamped timestamp;
  - evaluation never mutates the request (hash stable across evaluation);
  - replayed `requestedAt` survives request construction verbatim.

## Consequences

- Replay tests can evaluate production-shaped requests against arbitrary
  clocks (expiry boundaries, approval windows) without monkey-patching global
  time.
- Reviewers must reject PRs that introduce clock reads below the
  request-build boundary; the ADR-005 test suite pins the existing surface,
  and new surfaces should extend those tests.

## References

- `docs/architecture/authority/AUTHORITY-KERNEL.md` (frozen contract)
- Phase B verification & replay documentation

# Arcana Security Checklist

Developer-facing security checklist for the governed autonomy runtime (BLK-E-08).
Every item maps to a real enforcement point in this repository. Run through the
checklist when you are building an app, an adapter, or a policy on top of Arcana —
or when reviewing a change that touches authorization, approvals, file access, or
network exposure.

Core invariant: **¬Authorized(q) ⇒ ¬Executed(q)** — nothing executes that was not
authorized, and an approval alone never executes anything.

---

## 1. Server surface & authentication

- [ ] The server binds to loopback only unless a password is set.
      `arcana serve` defaults to `127.0.0.1`; binding a non-loopback address without
      `ARCANA_SERVER_PASSWORD` is refused (ARC-SEC-I08).
      Source: `packages/engine/src/cli/cmd/serve.ts`.
- [ ] Remote connections require Basic auth. Username defaults to `arcana`
      (`ARCANA_SERVER_USERNAME`); the password comes from `ARCANA_SERVER_PASSWORD`.
      Source: `packages/engine/src/server/auth.ts`.
- [ ] Never put `ARCANA_SERVER_PASSWORD` in a config file or commit it. Use the env var.
- [ ] SDK clients used from another machine point at `https://` (TLS) and send the
      password through the client credentials, not the URL.

## 2. Authorization decisioning (PDP / PEP)

- [ ] The policy decision point (PDP) is deterministic and pure over an immutable
      snapshot: `phaseC_pdp`. Source: `packages/core/src/crypto/distributed-pep.ts`.
- [ ] The policy enforcement point (PEP) rechecks on a fresh context and rejects stale
      decisions: `phaseC_pep`. Source: `packages/core/src/crypto/distributed-pep.ts`.
- [ ] Workspace containment is enforced separately from policy: `verifyWorkspaceContainment`.
      Source: `packages/core/src/crypto/distributed-pep.ts`.
- [ ] Governed execution goes through `GovernedApprovalExecutor`, never a raw effect
      dispatch. Source: `packages/core/src/crypto/governed-executor.ts`.

## 3. Approvals (durable, exact, single-use)

- [ ] An approval decision does NOT execute the action. Execution requires a fresh
      PDP/PEP recheck, an atomic claim with `executionId`, at-most-once idempotency,
      and consumption. **Button-to-effect paths = 0.**
      Source: `packages/core/src/crypto/approval-lifecycle.ts` (header invariant),
      `packages/core/src/crypto/execution-ledger.ts`.
- [ ] Approval commands carry the exact request the operator saw:
      `expectedVersion`, `expectedRequestHash`, `expectedContractRevision`. Mismatches
      return `success:false` with `stale:true` and nothing is executed.
      Source: `packages/engine/src/server/routes/instance/httpapi/groups/approval.ts`,
      `groups/runtime.ts`.
- [ ] Operator identity is derived from the authenticated server context — never from
      a client-supplied field: `AuthenticatedOperator`.
      Source: `packages/core/src/crypto/approval-lifecycle.ts`,
      `groups/runtime.ts` (header comment).
- [ ] Approvals are single-use and expire. States include
      `PENDING → APPROVED → CLAIMED → CONSUMED`, with `DENIED / EXPIRED / INVALIDATED`
      fail-closed paths. Source: `packages/core/src/crypto/approval-lifecycle.ts`.
- [ ] The wire schema adds `REJECTED` and `RECOVERY_REQUIRED` states; treat any
      non-`CONSUMED` end state as "effect not authorized".
      Source: `packages/engine/src/approval/events.ts`.

## 4. Signed envelopes (capabilities & policies)

- [ ] Envelopes are verified in layers, each independently checkable:
      PARSE → SCHEMA → SIGNATURE → TRUST → AUDIENCE → FRESHNESS → REVOCATION.
      A failure at any layer fails closed. Source: `packages/core/src/crypto/verifier.ts`.
- [ ] JSON parsing rejects duplicate keys and unknown mandatory fields
      (`parseStrictEnvelope`). Source: `packages/core/src/crypto/verifier.ts`.
- [ ] Signature input is canonical and stable across encoders (`canonicalize`,
      `buildSignatureInput`). Source: `packages/core/src/crypto/canonical-serializer.ts`.
- [ ] Timestamps are strict UTC RFC 3339 with milliseconds; future-dated envelopes
      (clock skew > 5 minutes) and expired envelopes are rejected.
      Source: `packages/core/src/crypto/verifier.ts`.
- [ ] Domain constants are the source of truth for envelope kinds
      (`arcana:signed-capability:v1`, `arcana:signed-policy:v1`, node identity,
      revocation). Source: `packages/core/src/crypto/signed-envelopes.ts`.
- [ ] SDK users should use `verifySignedEnvelope` (which wraps strict parse + layered
      verify against a 32-byte Ed25519 public key) rather than hand-rolling checks.
      Source: `packages/sdk/js/src/v2/governance.ts`.

## 5. File access containment

- [ ] File reads are bounded and confined to the workspace root:
      `SafeBoundedFileReader.read({ workspaceRoot, requestedPath, maximumBytes })`.
      Symlinks are resolved before the open; the final file handle is re-checked
      against the root (handle-relative containment).
      Source: `packages/core/src/crypto/bounded-file-reader.ts`.
- [ ] Read failures are stage-typed (`PATH_VALIDATION | RESOLUTION | OPEN | STAT |
      READ | CONTAINMENT | IDENTITY`) so a refusal always reports *why*.
      Source: `packages/core/src/crypto/bounded-file-reader.ts`.
- [ ] The engine adapter surfaces failures as a tagged `BoundedFileReadRejected` error,
      and the read tool caps at `MAX_FILE_READ_BYTES = 64 MB`.
      Source: `packages/engine/src/util/bounded-file-read.ts`,
      `packages/engine/src/tool/read.ts`.
- [ ] Configure read/execute tooling through permissions, not by widening the file
      cap. Permission keys are declared in `packages/core/src/v1/config/permission.ts`
      (`ask | allow | deny` for `read, edit, glob, grep, list, bash, task, ...`).

## 6. Configuration & least privilege

- [ ] Effective config is a validated `Info` schema; env vars override file values.
      Inspect what is actually applied before trusting behavior:
      `arcana config show [--key <section>]`.
      Source: `packages/core/src/v1/config/config.ts`,
      `packages/engine/src/cli/cmd/config.ts`.
- [ ] Grant agents only the permissions they need. `arcana agent create --permissions
      "read,glob,grep"` is a smaller blast radius than the default-all set.
      Source: `packages/engine/src/cli/cmd/agent.ts`.
- [ ] Default to `ask` (interactive approval) for write/execute actions in
      untrusted workspaces; escalate to `allow` only for trusted roots.

## 7. Proofs & audit

- [ ] Proof exports are verifiable offline: `verifyRunProofExport` checks schema
      version, lifecycle, event ordering, and the embedded fingerprint
      (`proofFingerprint`). A tampered event fails verification.
      Source: `packages/sdk/js/src/v2/proof.ts`.
- [ ] CLI verification path: `arcana epistemic proof verify <session-id>` /
      `arcana epistemic proof export <session-id> --format json`.
      Source: `packages/engine/src/cli/cmd/proof.ts`, `cmd/epistemic.ts`.
- [ ] When a HIGH/CRITICAL decision has no provenance (UNKNOWN lineage), treat it as
      denied. Provenance labels and sensitivity are part of every authorization
      request. Source: `packages/core/src/capability/types.ts`.

---

## How to verify a checklist item

Each item above names the exact source file. To verify an enforcement point:

1. Read the named source and confirm the behavior matches the checklist claim.
2. Run the suite that covers it — e.g.
   `bun test packages/core/src/crypto/` (verifier, bounded-file-reader, approval
   lifecycle) and `bun test packages/engine` (httpapi exercise, file tool).
3. For runtime behavior, exercise the path end-to-end with `arcana run` / `arcana
   serve` and confirm denied, stale, expired, revoked, and unauthorized requests
   execute zero protected effects (negative-path testing is the standard here).

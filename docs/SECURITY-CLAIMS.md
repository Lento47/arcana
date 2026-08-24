# Arcana Security Claims and Non-Claims

**Status:** Proposed normative security contract for the governance line.

Arcana is an execution-governance system for autonomous agents. Its security value is not that an LLM is trusted to behave safely. Arcana instead places deterministic authorization and evidence controls around consequential effects.

This document defines the claims Arcana may make, the assumptions required for those claims, and the claims Arcana must not make.

## 1. Primary invariant

For a declared protected effect boundary `q`, Arcana's target invariant is:

```text
¬Authorized(q) ⇒ ¬Executed(q)
```

This invariant is valid only for deployment profiles in which **mandatory mediation** is established: every path from the agent/workload to the protected resource is forced through an Arcana enforcement point, or the protected resource independently validates an Arcana-issued authority artifact.

An in-process SDK hook alone is not sufficient evidence of mandatory mediation if the same process retains direct credentials, alternate network paths, an unmediated adapter, or another effect primitive that can reach the protected resource.

## 2. Security property matrix

Arcana decomposes "verifiable execution" into independently testable properties.

| Property | Required statement | Minimum evidence |
| --- | --- | --- |
| Decision authenticity | the authorization decision came from an authorized PDP | verifiable decision signature or authenticated decision channel bound to the evaluated request |
| Exact request binding | the decision authorizes the exact security-relevant request that is executed | canonical request hash covering principal, action, resource, consequential arguments, and relevant context |
| Policy binding | the decision identifies the exact policy semantics used | policy version plus immutable policy/bundle digest where supported |
| Freshness | stale authority is rejected at the PEP | validity interval/epoch checks at execution time |
| Replay resistance | authority cannot be illicitly reused beyond declared semantics | capability/approval identity, nonce/use accounting, durable execution receipt state |
| Delegation monotonicity | a child cannot acquire authority the parent could not delegate | bounded delegation chain and attenuation checks |
| Mandatory mediation | a protected effect cannot occur through a bypass route | credential custody, resource-side validation, network/IAM isolation, or equivalent deployment evidence |
| Execution evidence | the effect boundary records whether execution started/completed/failed | request-bound execution receipt and trace event |
| Evidence integrity | mutation, insertion, or reordering inside the declared evidence model is detectable | hash-linked evidence plus signed checkpoints where enabled |
| Recovery safety | crash/restart does not resurrect stale or consumed authority | durable claim/receipt state and restart tests |
| Independent verification | exported evidence can be checked without trusting the live Arcana service | documented verifier semantics, frozen vectors, portable evidence package |

## 3. Trust boundaries

Arcana distinguishes these actors. Implementations may map them to existing types, but the security model must not collapse their meanings.

- **Accountable owner** — person/team organizationally responsible for an agent.
- **Acting principal** — human or service on whose behalf a task originates.
- **Logical agent** — stable agent definition/service identity.
- **Workload instance** — the concrete running software instance making a request.
- **Session** — one execution context.
- **Tool/resource instance** — the specific effect endpoint.
- **PDP** — decides whether the request is authorized.
- **PEP** — prevents execution unless the required authority is valid.
- **Evidence verifier** — checks security properties from exported evidence.

Existing K2 instance/tool binding, capability delegation, approval lifecycle, request hashing, execution receipts, and RunProof evidence are inputs to this model rather than parallel mechanisms.

## 4. Mandatory-mediation profiles

Arcana must report which deployment profile applies to each consequential effect.

### Profile A — cooperative instrumentation

The agent calls an Arcana SDK/tool wrapper, but the process may possess alternate credentials or direct resource connectivity.

**Allowed claim:** Arcana authorized and observed the enclosed execution path.

**Forbidden claim:** no unauthorized execution was possible.

### Profile B — mediated credential custody

The Arcana PEP/gateway owns the privileged credential or the resource accepts only identities available to the PEP. The agent cannot directly reach the protected operation under the declared network/IAM profile.

**Allowed claim:** for the declared protected resource and deployment assumptions, an execution required successful PEP authorization.

### Profile C — resource-side authority verification

The resource itself, or an independently controlled proxy immediately in front of it, validates the request-bound authority artifact.

**Allowed claim:** strongest mandatory-mediation claim supported by the Arcana proof model, subject to verifier and resource trust assumptions.

The UI, API, proof export, and L4 assessment should expose the profile rather than representing all "governed" actions as equivalent.

## 5. Fail-closed behavior

HIGH and CRITICAL effects must never silently downgrade from deterministic authorization to model judgment when authorization dependencies fail.

A degraded state must be explicit and machine-readable. If an effect is allowed during a control-plane outage, the policy must explicitly define that availability behavior; it is not an implicit fallback.

## 6. Identity and delegation rules

For HIGH/CRITICAL requests, evidence should bind as many of these identifiers as the deployment can establish:

```text
owner
acting principal
logical agent
workload instance
session
parent workload/session (when delegated)
tool/resource instance
```

`onBehalfOf` is not equivalent to workload identity, and workload identity is not equivalent to ownership.

Delegation must attenuate authority. A delegated child may receive a strict subset of the parent's delegable authority and may never increase maximum risk, resource scope, duration, use count, or delegation depth without a fresh higher-authority decision.

## 7. Capability semantics

A high-assurance capability should bind, directly or through the request hash:

```text
issuer
subject/workload
acting-on-behalf-of principal
tenant/workspace
tool
action
resource
canonical consequential-argument digest
policy decision/bundle identity
approval chain identity (if any)
issued-at / not-before / expiry
capability id / nonce
revocation epoch or equivalent
bounded delegation constraints
```

Broad capabilities such as `tool=transfer_money` are intentionally weaker than request-bound capabilities such as `transfer_money(source=A,destination=B,amount=417.25,currency=USD)`.

## 8. Evidence integrity claim

A hash chain or signed checkpoint can establish that enclosed history was modified after a trusted checkpoint. It does **not**, by itself, prove completeness of events that were never submitted to the evidence system.

Therefore Arcana must distinguish:

- **integrity:** enclosed evidence has not been mutated under the declared verification model;
- **continuity:** the expected sequence has no detectable internal gap;
- **coverage:** all protected effects were actually mediated/recorded under the deployment profile.

Coverage is a deployment/enforcement property, not a cryptographic-log property.

## 9. Verification replay vs behavioral replay

Arcana may make deterministic guarantees about **verification replay**: re-evaluating archived authorization inputs, hashes, signatures, capabilities, receipts, and evidence continuity.

Arcana must not imply deterministic **behavioral replay** of an LLM workflow when provider/model state, external APIs, retrieved content, wall-clock time, or nondeterministic inference are unavailable or changed.

Recommended verifier outcomes:

```text
VERIFIED    all required security properties validated
FAILED      at least one required property is false
INCOMPLETE  evidence is insufficient to establish the requested claim
```

`INCOMPLETE` must never be rendered as success.

## 10. Explicit non-claims

Arcana does not claim that:

- a governed agent is generally "safe";
- prompt injection is solved;
- an ALLOW decision proves that the action is semantically beneficial;
- an Arcana-authored test report is an independent certification;
- a valid proof establishes that no bypass path existed unless mandatory mediation was separately established;
- hash-linked logs prove that omitted events never occurred;
- replaying authorization evidence reproduces the original LLM's full behavior;
- L3 or L4 assurance exists until the required external evidence has actually been completed and verified.

## 11. Release and assurance gate

Security-relevant releases should map implementation evidence to these claims.

- **L1:** official implementation passes its own normative suites.
- **L2:** independent-runtime conformance verifies implementation-neutral semantics and vectors.
- **L3:** an external organization reproduces the required security/conformance evidence on the immutable candidate. Running an Arcana-owned test suite is evidence of reproduction; it is not by itself proof that the public protocol specification is independently implementable.
- **L4:** an independent assessor attacks the protocol, implementation, release path, deployment assumptions, and mandatory-mediation claim, then retests remediation.

Until L3/L4 evidence exists, product surfaces must continue to show those levels as `not assessed`.

## 12. Product metric that matters

The governance console should prioritize **mediation coverage**, not raw "agents monitored" count.

A useful top-level measure is:

```text
mediated consequential effects / discovered consequential effect paths
```

with separate counts for:

- deterministic enforcement;
- cooperative/instrumented-only paths;
- known bypass paths;
- unmediated effects;
- incomplete evidence.

This metric connects the product UI to Arcana's actual security claim.

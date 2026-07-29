# Risks and Non-Goals

## Why this document exists

Arcana's future direction has large upside, but the execution-platform and protocol strategies also create unusually high architectural, security, and adoption risk.

This document identifies what Arcana must resist while expanding.

## Strategic risks

### 1. Becoming a protocol before becoming useful

A specification without proven implementation pressure tends to encode assumptions rather than interoperability.

Mitigation:

- prove each abstraction in the Arcana runtime
- collect design-partner feedback
- require independent implementation before claiming protocol maturity
- standardize only semantics required for exchange

### 2. Governance becoming friction

Users will bypass controls that interrupt ordinary work too often or provide low-value prompts.

Mitigation:

- risk-adaptive controls
- scoped approvals
- policy simulation and observe modes
- clear reason codes
- low-latency PDP evaluation
- approval-burden metrics

### 3. False assurance

A signed RunProof can still document a flawed execution. Verification may be incomplete, colluding, or poorly scoped.

Mitigation:

- distinguish integrity, authorization, verification, and correctness
- record limitations
- expose verifier trust and independence
- support challenge and contradiction records

### 4. Hidden enforcement bypasses

One unmediated shell, filesystem, MCP, network, plugin, or provider path can undermine the entire governance model.

Mitigation:

- maintain a side-effect boundary inventory
- test PEP coverage continuously
- fail closed
- isolate plugins and capabilities
- run adversarial boundary and delegation tests

### 5. Protocol complexity

If the protocol tries to represent every workflow, policy language, identity system, storage backend, and proof technology, it will become unusable.

Mitigation:

- small mandatory core
- optional profiles
- references instead of embedded payloads
- stable invariants with implementation freedom

### 6. Event and evidence explosion

Long runs can generate huge logs, artifacts, model outputs, and repeated evidence.

Mitigation:

- content addressing
- deduplication
- tiered retention
- summaries as derived views
- selective disclosure
- streaming proof projections

### 7. Privacy conflict

Portable evidence may expose source code, credentials, personal data, internal reasoning, or business-sensitive activity.

Mitigation:

- encryption
- redaction commitments
- access-controlled artifact references
- configurable evidence policies
- secret-safe capture by default

### 8. Vendor imitation

Large agent vendors can add approvals, policies, and audit logs.

Mitigation:

- remain provider-neutral
- prioritize portable proofs and independent validation
- build integrations across competitors
- establish conformance and ecosystem effects
- focus on execution history and cross-runtime interoperability

### 9. Weak verifier independence

Using another prompt from the same model family may create the appearance of independent verification without meaningful independence.

Mitigation:

- deterministic verifiers first
- identify model and provider lineage
- support cross-model and human verification
- report verifier independence explicitly

### 10. Self-improvement poisoning

Learning from past runs can reinforce accidental success, insecure workarounds, outdated facts, or manipulated evidence.

Mitigation:

- outcome labels
- provenance and freshness
- verified-learning thresholds
- negative evidence
- memory revocation and contradiction

## Security risks

- capability forgery or substitution
- resource-normalization ambiguity
- approval replay
- request hash mismatch
- confused-deputy delegation
- policy downgrade
- compromised capability package
- evidence tampering
- signature-key compromise
- sandbox escape
- secret exfiltration through model or tool output
- external side effects with uncertain completion
- malicious context influencing policy-relevant fields

Each protocol and SDK release should include a threat model and negative conformance tests for applicable risks.

## Product risks

- building enterprise control surfaces before local developer value
- allowing the TUI redesign to dominate kernel work
- adding many agent personas without reliable scheduling and verification
- confusing feature count with platform maturity
- neglecting documentation and examples for external developers
- creating too many packages before stable boundaries exist

## Explicit non-goals

### Arcana is not a frontier model laboratory

It may evaluate and route models, but its moat does not depend on training the most capable general model.

### Arcana is not a universal policy language in version 1

It standardizes policy inputs, outputs, reason codes, and obligations before attempting to standardize all policy authoring.

### Arcana is not a replacement for MCP

MCP exposes tools and context. Arcana controls and proves execution involving those tools.

### Arcana is not a blockchain requirement

Integrity and signatures do not require a blockchain. Transparency logs or decentralized trust may be optional profiles later.

### Arcana is not guaranteed deterministic execution

Policy and serialization can be deterministic while models and external systems are not. The system records nondeterminism and replay fidelity honestly.

### Arcana is not unlimited autonomous operation

Budgets, contracts, capabilities, time limits, verification, and revocation remain foundational even at high autonomy levels.

### Arcana is not chat-history standardization

The protocol represents execution objects and evidence, not provider-specific conversational transcripts.

### Arcana is not an enterprise-only product

Local and individual use must remain excellent. Enterprise controls extend the same kernel rather than replacing it.

### Arcana is not proof that AI output is true

It provides stronger grounds for evaluating trust, not absolute truth guarantees.

## Architectural anti-patterns

- policy checks implemented only in UI components
- mutable proof records
- tools that self-declare successful verification
- subagents inheriting ambient parent authority
- opaque capability wrappers with undeclared side effects
- provider-specific fields in core protocol objects
- cloud identifiers required for offline proof validation
- swallowing inconclusive outcomes into success
- direct writes that bypass mutation authority in governed modes
- silently replacing evidence during compaction

## Decision rule

A proposed feature belongs in Arcana's future architecture only when it improves at least one of:

- authority control
- execution reliability
- evidence quality
- verification
- recovery
- portability
- sovereignty
- reusable operational knowledge

and does not materially weaken the others.

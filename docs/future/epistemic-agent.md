# Epistemic Agent

## Purpose

An Arcana epistemic agent is not simply an agent that reasons more. It is an agent whose beliefs, claims, uncertainty, and evidence relationships are explicit runtime objects.

The objective is to prevent fluent output from being mistaken for justified knowledge.

## Epistemic separation

Arcana separates:

- observations
- interpretations
- assumptions
- hypotheses
- claims
- evidence
- contradictions
- confidence
- verification outcomes
- decisions

This allows the system to say not only what it concluded, but what supports that conclusion and what remains unresolved.

## Claim model

```ts
interface ClaimRecord {
  id: string
  runId: string
  statement: string
  kind: "observation" | "inference" | "prediction" | "requirement" | "result"
  scope: string[]
  confidence: number
  confidenceBasis: string
  evidenceRefs: string[]
  assumptionRefs: string[]
  contradicts: string[]
  status: "proposed" | "supported" | "challenged" | "refuted" | "superseded"
  author: PrincipalRef
  createdAt: string
}
```

Confidence must not be accepted as an unexplained number. The basis may include deterministic verification, source agreement, direct observation, historical reliability, or model judgment.

## Evidence quality

Evidence should be evaluated along independent dimensions:

- directness
- source authority
- freshness
- integrity
- reproducibility
- independence
- coverage
- relevance
- susceptibility to manipulation

A large quantity of low-quality evidence must not automatically outrank a smaller amount of direct, authoritative evidence.

## Source provenance

Every external input should preserve:

- source identity
- acquisition method
- timestamp
- content hash
- transformation history
- trust classification
- access constraints
- whether the source is user-provided, tool-derived, model-generated, or inferred

Model-generated text cannot silently become an authoritative source for later reasoning.

## Assumptions

Assumptions should be registered explicitly when they materially affect planning or completion.

```ts
interface Assumption {
  id: string
  statement: string
  impact: "low" | "medium" | "high" | "critical"
  validationStrategy?: string
  status: "unvalidated" | "supported" | "rejected"
}
```

Critical unvalidated assumptions should prevent high-confidence completion unless the intent contract explicitly permits them.

## Contradiction handling

Contradiction is a normal state, not an error to hide.

The epistemic kernel should:

1. detect incompatible claims
2. preserve both claims and evidence
3. assess source independence and quality
4. request targeted investigation
5. mark unresolved contradictions
6. prevent unjustified certainty
7. record the resolution path when one claim supersedes another

## Challenge protocol

A verifier or another agent may challenge a claim by providing:

- counter-evidence
- a failed reproduction
- a missing prerequisite
- an alternative explanation
- a scope mismatch
- evidence of staleness
- an unsupported inference step

Challenges become part of RunProof rather than being erased after revision.

## Epistemic completion

A run's operational success and epistemic status are related but distinct.

Examples:

- tests pass, but root cause remains uncertain
- deployment succeeds, but performance attribution is inconclusive
- security issue is reproduced, but exploitability under production constraints is unverified
- research summary is complete, but primary sources disagree

The final outcome should include:

```ts
interface EpistemicOutcome {
  supportedClaims: string[]
  unresolvedClaims: string[]
  refutedClaims: string[]
  criticalAssumptions: string[]
  contradictions: string[]
  confidence: "high" | "moderate" | "low" | "indeterminate"
  limitations: string[]
}
```

## Research mode

For research tasks, Arcana should support an evidence graph:

```text
question
  → subquestions
  → sources
  → observations
  → claims
  → contradictions
  → synthesis
  → confidence and limitations
```

This graph should allow incremental source updates without regenerating the entire investigation from scratch.

## Software engineering mode

Epistemic discipline also applies to code work:

- "the bug is fixed" requires reproduction and a verifier
- "no regressions" requires defined coverage, not absence of observed failures
- "this is faster" requires a benchmark and environment metadata
- "this is secure" must be replaced by bounded, testable claims
- "the migration is complete" requires declared inventory and success criteria

## Memory integration

Arcana memory should store sourced facts and execution lessons, not free-floating model summaries.

Each memory item needs:

- provenance
- confidence
- temporal validity
- scope
- contradiction links
- originating run and evidence
- outcome quality

Memory retrieval should account for staleness and conflicting observations.

## Epistemic policies

Organizations may enforce rules such as:

- primary sources required for specified domains
- two independent sources required for high-impact claims
- deterministic verifier required for completion
- model-only evidence forbidden for critical decisions
- unresolved contradictions require human review
- stale evidence requires refresh
- confidence above a threshold requires an explanation

## Metrics

Useful metrics include:

- calibration error between predicted confidence and verified outcomes
- unsupported-claim rate
- contradiction-discovery rate
- evidence reuse quality
- source freshness
- verifier disagreement rate
- percentage of completions with declared limitations
- repeated-error reduction across runs

These metrics should improve reliability without rewarding excessive caution or endless investigation.

## Anti-patterns

- treating chain-of-thought verbosity as evidence
- assigning arbitrary confidence percentages
- counting duplicate sources as independent confirmation
- hiding contradictory results in summaries
- allowing the implementing agent to be the only verifier
- storing unsourced model conclusions as durable memory
- requiring certainty where the domain permits only probabilistic conclusions

## Success criteria

The epistemic agent succeeds when Arcana can:

- trace important conclusions to evidence
- distinguish observation from inference
- expose unresolved uncertainty without becoming unusable
- revise claims while preserving history
- prevent unsupported claims from satisfying success criteria
- learn from verified outcomes rather than confidence alone

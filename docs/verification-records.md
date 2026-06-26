# Verification Records

A Verification Record is Arcana's object for separating claimed success from proven success.

Agents often say a task is done. Arcana should record what was actually verified, what failed, what was skipped, and what remains unproven.

## One-line definition

```txt
A Verification Record turns agent claims into inspectable proof, failure, or uncertainty.
```

## Why it exists

Autonomous work is not trustworthy because an agent says it is complete.

Arcana should distinguish:

```txt
agent claimed success
command passed
test passed
contract satisfied
human accepted
unverified
inconclusive
failed
```

## Verification lifecycle

```txt
required
  ↓
planned
  ↓
running
  ↓
passed | failed | skipped | inconclusive
  ↓
attached_to_capsule
  ↓
reviewed | accepted | rejected
```

## Minimum verification fields

```txt
id
run_id
contract_id
kind
command_or_check
status
required
started_at
completed_at
evidence
failure_summary
skip_reason
confidence
```

## Conceptual schema

```ts
type VerificationRecord = {
  id: string
  runId: string
  contractId?: string
  kind: "test" | "lint" | "typecheck" | "build" | "security" | "policy" | "human" | "custom"
  command?: string
  status: "planned" | "running" | "passed" | "failed" | "skipped" | "inconclusive"
  required: boolean
  evidence: EvidenceRef[]
  failureSummary?: string
  skipReason?: string
  confidence: "low" | "medium" | "high"
}
```

This is documentation only. It does not define an implementation contract yet.

## Verification statuses

### passed

The check ran and passed.

### failed

The check ran and failed.

### skipped

The check was expected or relevant but did not run.

A skipped required check should prevent proven success.

### inconclusive

The check ran but did not prove the claim.

Examples:

```txt
tests timed out
partial output only
non-deterministic failure
manual review needed
```

## Success language

Arcana should avoid ambiguous success language.

Bad:

```txt
Done.
```

Better:

```txt
Agent completed changes.
Verification: incomplete.
Required tests were skipped.
Status: unproven.
```

Best:

```txt
Agent completed changes.
Verification: passed.
Contract satisfied.
Status: proven for declared criteria.
```

## Verification types

```txt
test
lint
typecheck
build
security scan
policy check
dependency check
contract satisfaction
human review
custom command
```

## Contract satisfaction record

A contract satisfaction check should include:

```txt
goal_satisfied
scope_respected
forbidden_actions_avoided
success_criteria_passed
budget_respected
risk_not_escalated
verification_complete
```

Example:

```txt
scope_respected: true
forbidden_actions_avoided: true
success_criteria_passed: false
reason: required test command failed
verdict: contract not satisfied
```

## Verification operations

Potential commands:

```sh
arcana verify <run>
arcana verify explain <run>
arcana verify contract <run>
arcana verify evidence <verification-id>
arcana verify compare <run-a> <run-b>
```

## QA checklist

A Verification Record is acceptable only if it answers:

```txt
What claim was being checked?
Was this check required?
What command or process ran?
What evidence was produced?
Did it pass, fail, skip, or remain inconclusive?
Why was it skipped, if skipped?
What confidence does Arcana assign?
Does this prove the contract or only support it?
What should a human review next?
```

## Failure modes

### Failure mode: claimed success

Risk:

```txt
Agent reports success without evidence.
```

Avoid by separating claimed, verified, and accepted states.

### Failure mode: skipped tests hidden as success

Risk:

```txt
Run looks successful even though required tests never ran.
```

Avoid by marking skipped required checks as blocking.

### Failure mode: noisy verification

Risk:

```txt
Too many irrelevant checks make capsules unreadable.
```

Avoid by linking checks to contract criteria.

### Failure mode: false certainty

Risk:

```txt
One passing test is treated as total correctness.
```

Avoid by scoping success to declared criteria.

## Verification quality levels

```txt
Level 0: agent says done
Level 1: command outputs recorded
Level 2: tests/lint/build linked to run
Level 3: verification mapped to contract criteria
Level 4: skipped/inconclusive states block proven success
Level 5: verification supports capsule comparison and route evaluation
```

Arcana should target Level 4.

## Product claim

```txt
Arcana separates claims from proof: every autonomous result shows what passed, failed, skipped, or remains unverified.
```

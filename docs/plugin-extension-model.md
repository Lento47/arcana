# Plugin Extension Model

Plugins are the advanced user-space layer for Arcana.

They let users and teams add custom behavior around contracts, capsules, route decisions, verification, memory, context, dependencies, and risk.

## One-line definition

```txt
Plugins let users extend Arcana's operating layer without changing Arcana core.
```

## Plugin philosophy

Plugins should be optional.

Arcana must be useful without plugins. Plugins exist for custom cases:

```txt
enterprise policy checks
custom verifiers
internal dependency rules
routing preferences
context filters
memory filters
team-specific risk scoring
security review workflows
support/incident workflows
```

## Plugin safety levels

Plugins should eventually have trust levels.

```txt
local-dev:
  user-authored local plugin

workspace-approved:
  approved for a repo/team

enterprise-approved:
  approved by organization policy

locked-approved:
  signed/allowlisted for locked mode
```

## Proposed hook model

Potential hooks:

```ts
export default {
  onContractLoad(contract, ctx) {},
  onModeSelected(mode, ctx) {},
  onRouteCandidates(candidates, ctx) {},
  onRouteDecision(route, ctx) {},
  onContextSelected(context, ctx) {},
  onMemoryProposed(memory, ctx) {},
  onRiskDetected(risk, ctx) {},
  onDependencyChanged(change, ctx) {},
  onVerificationRequired(verification, ctx) {},
  onCapsuleComplete(capsule, ctx) {}
}
```

This is documentation only. It does not define a runtime API yet.

## Plugin outputs

A plugin should be able to produce structured outputs:

```txt
warn
ask
block
annotate
recommend
require_verification
propose_memory
score_route
score_dependency
```

Plugin output should respect the active mode.

Example:

```txt
Plugin says: dependency risk is high.

Observe:
  record only

Advise:
  warn

Ask:
  request confirmation

Enforce:
  block unless contract allows

Locked:
  deny unless allowlisted
```

## Plugin examples

### Dependency intent plugin

Purpose:

```txt
Detect dependency additions and require intent fields.
```

### Custom verifier plugin

Purpose:

```txt
Add project-specific verification commands or review checks.
```

### Route scorer plugin

Purpose:

```txt
Prefer local/private providers for sensitive files, but allow approved external routes for low-risk tasks.
```

### Support triage plugin

Purpose:

```txt
Map logs, issue labels, and support artifacts into a structured incident contract.
```

### Release safety plugin

Purpose:

```txt
Prevent release-related changes unless release-check contract is active.
```

## Plugin context object

A plugin should receive enough context to be useful, but not unlimited power.

Potential context:

```txt
workspace
mode
contract
capsule draft
route decision
changed files
commands
tool calls
context sources
memory receipts
verification records
```

## Plugin restrictions

Plugins should not silently:

```txt
access secrets
send network requests
modify files
change mode
approve their own blocked action
hide their output from the capsule
```

In strict modes, plugin permissions should be explicit.

## Plugin QA checklist

A plugin design is acceptable only if it answers:

```txt
What hook does it use?
What input does it need?
What output can it produce?
Can it warn, ask, or block?
How does it behave per autonomy mode?
What evidence does it attach to the capsule?
What permissions does it require?
What happens if it fails?
Can it run offline?
```

## Failure modes

### Failure mode: plugins become hidden policy

Risk:

```txt
User cannot tell why Arcana blocked an action.
```

Mitigation:

```txt
Every plugin decision must be recorded in the capsule.
```

### Failure mode: plugins become unsafe execution

Risk:

```txt
Plugins do arbitrary work without mode/policy control.
```

Mitigation:

```txt
Plugins require permissions and mode-aware output.
```

### Failure mode: plugin API too early

Risk:

```txt
Arcana freezes a bad API before primitives are stable.
```

Mitigation:

```txt
Document hooks first. Implement only after capsules/contracts/events are stable.
```

## Product claim

```txt
Arcana plugins let teams extend autonomy without forking Arcana core.
```

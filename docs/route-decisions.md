# Route Decisions

A Route Decision is Arcana's object for explaining why a model, provider, runtime, or tool path was selected.

Sovereign routing should not be a dropdown. It should be a recorded decision with policy, constraints, tradeoffs, and evidence.

## One-line definition

```txt
A Route Decision explains why Arcana chose a specific intelligence path for a specific task.
```

## Why it exists

Agent systems often hide model choice behind defaults.

Arcana should make model/tool routing explicit because route choice affects:

```txt
privacy
cost
latency
quality
jurisdiction
locality
capability
risk
reproducibility
data exposure
```

## Route lifecycle

```txt
requested
  ↓
policy_loaded
  ↓
candidates_ranked
  ↓
selected | rejected | escalated
  ↓
attached_to_capsule
  ↓
evaluated_after_run
```

## Minimum route fields

```txt
id
run_id
contract_id
requested_task
policy
candidate_routes
selected_route
rejected_routes
selection_reason
constraints
cost_estimate
risk_level
data_exposure
fallbacks
evaluation
```

## Conceptual schema

```ts
type RouteDecision = {
  id: string
  runId: string
  contractId?: string
  task: string
  policy: RoutePolicy
  candidates: RouteCandidate[]
  selected: RouteCandidate
  rejected: RejectedRoute[]
  reason: string
  constraints: RouteConstraint[]
  costEstimate?: CostEstimate
  risk: "low" | "medium" | "high"
  dataExposure: "local" | "private-cloud" | "external-provider" | "unknown"
  fallbacks: RouteCandidate[]
  evaluation?: RouteEvaluation
}
```

This is documentation only. It does not define an implementation contract yet.

## Route policies

Initial policy names:

```txt
local-first
private-cloud
cheapest
best-coding
fastest
no-training
no-us-provider
enterprise-approved
airgapped
manual-only
```

A policy should define:

```txt
allowed providers
forbidden providers
allowed locations
data exposure limit
cost limit
latency preference
quality preference
fallback behavior
approval requirements
```

## Route candidate

A candidate is an available path.

```txt
provider: local
model: qwen-coder-local
runtime: local machine
cost: 0
privacy: local
latency: medium
quality_estimate: medium
risk: low data exposure, medium quality uncertainty
```

or:

```txt
provider: external
model: specialist-coding-model
runtime: hosted
cost: estimated
privacy: external-provider
latency: fast
quality_estimate: high
risk: code leaves machine
```

## Selection examples

### Local-first task

```txt
Task:
  summarize repo structure

Policy:
  local-first

Selected:
  local model

Reason:
  low-risk summarization, no need to expose repo context externally
```

### High-complexity coding task

```txt
Task:
  refactor session runner with tests

Policy:
  best-coding with no-training constraint

Selected:
  approved external coding model

Reason:
  task requires complex code edits, policy allows external provider, no-training mode available
```

### Security review

```txt
Task:
  audit authentication module

Policy:
  no-external-code

Selected:
  local model + static tooling

Reason:
  sensitive code path, policy blocks external code exposure
```

## Route operations

Potential commands:

```sh
arcana route explain <run>
arcana route simulate "fix auth tests" --policy local-first
arcana route candidates "review this repo"
arcana route policy show local-first
arcana route policy test enterprise-approved
```

## Route evaluation

After a run, Arcana should be able to evaluate whether the route was good.

```txt
quality result
cost actual vs estimate
latency actual vs estimate
tests passed
contract satisfaction
human accepted
fallback used
route should be preferred again?
```

This creates learning without hidden magic.

## QA checklist

A Route Decision is acceptable only if it answers:

```txt
What task was routed?
What policy applied?
What candidates existed?
Which route was selected?
Which routes were rejected?
Why was the route selected?
What data exposure occurred?
What was the cost/risk tradeoff?
What fallback existed?
Was the decision good after the run?
```

## Failure modes

### Failure mode: provider dropdown

Risk:

```txt
User manually picks a provider without understanding tradeoffs.
```

Avoid by explaining route decisions and constraints.

### Failure mode: sovereignty theater

Risk:

```txt
Arcana claims sovereignty but sends context externally by default.
```

Avoid by recording data exposure and requiring policies to be explicit.

### Failure mode: cost surprise

Risk:

```txt
A run silently becomes expensive.
```

Avoid by estimating cost and attaching actual cost to the capsule.

### Failure mode: quality superstition

Risk:

```txt
Users always pick one model because of brand preference.
```

Avoid by comparing route outcomes over time.

## Route quality levels

```txt
Level 0: hardcoded default model
Level 1: user-selected provider
Level 2: named routing policy
Level 3: candidates + selected route + explanation
Level 4: cost/privacy/risk constraints recorded in capsule
Level 5: route outcome evaluated and used for future routing
```

Arcana should target Level 3 first.

## Product claim

```txt
Arcana makes intelligence routing sovereign: every model choice can explain its policy, tradeoffs, and data exposure.
```

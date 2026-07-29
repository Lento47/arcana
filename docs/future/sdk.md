# Arcana SDK

## Purpose

The Arcana SDK is the adoption bridge between the Arcana product and the Arcana protocol.

It allows developers to embed governed, verifiable execution into agents, CLIs, IDEs, CI systems, services, and domain applications without adopting the Arcana TUI or Arcana Cloud.

## Design requirements

The SDK must be:

- local-first
- provider-neutral
- runtime-embeddable
- strongly typed
- protocol-compatible
- fail-closed at enforcement boundaries
- useful in incremental adoption modes
- independent from Arcana's presentation packages

## Package model

Initial packages:

```text
@arcana/protocol
@arcana/sdk
@arcana/policy
@arcana/conformance
```

Later packages:

```text
@arcana/runtime
@arcana/capabilities
@arcana/evidence
@arcana/verify
@arcana/crypto
@arcana/storage
@arcana/replay
@arcana/mcp
@arcana/github-actions
@arcana/langgraph
@arcana/openai-agents
```

The first release should prefer a small coherent surface over premature package fragmentation.

## Core API

```ts
import { Arcana } from "@arcana/sdk"

const arcana = new Arcana({
  workspace: process.cwd(),
  principal: { id: "agent:dependency-maintainer", kind: "agent" },
  policy: "./arcana.policy.ts",
  mode: "enforce",
})

const result = await arcana.run(
  {
    objective: "Upgrade the authentication dependency",
    successCriteria: [
      "Dependency resolves to the approved version",
      "Typecheck passes",
      "Authentication tests pass",
    ],
    capabilities: [
      "filesystem.read",
      "filesystem.propose_diff",
      "terminal.execute",
    ],
    budgets: { maxCost: 2, maxSteps: 40 },
  },
  async (ctx) => {
    // existing agent or application logic
  },
)

await result.proof.write("./runproof.json")
```

The SDK should automatically manage run identity, lifecycle, authorization, evidence capture, verification, and proof finalization.

## Adoption levels

### Level 1 — Observe an existing application

```ts
const output = await arcana.observe({
  action: "terminal.execute",
  resource: "workspace://repo",
  input: { command: "bun test" },
  execute: () => runTests(),
})
```

This records normalized actions and hypothetical policy decisions without blocking.

### Level 2 — Enforce existing tools

```ts
const output = await arcana.enforce({
  action: "deployment.release",
  resource: "deployment://production/api",
  input,
  execute: deploy,
})
```

The action executes only after policy, obligations, and approvals are satisfied.

### Level 3 — Arcana-native runtime

Applications use runs, capabilities, contracts, verifiers, checkpoints, and durable execution directly.

### Level 4 — Independent protocol implementation

A third party imports only protocol schemas and conformance fixtures, then implements its own runtime.

## Capability API

```ts
const deploy = defineCapability({
  id: "deployment.release",
  version: "1.0.0",
  input: DeploymentInput,
  output: DeploymentOutput,
  resource: (input) => `deployment://${input.environment}/${input.service}`,
  sideEffects: ["external_state", "production_mutation"],
  evidence: ["deployment_receipt", "health_check"],
  rollback: "compensating",
  execute: async (ctx, input) => {
    const receipt = await provider.deploy(input)
    await ctx.evidence.attach("deployment_receipt", receipt)
    return receipt
  },
  verify: async (ctx, output) => ctx.health.check(output.deploymentId),
})
```

Capabilities must not hide resource derivation or side effects inside opaque implementation code.

## Policy API

```ts
export default definePolicy({
  rules: [
    allow("filesystem.read", "workspace://**"),
    requireApproval("filesystem.propose_diff", "workspace://src/**"),
    deny("terminal.execute", command.matches("git push --force")),
    constrain("network.request", host.in(["registry.npmjs.org"])),
  ],
})
```

Authoring syntax can evolve. The compiled canonical policy representation and decision semantics are the stability boundary.

## Verification API

```ts
run.verify("tests-pass", {
  criterion: "Authentication tests pass",
  execute: (ctx) => ctx.terminal.exec("bun test auth"),
  evaluate: (result) => ({
    status: result.exitCode === 0 ? "passed" : "failed",
    evidence: [result.evidenceId],
  }),
})
```

SDK users should be able to combine deterministic, model-based, and human verification while retaining clear trust distinctions.

## Evidence API

```ts
await ctx.evidence.record({
  type: "command_execution",
  subject: "bun test auth",
  inputHash,
  outputHash,
  exitCode: 0,
})
```

The SDK should support inline records, content-addressed files, encrypted artifacts, redacted values, signatures, and external storage adapters.

## Middleware

```ts
arcana.use(secretRedactor())
arcana.use(costGuard())
arcana.use(telemetryExporter())
arcana.use(approvalGateway())
```

Middleware may add evidence, deny actions, constrain execution, or satisfy declared obligations. It cannot erase history, mutate signed records, or bypass protocol invariants.

## Model API

The core SDK should express requirements rather than provider-specific calls.

```ts
const response = await ctx.models.invoke({
  purpose: "planning",
  requirements: {
    toolUse: true,
    minContextWindow: 64_000,
    dataResidency: "local",
    maxCost: 0.25,
  },
})
```

Routing decisions and the selected provider/model are recorded in evidence.

## Replay API

```ts
const proof = await ArcanaProof.load("./runproof.json")
await proof.validate()

await arcana.replay(proof, {
  mode: "selective",
  actions: ["action-17", "verification-4"],
  substitutions: {
    model: "local/qwen",
    environment: "staging",
  },
})
```

Replay results must report fidelity, substitutions, skipped side effects, and changed dependencies.

## Error model

SDK errors should be typed and mapped to stable Arcana error and policy reason codes.

Categories include:

- invalid request
- protocol violation
- authorization denied
- approval rejected or expired
- obligation unsatisfied
- capability unavailable
- execution failed
- verification failed
- evidence unavailable
- integrity invalid
- recovery uncertain

## Language strategy

TypeScript should be the reference SDK because it matches Arcana's current implementation. The protocol must remain language-neutral.

Recommended sequence:

1. TypeScript reference SDK
2. JSON schemas and language-neutral conformance fixtures
3. Python SDK
4. Rust core validator or runtime library where performance and embedding justify it
5. community SDKs after the protocol stabilizes

## SDK version 1 acceptance criteria

An external developer can:

1. create a run
2. register a capability
3. evaluate policy
4. execute through a PEP
5. record evidence
6. attach verification
7. finalize a RunProof
8. validate that proof offline
9. operate without Arcana Cloud
10. pass the Core and Policy conformance suites

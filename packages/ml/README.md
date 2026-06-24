# @arcana/ml

Arcana Signal Engine is the private local-intelligence layer for Arcana.

It is intentionally dependency-light in its first version: no TensorFlow/native runtime is required to install or run the monorepo. The package defines the contract for local ML-style signals that can sit around the LLM:

- turn intent classification
- tool-risk scoring
- execution posture hints
- model routing hints
- token budget planning and semantic compression
- semantic request rewriting
- SQL optimization analysis
- machine stewardship and recyclable resource planning
- LLM system-prompt signal formatting
- audit-line formatting for tool signals

## Why this exists

The LLM reasons. The signal engine senses.

Arcana can use this layer before, during, and after LLM calls to preserve user sovereignty:

1. Before the LLM: classify intent, risk, required sandboxing, model route, token budget, and machine-resource posture.
2. During tool use: score write/network/secret-adjacent tool calls and avoid unnecessary disk materialization.
3. After execution: provide structured signal data for audit, policy, cleanup, recycling, and future learned models.

## Machine stewardship

Arcana should be careful with the user's machine:

- prefer memory-only state for transient analysis
- avoid generating files unless the operation requires it
- use temporary recyclable storage for regenerateable artifacts
- set TTLs for temporary data
- recycle least-recently-used temporary artifacts before allocating more disk
- never persist embeddings, prompt logs, model outputs, databases, or user-derived artifacts without explicit approval
- preserve user intent and user data boundaries when optimizing context

The `machine` advisor returns a posture such as:

- `memory_only`
- `no_write`
- `recycle_temp`
- `approval_required`

## Example

```ts
import { analyzeTurn, formatTurnSignalForSystemPrompt, planMachineResourceUse } from "@arcana/ml"

const signal = analyzeTurn({
  prompt: "fix this repo and run tests",
  sandboxEnabled: false,
  userSovereignty: { requireApprovalForWrites: true },
})

const resourcePlan = planMachineResourceUse({
  operation: "rerank local snippets",
  estimatedBytesToWrite: 4096,
  filesToCreate: 1,
  containsUserData: true,
  canRegenerate: true,
})

const systemNote = formatTurnSignalForSystemPrompt(signal)
```

## Runtime strategy

This package starts with deterministic local signals so it cannot introduce native install failures. Future adapters can live behind the same contract:

- ONNX Runtime / Transformers.js for local classifiers and rerankers
- TensorFlow.js as an optional backend
- native acceleration as an opt-in enterprise feature

Do not make TensorFlow a core dependency until install reliability is proven across Windows, macOS, Linux, and Bun.

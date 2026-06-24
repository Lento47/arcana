# @arcana/ml

Arcana Signal Engine is the private local-intelligence layer for Arcana.

It is intentionally dependency-light in its first version: no TensorFlow/native runtime is required to install or run the monorepo. The package defines the contract for local ML-style signals that can sit around the LLM:

- turn intent classification
- tool-risk scoring
- execution posture hints
- model routing hints
- LLM system-prompt signal formatting
- audit-line formatting for tool signals

## Why this exists

The LLM reasons. The signal engine senses.

Arcana can use this layer before, during, and after LLM calls to preserve user sovereignty:

1. Before the LLM: classify intent, risk, required sandboxing, and model route.
2. During tool use: score write/network/secret-adjacent tool calls.
3. After execution: provide structured signal data for audit, policy, and future learned models.

## Example

```ts
import { analyzeTurn, formatTurnSignalForSystemPrompt } from "@arcana/ml"

const signal = analyzeTurn({
  prompt: "fix this repo and run tests",
  sandboxEnabled: false,
  userSovereignty: { requireApprovalForWrites: true },
})

const systemNote = formatTurnSignalForSystemPrompt(signal)
```

## Runtime strategy

This package starts with deterministic local signals so it cannot introduce native install failures. Future adapters can live behind the same contract:

- ONNX Runtime / Transformers.js for local classifiers and rerankers
- TensorFlow.js as an optional backend
- native acceleration as an opt-in enterprise feature

Do not make TensorFlow a core dependency until install reliability is proven across Windows, macOS, Linux, and Bun.

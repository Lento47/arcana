# Arcana durable execution, prompt queue, memory, and context continuity

**Status:** proposed engineering contract
**Review date:** 2026-07-14
**Scope:** documentation and static code review only; no runtime behavior is changed by this document

## Decision

Arcana should use one durable execution model with four explicit boundaries:

1. The Arcana event store is the source of truth for prompts, runs, tools, and checkpoints.
2. Each session has one serial mutation lane; different sessions and independent read work may run in bounded parallel pools.
3. Context compression produces a typed, validated checkpoint over an immutable event range. It never replaces or deletes the source events.
4. Persistent semantic memory is a separate, consent-gated feature. It is not session history, a compaction mechanism, or a provider-owned memory service.

The target is the V2 path in [`packages/core`](../../packages/core), especially [`SessionInput`](../../packages/core/src/session/input.ts), [`SessionRunCoordinator`](../../packages/core/src/session/run-coordinator.ts), and the V2 [`SessionRunner`](../../packages/core/src/session/runner/llm.ts). Arcana should not add another prompt queue or another compaction implementation.

The short engineering rule is:

```txt
lossless event log + deterministic projection + typed checkpoint + bounded recent tail
    + optional consented memory receipts
```

## Why this order matters

Parallelism amplifies every durability bug. Memory amplifies every context and privacy bug. Arcana should therefore establish prompt ordering and recovery first, checkpoint continuity second, bounded parallel execution third, and semantic memory last.

This order prevents memory from becoming an accidental patch for weak compaction and prevents parallel workers from racing on state that has no authoritative owner.

## Reviewed implementation

### Strong foundations already present

| Area | Current foundation | Evidence |
|---|---|---|
| Prompt durability | Prompt admission is persisted before promotion and uses a stable message ID for idempotency. | [`input.ts`](../../packages/core/src/session/input.ts) |
| Queue semantics | `steer` inputs are promoted in admission order up to a cutoff; `queue` promotes exactly the oldest pending input. | [`input.ts`](../../packages/core/src/session/input.ts) |
| Per-session ownership | One drain chain runs per session key while different session keys may drain concurrently. Repeated wake signals coalesce. | [`run-coordinator.ts`](../../packages/core/src/session/run-coordinator.ts) |
| Queue recovery | Pending inputs remain durable across interruption and are retried by a later wake or resume. | [`session-runner.test.ts`](../../packages/core/test/session-runner.test.ts) |
| Tool durability | Local tool calls are recorded before execution, settled durably, and unfinished calls are failed during recovery. | [`runner/llm.ts`](../../packages/core/src/session/runner/llm.ts) |
| Context epochs | System context has a persisted baseline, snapshot, revision, and optimistic fencing around replacement. | [`context-epoch.ts`](../../packages/core/src/session/context-epoch.ts) |
| Compaction | V2 compaction stores a structured narrative summary plus retained recent context and preserves the original event history. | [`compaction.ts`](../../packages/core/src/session/compaction.ts) |
| Memory storage | The local memory package already has SQLite, FTS5, fact deduplication, confidence decay, and write serialization. | [`packages/memory`](../../packages/memory) |
| Read fan-out | The CLI agent exposes a `batch` tool restricted by description to independent reads. | [`tools.ts`](../../packages/arcana/src/agent/tools.ts) |

The V2 test suite already covers important invariants: one active provider run, steering, separate FIFO queued activities, interruption recovery, queue promotion rollback, cross-session concurrency, compaction recovery, and durable tool settlement. These tests make the V2 path a much safer consolidation target than a new subsystem.

### Gaps that should be addressed

| Finding | Engineering consequence |
|---|---|
| The legacy engine and V2 core both own prompt/compaction behavior. The legacy dual-write currently marks prompts as `steer`. | Semantics can drift depending on entry point. A single authoritative execution facade is required. |
| The CLI memory default is currently enabled. | Persistent semantic memory is not an explicit opt-in today. |
| Disabling CLI memory also removes the `SessionManager` and prevents registration of all built-in tools, not only memory tools. | Operational history, non-memory tools, and semantic memory are incorrectly coupled. |
| Session resume in the CLI drops tool messages because tool-call IDs are not persisted. | Resume is useful for prose context but cannot provide exact execution continuity. |
| `user_facts.source` is optional and facts have no scope, consent status, lifecycle, or usage receipt. | Stored facts cannot yet satisfy Arcana's documented Memory Receipt model. |
| The CLI `batch` executor uses dynamic `Promise.all` with no pool limit or maximum batch size. | A large model-generated batch can exhaust file handles, sockets, provider quotas, or memory. |
| Some runtime fan-outs use `concurrency: "unbounded"`. | Static, tiny lookups may be harmless, but dynamic external or model work needs explicit budgets. |
| V2 compaction still trusts generated prose for goals, constraints, decisions, and next steps. | Important state can be omitted even though the raw log survives. |
| V2 recent-context selection may split a serialized message at a character boundary. | A retained tail can begin mid-message instead of at a causal event or turn boundary. |
| Successive summaries are updated from the previous summary. | Repeated summary-of-summary compression can accumulate drift unless periodically re-grounded in source events. |
| Reflection/learning paths and some CLI tools use direct home-directory paths. | A configured USB data root cannot be guaranteed until every persistence path uses the same storage policy. |

## Target architecture

```txt
TUI / API / CLI
      |
      | PromptCommand { inputId, sessionId, delivery }
      v
Durable admission log  ----->  queue projection / status stream
      |
      v
Per-session serial coordinator <---- bounded global scheduler
      |
      v
Turn orchestrator
      |---------------- bounded independent read workers
      |---------------- bounded model/subagent workers
      `---------------- single-writer mutation and event-commit lane
      |
      v
Durable events, tool results, artifacts, and verification
      |
      v
Context projector
      |---------------- lossless source event log
      |---------------- typed validated checkpoint
      |---------------- bounded raw recent tail
      `---------------- consent-gated Memory Receipt references
      |
      v
Model adapter (AI SDK or another provider adapter)
```

The UI is a projection of this state. It must not own queue order, infer completion from terminal output, or hold the only copy of an unprocessed prompt.

## Non-negotiable invariants

1. A prompt is persisted before Arcana acknowledges it.
2. A prompt ID is idempotent: retrying the same command cannot create a second turn.
3. User prompts are never silently coalesced, reordered, or dropped. Only wake notifications may coalesce.
4. At most one top-level activity mutates a session at a time.
5. Queued activities run FIFO. Steering is explicit and joins only at a safe model-step boundary.
6. Parallel work has a declared independence or dependency relationship and a bounded resource budget.
7. Original events are never deleted merely because the model-facing view was compacted.
8. A checkpoint cannot become current until its invariants validate.
9. Operational session history and semantic long-term memory have separate settings, retention, and deletion behavior.
10. When semantic memory is off, Arcana performs no semantic memory reads, writes, extraction, embedding, or cloud synchronization.
11. Opting out takes effect immediately for subsequent model calls.
12. No persistence path may bypass the configured Arcana data root.

## Durable prompt admission and queueing

### Use the existing V2 inbox as the authority

[`SessionInput.admit`](../../packages/core/src/session/input.ts) already implements the correct first boundary: durable admission keyed by message ID. Its `session_input` projection has unique admission and promotion sequences in [`sql.ts`](../../packages/core/src/session/sql.ts). Extend that model rather than keeping a queue in the TUI, an in-memory array, or an AI SDK hook.

A client acknowledgement should contain at least:

```ts
type PromptAccepted = {
  inputId: string
  sessionId: string
  admittedSeq: number
  delivery: "queue" | "steer"
  state: "admitted"
}
```

The event stream can project the richer lifecycle without treating a mutable row as the source of truth:

```txt
admitted -> promoted -> running -> completed
                    |-> failed
                    `-> cancelled
```

### Delivery semantics

| Situation | Default | Meaning |
|---|---|---|
| Session is idle | `queue` | Begin a distinct activity from the oldest admitted prompt. |
| Session is busy | `queue` | Wait FIFO until the active activity reaches a terminal state. |
| User explicitly chooses “send now” / steer | `steer` | Incorporate at the next safe step boundary in the active activity. |

Steering must not mutate an already-dispatched provider request. It becomes visible after the current provider stream and required tool settlement reach a safe boundary. The current V2 runner already follows this shape by checking pending steering between bounded provider steps.

The TUI should expose `Queue` as the normal submission action while busy and `Steer active run` as a distinct action. A visual badge should show the admitted position and delivery mode.

### Queue behavior

- Persist, then acknowledge, then wake the coordinator.
- Promote exactly one queued prompt per activity.
- Promote eligible steering inputs in admission order using a frozen sequence cutoff.
- Never use wake coalescing as prompt coalescing.
- Reject admission with a visible reason when configured queue limits are reached; never accept and later discard.
- Bound both item count and serialized bytes per session.
- Allow cancellation by prompt ID before promotion. Treat cancellation of a running activity as a separate run interruption.
- Defer arbitrary reorder support until causal and audit semantics are defined. Cancellation plus new admission is safer for the first release.
- On restart, scan for pending admitted work and issue advisory wakes. Durable state, not the wake signal, determines what runs.

### Multi-process ownership

The current coordinator correctly owns a process-local session lane. A clustered deployment will additionally need a durable lease with a fencing token:

```ts
type SessionLease = {
  sessionId: string
  ownerId: string
  fence: number
  expiresAt: string
}
```

Every commit from a worker must carry the current fence. A stale process may finish computation, but it cannot append authoritative session events after losing the lease.

This is not required for a single local process and should not delay consolidation on the existing coordinator.

## Parallel execution model

Parallelism should be expressed as resource-scoped work, not as a general permission to use `Promise.all`.

### Concurrency matrix

| Work | Policy | Reason |
|---|---|---|
| Top-level activities in one session | Serial FIFO | They share conversation state, permissions, and mutation order. |
| Activities in different sessions | Bounded parallel | The current coordinator already isolates keys. Add a global capacity limit. |
| Independent local reads in one turn | Bounded parallel | Reads such as file inspection and searches can safely fan out. |
| Provider/model requests | Bounded by provider, model, user tier, and run budget | Avoid quota spikes and runaway cost. |
| Subagents | Bounded; isolated context; explicit parent budget | They add model calls, latency, and context merge work. |
| Tool calls with overlapping write sets | Serial | Completion order would otherwise change the result. |
| Mutations with disjoint, proven write sets | Isolate, then merge through one commit gate | Conflicts must be detected before authoritative mutation. |
| Event and projection commits | Serial per aggregate/transactional | Preserve causal sequence and idempotency. |
| Compaction | Single-flight per session | Avoid competing checkpoints over different cuts. |
| Memory proposals | Bounded background work after a verified boundary | They must not block the user response or race with consent changes. |

### Represent work as a DAG

The orchestrator should emit work items with dependencies and declared capabilities:

```ts
type WorkItem = {
  id: string
  runId: string
  parentId?: string
  dependsOn: string[]
  capability: "read" | "model" | "subagent" | "write" | "verify"
  readSet?: string[]
  writeSet?: string[]
  budget: {
    maxSteps?: number
    maxTokens?: number
    timeoutMs: number
  }
  status: "pending" | "running" | "completed" | "failed" | "cancelled"
  resultRef?: string
}
```

Only ready nodes whose dependencies succeeded may enter a pool. Use separate semaphores for CPU/file reads, network requests, model calls, and subprocesses; one global number is too coarse.

Recommended initial policy:

- Treat the current `batch` description as advisory only: the handler dynamically dispatches any registered tool, and subcalls do not currently re-apply `safeMode`, `allowedTools`, or sandbox checks. Fix recursive authorization before expanding parallel execution; see the independent security audit's I04 finding.
- Enforce a code-level batch allowlist limited to read-only tools for the initial release.
- Add a hard batch-size limit and a bounded map/pool.
- Propagate cancellation to every child operation.
- Assign each run a total step, token, time, and child-task budget.
- Preserve full worker results as durable artifacts or events, but inject only a focused result into the parent model context.
- Make the parent responsible for synthesis; workers must not commit overlapping changes directly.
- For code-writing workers, prefer isolated workspaces or patches and merge through one verifier/commit lane.

### Backpressure and detach behavior

Streaming should be lazy so a slow or disconnected consumer does not create an unbounded buffer. Cancellation should propagate to provider and subagent calls.

There are two valid disconnect policies, and Arcana must select one explicitly per run:

- `cancel_on_disconnect`: stop the active provider stream and children.
- `detach_and_complete`: continue in the backend, persist progress and terminal state, and allow the TUI to reconnect.

The second mode must not be implemented by accidentally consuming an endless stream. It requires a durable running state, budgets, cancellation, and resumable event delivery.

## Persistent memory: explicit consent and receipts

### Separate three kinds of state

| State | Purpose | Consent/retention |
|---|---|---|
| Ephemeral working context | Current provider call, scratch reasoning, temporary worker state | Destroy at the end of the run unless captured by an authorized durable event. |
| Operational session history | Resume, audit, queue recovery, tool settlement, checkpoints | Separate session-history setting and retention policy. Not marketed as personalization memory. |
| Semantic long-term memory | Preferences, durable project facts, reusable user facts | Explicit opt-in, receipt lifecycle, scope, export, and forgetting. |

This separation fixes a current CLI coupling: turning semantic memory off should not remove non-memory tools or make durable prompt recovery impossible.

### Consent modes

Semantic memory should default to `off` for a new user or workspace.

```ts
type MemoryMode = "off" | "ask" | "on"

type MemoryConsent = {
  subjectId: string
  scope: "user" | "workspace" | "repo"
  mode: MemoryMode
  policyVersion: string
  dataRoot: string
  grantedAt?: string
  revokedAt?: string
}
```

- `off`: no semantic retrieval, storage, candidate extraction, embeddings, or synchronization.
- `ask`: Arcana may form an ephemeral candidate and ask; only an accepted candidate is persisted.
- `on`: Arcana may automatically persist non-sensitive receipts under the chosen scope, with a visible notice and audit trail. Sensitive categories still require per-item confirmation.

An explicit user instruction such as “remember that this repo uses Bun” is item-level consent and may create an active receipt even in `ask` mode. It does not silently enable automatic memory for unrelated facts.

A per-turn `private` or `do not remember this` flag must suppress both candidate extraction and memory use for that turn.

### Opt-out and deletion

Changing to `off` must take effect before the next model request:

1. Stop new reads, writes, extraction, embedding, and sync.
2. Cancel queued memory jobs that have not committed.
3. Invalidate retrieved-memory caches and remove memory context from the next assembled view.
4. Record the consent change without copying memory content into telemetry.
5. Offer two unambiguous choices: `disable and keep dormant data` or `disable and erase data`.

Erasure should create a durable tombstone or deletion event, then purge the primary row, FTS entries, embeddings, caches, exports under Arcana's control, and pending sync jobs. The UI must distinguish “memory is off” from “memory has been erased.”

### Memory Receipt contract

Arcana already has a strong conceptual model in [`memory-receipts.md`](../memory-receipts.md). Implementation should promote it from a concept to the storage contract instead of adding a second fact schema.

```ts
type MemoryReceipt = {
  id: string
  subjectId: string
  fact: string
  source: {
    type: "user" | "file" | "command" | "tool" | "capsule" | "external"
    ref: string
    sourceHash?: string
  }
  scope: "user" | "workspace" | "repo" | "project" | "session"
  confidence: number
  status: "proposed" | "active" | "stale" | "contradicted" | "forgotten"
  sensitivity: "normal" | "sensitive" | "forbidden"
  consentRef: string
  createdAt: string
  lastConfirmedAt?: string
  lastUsedAt?: string
  expiresAt?: string
  relatedRuns: string[]
  contradictions: string[]
}
```

Required rules:

- No source, no active memory.
- No consent reference, no durable semantic memory.
- Retrieval must enforce subject and scope before ranking.
- A model-generated inference begins as `proposed`, not trusted fact.
- Secrets, credentials, raw private keys, and untrusted prompt instructions are forbidden memory content.
- Retrieved memory is injected with provenance and trust labels, never as invisible system truth.
- Every run records which receipt IDs influenced it.
- Changed repo sources mark dependent memories stale.
- Contradictions remain inspectable until resolved; last-write-wins is not sufficient.
- Users can list, inspect why, export, challenge, forget one item, and erase all items in scope.

The existing SQLite/FTS/dedup/decay implementation can remain the local storage mechanism, but its schema and service boundary need these consent and receipt fields. Arcana should use its own custom memory service rather than a provider-defined or external memory provider, preserving local ownership and avoiding provider lock-in.

### Data location and telemetry boundary

All operational history, checkpoints, receipts, indexes, reflections, and learning artifacts must resolve through the configured Arcana data root. If `ARCANA_HOME` or `dataDir` points to the KINGSTON volume, no fallback may write to `~/.arcana` or another home-directory path.

Startup diagnostics should show the resolved paths and memory mode. A QA gate should run Arcana with a temporary allowed root and fail on any write outside it.

Cloudflare free-usage metrics are a separate data boundary described in [`free-usage-weekly-session-plan.md`](../free-usage-weekly-session-plan.md). Usage telemetry must not include prompt text, checkpoint narratives, tool output, file content, memory facts, embeddings, or Memory Receipt sources. Memory consent must never be inferred from telemetry consent or free-tier use.

## Context continuity across compression

### Treat compression as a view, not storage

The durable event log is lossless. The model-facing context is necessarily lossy. Arcana should make that distinction explicit:

```txt
source events (authoritative)
  -> deterministic state projection (authoritative derived state)
  -> generated narrative summary (helpful, non-authoritative)
  -> bounded raw recent tail (verbatim causal evidence)
  -> model-facing context view
```

Persistent memory must not be used to reconstruct a compressed conversation. Memory has a different scope, consent lifecycle, and truth standard.

### Typed Context Checkpoint

The current V2 `summary + recent` message is a useful start. Extend it into a versioned checkpoint whose deterministic fields are produced from events, not from the summarization model:

```ts
type SourceRef = {
  eventSeq: number
  eventId?: string
  messageId?: string
}

type ContextCheckpoint = {
  id: string
  schemaVersion: number
  sessionId: string
  parentCheckpointId?: string
  contextEpoch: number
  sourceRange: {
    fromSeq: number
    toSeq: number
    hash: string
  }
  objective?: { text: string; source: SourceRef }
  constraints: Array<{ text: string; source: SourceRef }>
  corrections: Array<{ text: string; source: SourceRef }>
  decisions: Array<{ text: string; reason?: string; source: SourceRef }>
  plan: Array<{
    id: string
    text: string
    status: "pending" | "in_progress" | "completed" | "blocked"
    source: SourceRef
  }>
  pendingInputs: Array<{
    inputId: string
    admittedSeq: number
    delivery: "queue" | "steer"
  }>
  openTools: Array<{ callId: string; name: string; status: string }>
  approvals: Array<{ id: string; status: string; source: SourceRef }>
  artifacts: Array<{ id: string; path?: string; hash?: string }>
  files: Array<{ path: string; state: "read" | "modified" | "created" | "deleted" }>
  verification: Array<{ check: string; status: string; evidenceRef?: string }>
  errors: Array<{ message: string; resolved: boolean; source: SourceRef }>
  memoryReceiptIds: string[]
  recentTail: { fromSeq: number; toSeq: number; tokenEstimate: number }
  narrative: string
  createdAt: string
}
```

This schema connects the existing [`Context Supply Chain`](../context-supply-chain.md), [`Run Capsules`](../run-capsules.md), and V2 context epoch instead of replacing them.

### Safe checkpoint algorithm

1. Acquire the session's single-flight compaction ownership.
2. Freeze a source sequence cutoff `C`.
3. Continue accepting prompts durably. Admissions after `C` remain outside the compacted range and cannot be swallowed by the checkpoint.
4. Project typed state from source events through `C`.
5. Select a recent tail at whole event, tool-call, and user-turn boundaries. Never split an event or serialized message in the middle.
6. Generate the narrative only for the closed source range, with source-backed structured state supplied alongside it.
7. Validate the checkpoint against the pre-checkpoint projection.
8. Atomically append the completed checkpoint and its source hash. An incomplete `Started` event is not current.
9. Rebuild the model view from system/context epoch, checkpoint, raw recent tail, and events after `C`.
10. Retain the original events according to the session-history policy; compaction itself never deletes them.

### Validation gates

A checkpoint must be rejected if any of these change unexpectedly:

- pending prompt IDs, order, or delivery mode;
- the latest user objective, constraints, correction, or explicit prohibition;
- in-progress plan items or blockers;
- running/pending tool-call IDs and settlement state;
- unresolved approvals or permission boundaries;
- modified files, artifacts, or verification results;
- active agent/model/context epoch;
- memory receipt references actually injected into the run.

On validation failure, Arcana should retain the previous checkpoint and a larger raw tail, then retry with a diagnostic event. It must not continue using a known-invalid compressed view.

### Avoid summary drift

The narrative may build incrementally for cost, but it must not become the only input to the next narrative. Periodically regenerate it from the source event range and always regenerate deterministic fields from events. Checkpoint ancestry and source hashes make drift measurable.

The parent model should see worker summaries through a bounded context projection, while full worker output remains available by artifact/event reference. This follows the same lossless-log/lossy-view rule.

## AI SDK boundary

Arcana pins `ai@6.0.168`; its bundled documentation is vendored at [`docs/vendor/ai-sdk/6.0.168`](../vendor/ai-sdk/6.0.168/README.arcana.md) without installing the package.

Use AI SDK inside an already-admitted activity for:

- bounded tool loops and stop conditions;
- per-step context preparation;
- model/provider streaming;
- cancellation propagation;
- independent workflow fan-out;
- stable server-generated UI message IDs and message validation;
- subagent context isolation and focused parent-facing output.

Do not delegate these responsibilities to AI SDK:

- durable prompt admission or FIFO ordering;
- per-session ownership;
- authoritative event sequencing;
- memory consent and receipt lifecycle;
- checkpoint validation;
- crash recovery;
- global concurrency and user-tier budgets.

Relevant version-matched references:

- [`Building Agents`](../vendor/ai-sdk/6.0.168/03-agents/02-building-agents.mdx)
- [`Workflow Patterns`](../vendor/ai-sdk/6.0.168/03-agents/03-workflows.mdx)
- [`Loop Control`](../vendor/ai-sdk/6.0.168/03-agents/04-loop-control.mdx)
- [`Memory`](../vendor/ai-sdk/6.0.168/03-agents/06-memory.mdx)
- [`Subagents`](../vendor/ai-sdk/6.0.168/03-agents/06-subagents.mdx)
- [`Chatbot Message Persistence`](../vendor/ai-sdk/6.0.168/04-ai-sdk-ui/03-chatbot-message-persistence.mdx)
- [`Backpressure`](../vendor/ai-sdk/6.0.168/06-advanced/03-backpressure.mdx)

AI SDK's default 20-step agent limit is a useful safety precedent, but Arcana must keep its own run-level limits because one Arcana activity may contain retries, workers, and provider calls beyond a single SDK loop.

## Migration and implementation sequence

### Phase 0: declare one authority

- Name the V2 event store, `SessionInput`, coordinator, runner, context epoch, and checkpoint projection as the target runtime path.
- Put legacy prompt and compaction behavior behind adapters.
- Freeze new queue or compaction features in the legacy path except compatibility fixes.
- Define a single configured data-root policy and enumerate every persistent writer.
- Require every composite or delegated tool path to re-apply top-level authorization, safe-mode, sandbox, rate, budget, and audit policy before scheduling child work.

### Phase 1: complete prompt lifecycle durability

- Add projected running/terminal/cancelled activity status where it is not already derivable.
- Make every entry point use durable admission before acknowledgement.
- Expose queue state and delivery mode to the TUI.
- Add queue count/byte limits, cancel-by-ID, restart scan, and global session capacity.
- Preserve current V2 FIFO and interruption tests as compatibility gates.

### Phase 2: ship typed checkpoints

- Add the versioned checkpoint schema and deterministic projector.
- Change recent-tail selection to causal boundaries.
- Add invariant validation, source ranges, and hashes.
- Re-ground narratives from events to measure and prevent drift.
- Migrate legacy summaries into checkpoint narrative fields without claiming full typed continuity for old data.

### Phase 3: add bounded parallel scheduling

- Replace dynamic unbounded fan-out with resource-specific pools.
- Add work DAGs, parent budgets, cancellation, and durable status.
- Keep writes behind one merge/commit gate.
- Add detached-run recovery only after durable status and reconnect semantics exist.

### Phase 4: introduce consented Memory Receipts

- Default semantic memory to `off` for new scopes.
- Decouple non-memory built-in tools and operational session history from the semantic memory service.
- Add consent receipts, scope, provenance, lifecycle, sensitivity, export, and erase operations.
- Put all extraction, retrieval, storage, embedding, reflection, learning, and sync behind the same consent policy.
- Reference used memory IDs from checkpoints and Run Capsules.

### Phase 5: remove semantic drift

- Stop legacy dual-write once readers and migrations are verified.
- Remove the legacy queue/compaction authority, leaving compatibility readers where required.
- Document the stable event, checkpoint, and memory schemas.
- Only then advertise crash-safe queued prompts, context continuity, or persistent memory as product guarantees.

## QA contract

### Queue and recovery

- Property test: arbitrary admission/retry/interruption sequences produce no lost or duplicate prompt IDs.
- Property test: queued prompts complete in admitted sequence unless explicitly cancelled.
- Verify steering joins the active activity only at a safe boundary.
- Kill the process after admission, after promotion, during provider streaming, during tool execution, and before terminal commit; restart and verify deterministic recovery.
- Verify queue overflow is rejected before acknowledgement with an actionable reason.
- Verify different sessions progress concurrently while one session never has two active owners.

### Parallelism and backpressure

- Stress batch size, open files, sockets, subprocesses, and model calls; measured concurrency must never exceed configured pool capacity.
- Cancel a parent and verify all children receive cancellation and settle durably.
- Disconnect a TUI in both cancellation and detached modes; verify the documented policy exactly.
- Force worker conflicts and verify the single merge gate detects them.
- Verify a failed worker cannot silently mark the parent complete.

### Context continuity

- Use sentinel constraints, corrections, decisions, queue IDs, tool calls, file paths, and test results before compaction; verify every typed field after reconstruction.
- Replay the same source range twice and require identical deterministic checkpoint fields and source hash.
- Corrupt or omit a checkpoint field and verify validation retains the previous context view.
- Compact repeatedly and compare narrative drift against a fresh source-grounded summary.
- Admit prompts during compaction and verify all post-cutoff IDs remain visible and ordered.
- Resume with pending and completed tool calls; require exact tool identifiers and settlement state.

### Memory consent and privacy

- Test every operation under `off`, `ask`, `on`, per-turn private mode, and after revocation.
- Under `off`, assert zero memory database reads/writes, extraction model calls, embeddings, and sync requests.
- Verify explicit item-level “remember” does not enable global automatic memory.
- Verify scope isolation across users, workspaces, and repositories.
- Forget one receipt and erase all; verify primary DB, FTS, caches, exports, and pending jobs contain no live copy.
- Attempt to store a secret or untrusted external instruction and verify rejection/quarantine.
- Inspect model context and Run Capsule output to ensure memory influence is visible by receipt ID.
- Inspect Cloudflare telemetry payloads and prove that no prompt, file, tool, checkpoint, or memory content is present.

### Portable storage

- Run with `ARCANA_HOME` and `dataDir` on a temporary KINGSTON-style root.
- Monitor filesystem writes and fail the test on any Arcana state written outside the configured root.
- Verify the displayed resolved paths before a session starts.
- Unmount or make the data root read-only and require a clear, non-destructive failure rather than a fallback to the user's home directory.

## Product-level acceptance criteria

The design is ready to claim only when all of the following are true:

- A user can submit multiple prompts, see their durable order, cancel one, restart Arcana, and observe the same remaining queue.
- Independent work runs faster through bounded parallelism without changing mutation order or exceeding budgets.
- Repeated compression preserves typed objectives, constraints, corrections, decisions, pending prompts, open tools, artifacts, and verification state.
- A new installation stores no semantic memory until the user opts in.
- Opt-out immediately removes memory from future context, and erase removes all Arcana-controlled copies in scope.
- Session recovery remains available under its own policy even when semantic memory is off.
- All local state honors the configured portable data root.
- Cloudflare receives usage metrics only, never conversation or memory content.

## Final recommendation

Do not build parallelization, prompt queueing, memory, and compaction as four independent features. Treat them as one durable execution system with separate policy boundaries:

```txt
queue determines what runs
scheduler determines what may run together
event log determines what happened
checkpoint determines what the model must carry forward
memory consent determines what may survive beyond the session
```

Consolidating on the V2 core and enforcing those boundaries is the lowest-risk path to faster execution without losing prompts, context, user control, or portability.

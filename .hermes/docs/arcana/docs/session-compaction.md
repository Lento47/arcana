# Session compaction

Long sessions grow until they hit the model context window. Arcana keeps them usable by **auto-compacting** (summarizing older turns, keeping a recent tail) with policies aligned to Grok-style long-session handling.

## When compact runs

Two **independent** triggers fire proactive compaction:

1. **Safety** — token usage ≥ **85%** of the model context window (default `threshold_percent`), or past the usable-budget hard ceiling (`isOverflow`). This is a context-capacity limit.
2. **Performance** — token usage ≥ `performance_max_input_tokens` (**default 96 000 tokens**, `compaction.performance !== false`). This is a **latency budget, independent of the context window**: a 1M-token window still compacts at 96k because smaller prompts answer faster. The engine reports the reason as `"performance"`.

That is why a session can show `CTX … 11%` and still compact — the second trigger, not the percent band, is the binding constraint.

| Pass | When | Notes |
|------|------|--------|
| **Proactive (P0)** | Token usage ≥ **85%** of model context (or past the usable budget hard ceiling) | Default threshold |
| **Performance** | Token usage ≥ `performance_max_input_tokens` (default **96 000**) | Latency budget; independent of context percent |
| **Inline / mid-loop** | Same user turn, multi-step tool loop | Gated by intra policy |
| **Inter preflight** | Start of a new user turn, before first sample | Between turns |
| **Inter post-turn** | After the agent loop exits | Prepares next message |
| **Intra (P4)** | Mid-loop when steps ≥ 3 (or ≥ 2 on hard usable breach) and usage is hot | Same turn; hysteresis always |
| **Manual** | `/compact` or keybind | Always available |

Auto is on by default (`compaction.auto !== false`).

## Hysteresis

After a **successful** compact, Arcana stores on the session:

| Metadata key | Purpose |
|--------------|---------|
| `__arcana_last_compact_tokens` | Hysteresis baseline. Written from a text estimate on success, then **rebased to provider usage** (`tokenCount`) at the first provider measurement completed after the compaction — the same metric used for inter/intra decide. |
| `__arcana_last_compact_result_pending` | Set on success, cleared by the rebase. While present the baseline above is provisional. |
| `__arcana_last_compact_at` | Timestamp (also the rebase guard: measurements completed at or before it are pre-compaction and never rebase). |
| `__arcana_last_compact_pass` | `inter` \| `intra` \| `inline` \| `manual` |

Inter/intra will not fire again until usage grows by at least **max(5 000 tokens, 5% of context)** from the baseline. Soft-failed compacts do not update these fields. Inter/intra are allowed when context is hot via **either** the percent threshold **or** the usable hard ceiling (`isOverflow`), then apply hysteresis. Intra hard-breach may lower the min step floor to 2 but **never** skips hysteresis (avoids mid-loop thrash).

## Config

In project or user config (`arcana.json` / engine config):

```jsonc
{
  "compaction": {
    "auto": true,
    "threshold_percent": 85,
    "performance": true,
    "performance_max_input_tokens": 96000,
    "reserved": 20000,
    "tail_turns": 2,
    "preserve_recent_tokens": 8000,
    "prune": false,
    "intra": true,
    "intra_min_steps": 3,
    "intra_min_tokens": 5000
  }
}
```

| Key | Default | Description |
|-----|---------|-------------|
| `auto` | `true` | Master switch for automatic compact |
| `threshold_percent` | `85` | Proactive trigger as % of context (1–100) |
| `performance` | `true` | Latency-oriented compaction before the safety limit |
| `performance_max_input_tokens` | `96000` | Token count that triggers the latency compact; independent of the window |
| `reserved` | ~output budget / 20k | Hard ceiling reserve so output still fits |
| `tail_turns` | `2` | Recent user turns kept verbatim |
| `preserve_recent_tokens` | ~2k–8k | Cap on verbatim tail size |
| `prune` | `false` | Drop old tool outputs in background |
| `intra` | `true` | Mid-loop compact during multi-step runs |
| `intra_min_steps` | `3` | Min loop steps before intra can fire |
| `intra_min_tokens` | `5000` | Min usage before intra is worth running |

### Rollback knobs

| Goal | Setting |
|------|---------|
| Disable all auto compact | `"auto": false` |
| Disable mid-loop only | `"intra": false` |
| Disable the latency budget (only the 85% / usable ceiling remains) | `"performance": false` |
| Raise the latency budget | `"performance_max_input_tokens": 200000` |
| Compact later | `"threshold_percent": 95` or `100` |
| Compact earlier | `"threshold_percent": 75` |

The TUI reports which trigger is binding: the status bar shows the latency budget once it is the constraint (`CTX 112.1K / 96K … over budget`) and the spine header turns the ctx segment to warning, so a low-percent compact is never unmotivated.

## Failure handling

Auto compact **never kills** the agent turn:

- Transient errors (429, 5xx, timeout) retry once (~3s)
- Deterministic errors (context length, most 4xx) do not retry
- Bad / insufficient summaries are rejected and not applied
- Soft-fail → loop continues with uncompacted history

Manual compact can still hard-stop on failure.

## Full-replace layout

After a successful compact, model context is assembled as:

```txt
[compaction-user, summary-assistant, ...retained tail..., continue-user?]
```

(`MessageV2.filterCompacted` + `tail_start_id`)

Head prep drops incomplete trailing tools, truncates huge tool outputs for the summarizer, and trims by whole turns under JSON size limits.

## TUI

- Status line shows **⟳ COMPACTING** while a compact is in flight
- Context pressure (statusbar, sidebar, metrics): **COMPACT SOON** from **85%**, **COMPACT NOW** from **95%**
- Compacting indicator clears on **success or failure** (`session.next.compaction.ended`)
- Manual: keybind `session.compact` / tip `/compact`

## Code map

| Area | Path |
|------|------|
| Trigger / % | `packages/engine/src/session/overflow.ts` |
| Failures | `packages/engine/src/session/compaction-failure.ts` |
| Assemble / prep | `packages/engine/src/session/compaction-assemble.ts` |
| Inter | `packages/engine/src/session/compaction-inter.ts` |
| Intra | `packages/engine/src/session/compaction-intra.ts` |
| Process / create | `packages/engine/src/session/compaction.ts` |
| Loop hooks | `packages/engine/src/session/prompt.ts` |
| Graduated prune plan | `packages/engine/src/session/compaction-strategy.ts` |

## Related

- Cheap model for summaries: `utilityModel` in [configuration.md](./configuration.md)
- Performance notes: [architecture/arcana-performance-optimization-foundation.md](./architecture/arcana-performance-optimization-foundation.md)

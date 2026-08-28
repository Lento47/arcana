# Prompt Architecture

This document describes how Arcana assembles system prompts for LLM interactions. It is the canonical reference for contributors modifying prompt files or the prompt assembly logic.

---

## Overview

Arcana's default provider path uses a **base + model-specific** prompt architecture:

```
[base-arcana.txt] + [model-specific.txt] → system prompt
```

The default path gives each selected model family the shared base prompt plus a model-specific prompt. A configured custom `agent.prompt` replaces both pieces; it does not inherit `base-arcana.txt` automatically.

---

## File Structure

```
packages/engine/src/session/prompt/
├── base-arcana.txt          # Shared base prompt (~665 tokens)
├── default.txt              # Fallback for unmatched models
├── gpt.txt                  # GPT-4, GPT-4o, GPT-4.1, etc.
├── anthropic.txt            # Claude models
├── gemini.txt               # Google Gemini models
├── codex.txt                # OpenAI Codex models
├── beast.txt                # GPT-4 reasoning models (o1, o3, gpt-4*)
├── trinity.txt              # Trinity models
├── kimi.txt                 # Kimi models
├── copilot-gpt-5.txt        # Dormant legacy asset; not selected by system.ts
├── plan.txt                 # Plan mode prompt
├── plan-mode.txt            # Plan mode activation
├── plan-reminder-anthropic.txt  # Dormant legacy asset; not imported by the runtime
└── build-switch.txt         # Privileged guidance during build switching
```

---

## Assembly Logic

### Model Selection (`system.ts`)

The `provider()` function selects the prompt array based on model ID:

```typescript
export function provider(model: Provider.Model) {
  if (model.api.id.includes("gpt-4") || model.api.id.includes("o1") || model.api.id.includes("o3"))
    return [BASE_ARCANA, PROMPT_BEAST]
  if (model.api.id.includes("gpt")) {
    if (model.api.id.includes("codex")) return [BASE_ARCANA, PROMPT_CODEX]
    return [BASE_ARCANA, PROMPT_GPT]
  }
  if (model.api.id.includes("gemini-")) return [BASE_ARCANA, PROMPT_GEMINI]
  if (model.api.id.includes("claude")) return [BASE_ARCANA, PROMPT_ANTHROPIC]
  if (model.api.id.toLowerCase().includes("trinity")) return [BASE_ARCANA, PROMPT_TRINITY]
  if (model.api.id.toLowerCase().includes("kimi")) return [BASE_ARCANA, PROMPT_KIMI]
  return [BASE_ARCANA, PROMPT_DEFAULT]
}
```

**Selection priority:**
1. `gpt-4*`, `o1*`, `o3*` → beast.txt
2. `gpt*codex*` → codex.txt
3. `gpt*` → gpt.txt
4. `gemini-*` → gemini.txt
5. `claude*` → anthropic.txt
6. `*trinity*` → trinity.txt
7. `*kimi*` → kimi.txt
8. (fallback) → default.txt

### Full Prompt Assembly (`prompt.ts`, `llm/request.ts`)

The system prompt is assembled from multiple sources:

```
System Prompt = [
  ...(agent.prompt           // Custom agent prompt, when configured
      ? [agent.prompt]
      : [BASE_ARCANA, MODEL_SPECIFIC]),
  ...TOOL_EFFICIENCY,        // Omitted for small-model requests
  ...environment(model),     // Model ID, working directory, platform, date, references
  ...instructions,           // Project/agent instructions
  ...skills(agent),          // Available skills list
  ...memory(),               // Persistent memory facts + learned wiki excerpts
  ...conditionalSections,    // Continuation and structured-output instructions
  ...user.system,            // Per-request system text, when present
]
```

**Additional dynamic sections:**
- Runtime-generated privileged guidance for queued follow-ups, plan/build switching, and bounded finalization
- Structured output system prompt when JSON schema is requested
- Plugin transforms that may modify the assembled system array

---

## Base Prompt (`base-arcana.txt`)

The base prompt contains shared guidance for every model selected through `SystemPrompt.provider()`. It is bypassed by a custom `agent.prompt`.

| Section | Purpose | ~Tokens |
|---|---|---|
| Identity | "You are Arcana" | 15 |
| Tools | Dynamic tool-schema authority and usage guidance | 120 |
| Autonomy | Proactive behavior, interruption handling | 35 |
| Skills & Memory | Capability availability and memory trust | 45 |
| AGENTS.md | Project conventions guidance | 25 |
| Conventions | Code style, no assumptions, security | 40 |
| Error Recovery | 3-strike rule, try different strategy | 30 |
| Token Awareness | Selective reading, grep-first, summarize | 35 |
| Output | Concise, markdown, code references | 30 |
| Safety | Destructive commands, secrets, trust boundaries | 40 |
| System reminders | How to handle `<system-reminder>` tags | 15 |

**Total:** ~687 tokens by the rough `characters / 4` estimate.

### Design Principles

1. **Dynamic tool authority** — the tool schema exposed for the current session, rather than a hardcoded list, determines availability
2. **No redundancy** — the base avoids content that model-specific prompts may repeat
3. **Shared default-path behaviors** — autonomy, error recovery, and token awareness apply to provider-selected models
4. **Safety-first** — destructive command blocking, secret protection, trust boundaries

---

## Model-Specific Prompts

Each selected model-specific prompt adds behavior on top of the base. The key rule is to avoid unnecessary duplication. Custom agent prompts are a separate replacement path.

### What belongs in model-specific prompts

✅ **Unique model behaviors:**
- GPT: commentary/final response channels, formatting rules, editing constraints
- Anthropic: professional objectivity, todowrite usage
- Gemini: path construction, primary workflows, new application workflow
- Codex: git hygiene, frontend tasks, presenting work
- Beast: autonomous workflow (10-step), keep-until-solved mandate
- Trinity: one-tool-per-message constraint
- Kimi: working environment (NOT sandboxed), project information

❌ **Don't put here:**
- A hardcoded claim that a tool is available; the runtime schema is authoritative
- Safety rules (already in base)
- Output format (already in base)
- Conventions (already in base)

### Token Budget per Model

| Active selection | Base | Model-specific | Total |
|---|---|---|---|
| trinity | 687 | 257 | **~944** |
| default | 687 | 424 | **~1,111** |
| anthropic | 687 | 455 | **~1,142** |
| beast | 687 | 544 | **~1,231** |
| kimi | 687 | 565 | **~1,252** |
| codex | 687 | 718 | **~1,405** |
| gemini | 687 | 880 | **~1,567** |
| gpt | 687 | 1,067 | **~1,754** |

`copilot-gpt-5.txt` is approximately 441 tokens but is not selected or imported by the current runtime.

---

## Dynamic Prompt Sections

### Environment (`system.ts → environment()`)

Injected on every request:

```
You are powered by the model named {modelID}.
<env>
  Working directory: {cwd}
  Workspace root folder: {worktree}
  Is directory a git repo: yes/no
  Platform: {darwin|linux|win32}
  Today's date: {date}
</env>
<available_references>
  <reference>
    <name>{name}</name>
    <path>{path}</path>
    <description>{description}</description>
  </reference>
</available_references>
```

### Memory (`system.ts → memory()`)

The current runtime automatically reads two sources, cached with invalidation:

1. **SQLite user facts** — from `~/.arcana/data/memory.db`, top 5 by confidence
2. **Learned wiki excerpts** — from `~/.arcana/learned/*.md`, 2 random entries

```xml
<persistent-memory>
These facts were stored by the user or learned from past sessions:
- {key}: {value}
</persistent-memory>
```

There is currently no consent gate in `SystemPrompt.memory()`. Treat the injected values as untrusted context, never as instructions. The opt-in design and migration requirements are documented in [Durable Execution, Memory, and Context Continuity](architecture/arcana-durable-execution-memory-context-continuity.md); do not describe memory as opt-in until that gate is implemented and tested.

### Skills (`system.ts → skills()`)

Available skills listed as markdown bullets (saves ~40% tokens vs XML):

```
Skills provide specialized instructions and workflows for specific tasks.
Use the skill tool to load a skill when a task matches its description.
- {skill-name}: {description}
- {skill-name}: {description}
```

Capped at 40 skills (configurable via `ARCANA_MAX_SKILLS`).

---

## Conditional Sections

### Plan Mode (`plan.txt`, `plan-mode.txt`)

Plan guidance is added to the privileged system context only when experimental
CLI plan mode is enabled. It is never appended to a user message or persisted
as a synthetic transcript part. The plan agent and `plan_exit` tool use the
same availability gate.

`plan-reminder-anthropic.txt` is not imported by current source code. Changing it has no runtime effect unless it is explicitly wired in later.

### Max Steps

The session loop enforces the configured step limit at runtime. Once the
external-tool turn budget is exhausted, Arcana performs one bounded,
tool-free finalization turn and then completes with `reason: "step_limit"`.
The old assistant-prefill continuation prompt and next-turn XML reminder are
not part of the model or user transcript.

---

## Adding a New Model Prompt

### Step 1: Create the prompt file

```bash
# packages/engine/src/session/prompt/my-model.txt
You are Arcana. [Model-specific guidance here]

# Don't include:
# - Hardcoded tool availability claims
# - Safety rules (in base)
# - Output format (in base)
```

### Step 2: Register in system.ts

```typescript
import PROMPT_MY_MODEL from "./prompt/my-model.txt"

export function provider(model: Provider.Model) {
  // ... existing checks ...
  if (model.api.id.includes("my-model")) return [BASE_ARCANA, PROMPT_MY_MODEL]
  return [BASE_ARCANA, PROMPT_DEFAULT]
}
```

### Step 3: Verify token cost

```bash
chars=$(wc -c < packages/engine/src/session/prompt/my-model.txt)
echo "Model-specific: ~$((chars / 4)) tokens"
base=$(wc -c < packages/engine/src/session/prompt/base-arcana.txt)
echo "Total: ~$(((base + chars) / 4)) tokens"
```

---

## Common Pitfalls

### ❌ Duplicating base content

```txt
# BAD — availability varies by client, agent, permission, and configuration
Available tools are always: read, write, edit, glob, grep, shell, task...
Never run destructive commands without approval.
```

### ❌ Forgetting tool names

```txt
# BAD — uses "TodoWrite" but the tool ID is "todowrite"
Use TodoWrite to plan tasks.
```

### ❌ Exceeding token budget

```txt
# BAD — model-specific prompt is 2000+ tokens alone
# Keep model-specific prompts under 1000 tokens
```

### ❌ Missing unique value

```txt
# BAD — this is just the default prompt copy-pasted
You are Arcana. Be concise. Follow conventions.
# Should instead add model-specific behavior
```

---

## Prompt File Conventions

1. **One line per rule** — terse, no fluff
2. **Markdown headers** for sections (`# Section`, `## Subsection`)
3. **Bullet lists** for rules (`- Rule text`)
4. **No emojis** unless explicitly needed
5. **One trailing newline** for new or edited files; normalize legacy exceptions when they are otherwise touched
6. **UTF-8 encoding** — no BOM

---

## Debugging Prompts

### Check what prompt a model gets

```typescript
import { provider } from "./system"
const prompts = provider({ api: { id: "gpt-4o" }, providerID: "openai" })
// prompts = [BASE_ARCANA, PROMPT_GPT]
```

### Count tokens for a model

```bash
# Base + model-specific
base=$(wc -c < packages/engine/src/session/prompt/base-arcana.txt)
model=$(wc -c < packages/engine/src/session/prompt/gpt.txt)
total=$(( (base + model) / 4 ))
echo "Total: ~$total tokens"
```

### Test prompt assembly

`packages/engine/test/session/prompt.test.ts` exercises the broader session-prompt path, but it does not directly assert every provider selection, the base/model order, or the custom-agent replacement behavior. Add focused assertions for those contracts when changing assembly logic.

---

## Assembly Flow

```txt
default provider path: BASE_ARCANA -> MODEL_SPECIFIC --+
custom-agent path:     agent.prompt -------------------+-> TOOL_EFFICIENCY
                                                        -> environment
                                                        -> instructions
                                                        -> skills
                                                        -> memory
                                                        -> conditional sections
                                                        -> per-request system text
                                                        -> plugin transform
```

---

## Related Files

| File | Purpose |
|---|---|
| `packages/engine/src/session/system.ts` | Provider selection and environment/memory/skills generation |
| `packages/engine/src/session/prompt.ts` | Dynamic system sections, message handling, and loop logic |
| `packages/engine/src/session/llm/request.ts` | Final ordering, custom-agent replacement, and plugin transform boundary |
| `packages/engine/src/session/prompt/*.txt` | All prompt text files |
| `docs/prompt-refactoring-summary.md` | Summary of prompt changes made in this session |

# Arcana System Prompt Refactoring Summary

**Date:** July 14, 2026
**Scope:** System prompt files in `packages/engine/src/session/prompt/`

---

## Overview

Unified the default provider-selected prompts under a shared base prompt (`base-arcana.txt`) to improve consistency in Arcana identity, tool usage, and safety guidance. A configured custom `agent.prompt` remains a replacement path and does not inherit the base automatically.

---

## Files Changed

### NEW: `base-arcana.txt`
Shared base prompt prepended to every model-specific array selected by `system.ts`. Contains:
- Arcana identity
- Dynamic tool-schema authority and usage guidance
- Autonomy guidance (proactive behavior, interruption handling)
- Skills & Memory system overview
- AGENTS.md conventions
- Error recovery (3-strike rule)
- Token awareness (selective file reading, grep-first, summarize output)
- Output format
- Safety rules (destructive commands, secrets, trust boundaries)
- System reminders handling

**Size:** 2,748 chars (~687 tokens by the rough `characters / 4` estimate)

### `system.ts`
- Added `import BASE_ARCANA from "./prompt/base-arcana.txt"`
- Prepended `BASE_ARCANA` to all model-specific prompt arrays (beast, gpt, codex, gemini, anthropic, trinity, kimi, default)
- Preserved the existing custom-agent behavior in `llm/request.ts`: `agent.prompt` replaces the base and model-specific pair

### `default.txt`
- Removed: duplicate Tone/style, Following conventions, Code style, Tool usage policy, Code references sections
- Kept: CLI commands (/help, /goal, /loop), URL policy, Proactiveness, Doing tasks

### `gpt.txt`
- Trimmed: Opening paragraph (verbose → compact identity)
- Condensed: Editing constraints (4 dirty-worktree bullets → 1)
- Merged: General section, Formatting rules, Response channels (commentary/final) from ~380 tokens to ~100 tokens
- Restored: Senior engineer identity, commentary timing guidance (before substantial work)

### `anthropic.txt`
- Removed: duplicate Tone/style, Code references, Tool usage policy
- Fixed: "TodoWrite tools" → "todowrite tool" (matches actual tool ID)
- Kept: Professional objectivity, task management (todowrite), model-specific tool-use guidance

### `gemini.txt`
- Removed: duplicate Core mandates (conventions, libraries, style), Security/Safety, Tool usage
- Kept: Proactiveness, Path construction, Primary workflows, New applications, Tool usage (background processes, interactive commands, user confirmations)

### `codex.txt`
- Removed: duplicate Tool usage section
- Trimmed: Final answer structure (kept essential formatting)
- Kept: Editing constraints, Git hygiene, Frontend tasks, Presenting work

### `beast.txt`
- Removed: stale `.github/instructions/memory.instruction.md` instructions; memory behavior is now described centrally
- Kept: Workflow (10-step), Communication, Reading files, Git

### `trinity.txt`
- Removed: duplicate Tone/style, Following conventions, Code style, Tool usage policy, Code references
- Kept: Proactiveness, Doing tasks, Tool usage (one tool per message, question for clarification)

### `kimi.txt`
- Removed: duplicate AGENTS.md section, Prompt/Tool use overlap
- Streamlined: General guidelines for coding, Project information
- Kept: Working environment (NOT sandboxed), Ultimate reminders, Git mutations

### `plan-reminder-anthropic.txt`
- Replaced a hardcoded user path with `${planInfo}`
- Runtime status: dormant; no current source file imports this prompt, so the edit has no effect unless the file is wired in later

---

## Token Budget (Final State)

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

**Total per active default-path model:** ~940–1,750 tokens (down from ~1,000–2,400 before refactoring, using the same rough estimate)

---

## Key Improvements

1. **Consistent Arcana identity** — provider-selected models now share the same base prompt
2. **Dynamic tool authority** — the runtime's exposed schema determines availability; the Anthropic prompt also fixes "TodoWrite" → "todowrite"
3. **Added missing behaviors** — autonomy, interruption handling, error recovery, token awareness
4. **Removed stale paths** — obsolete memory-file guidance in `beast.txt` and a hardcoded path in the dormant `plan-reminder-anthropic.txt`
5. **Reduced redundancy** — large repeated blocks were removed while intentional model-specific emphasis remains
6. **~300 token savings** on gpt.txt alone via formatting/condensing

---

## Verification

- Structural review confirms `system.ts` imports and prepends `BASE_ARCANA` to every provider-selected prompt array.
- Structural review confirms `llm/request.ts` uses a custom `agent.prompt` instead of the base/model pair when configured.
- `packages/engine/test/session/prompt.test.ts` covers the wider prompt flow but has no focused provider-selection/base-order assertions; this remains a regression-test gap.
- Merge-readiness command results are recorded with the final review rather than assumed here.

---

## Architecture

```txt
default path: [BASE_ARCANA] + [MODEL_SPECIFIC] --+
custom path:  [agent.prompt] --------------------+-> efficiency guidance
                                                   -> environment/instructions/skills/memory
                                                   -> conditional and per-request system text
                                                   -> plugin transform
```

Each provider-selected model prompt adds its behavior on top of the shared base, reducing duplication while preserving model-specific guidance (for example, GPT's response channels, Anthropic's professional objectivity, and Beast's autonomous workflow).

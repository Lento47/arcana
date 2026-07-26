# Agent Permission Denial Handling — Prompt + TUI Guidance

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** When a tool is blocked by user permission rules, the agent should ask the user to grant permission instead of silently failing. Currently the TUI shows a strikethrough error but the agent has no prompt-level guidance to recover.

**Architecture:** Two changes: (1) Add permission-recovery guidance to the agent system prompt (`build.txt`), (2) Enhance the denied-tool rendering in the TUI to show an explicit "Ask the user to update permissions" hint.

**Tech Stack:** Prompt engineering (plain text) + SolidJS TUI tweak.

---

## Full Code Path Audit

### How permission denials flow

```
Agent calls tool
  ↓
Engine checks permission rules (session-data.ts matches rules)
  ↓ DENIED
Engine sets part.state.status = "error"
  part.state.error = "The user has specified a rule which prevents..." + rules JSON
  ↓
TUI: InlineToolRow reads error → denied() memo matches "specified a rule" (index.tsx:2249-2252)
  ↓
TUI: renders strikethrough text with error message (index.tsx:2358)
  ↓
Agent: sees tool.error in next turn — currently has NO guidance on how to handle
  ↓
Agent: may retry the tool (same denial), give up, or ignore
```

### What exists

| Layer | What | File:Line |
|---|---|---|
| Engine | Permission check before tool execution | `session-data.ts` |
| TUI | `denied()` memo detects "specified a rule" string | `index.tsx:2249-2252` |
| TUI | Strikethrough rendering for denied tools | `index.tsx:2358` |
| TUI | Warning color for denied tools (line 2259: `permission() → theme.warning`) | `index.tsx:2259` |

### What's missing

| Layer | Gap |
|---|---|
| Prompt | Agent doesn't know to ask user for permission when tool is denied |
| TUI | The strikethrough rendering shows the RAW rules JSON — hard to read |
| TUI | No "ask the user to fix this" hint visible to the agent |

---

## Regression Analysis

**REG-1: Adding prompt guidance may cause the agent to over-ask for permissions.** If every denial triggers "please update your permissions," the user gets spammed. **Mitigation:** Only prompt the agent to ask ONCE per session for a given tool. The agent should note the denial and offer a solution, not retry endlessly.

**REG-2: The rules JSON in the error message is verbose and TUI-unfriendly.** The error includes the full rules array: `[{"permission":"*","action":"allow","pattern":"*"},{"permission":"edit","pattern":"*","action":"deny"},...]`. This takes multiple lines in a compact tool row. **Fix:** Format the rules as a compact readable list in the expandable output. **Added to plan.**

**REG-3: Prompt change affects all sessions immediately — no opt-out.** The new guidance is always active. If a user intentionally blocks tools, the agent's permission request could be annoying. **Mitigation:** The guidance instructs the agent to ask ONCE and accept the user's decision. No nagging.

**REG-4: `denied()` memo matches on substring — false positives possible.** The check `error()?.includes("specified a rule")` could match unrelated errors. **No change — existing behavior, not regressed by plan.**

---

## Files

| Action | Path | ~Lines |
|---|---|---|
| Modify | `packages/engine/src/agent/prompt/build.txt` | +8 lines |
| Modify | `packages/tui/src/routes/session/index.tsx` | +15 lines (format rules JSON) |

---

## Bite-Sized Tasks

### Task 1: Add permission-recovery to agent prompt (2 min)

**Objective:** Teach the agent to ask the user to update permission rules when a tool is denied.

**File:** `packages/engine/src/agent/prompt/build.txt`

**Insert after the tool error handling section** (find the section about tool errors, or add after the workflow guidance):

Add:

```text
## When a tool is denied by permission rules
If a tool fails with "The user has specified a rule which prevents you from using
this specific tool call" or contains "rejected permission":
- Do NOT retry the same tool — it will be denied again.
- Tell the user exactly which tool was blocked and what file/pattern was denied.
- Ask the user to either:
  a) Update their permission rules to allow the tool (provide the exact JSON rule), or
  b) Switch to an agent that has the required permissions (e.g., a "general" or
     "edit" subagent if the current agent lacks edit/write permissions).
- Example: "The `edit` tool was blocked on `src/config.ts`. You can either:
  1. Add `{"permission":"edit","pattern":"src/config.ts","action":"allow"}` to
     your permission rules, or
  2. Switch to the `general` agent which has edit permissions."
- Accept the user's decision — if they decline both options, find an alternative
  approach that doesn't require the denied tool.
```

**Verification:** After rebuild, agent responds to denied tools with a clear permission-request message instead of retrying.

**Commit:**
```bash
git add packages/engine/src/agent/prompt/build.txt
git commit -m "agent: add permission-recovery guidance for denied tools"
```

---

### Task 2: Format rules JSON in denied tool output (3 min)

**Objective:** Instead of showing raw rules JSON in the error, parse and display it as a readable list.

**File:** `packages/tui/src/routes/session/index.tsx` — the `GenericTool` or `InlineToolRow` rendering

The denied error at line 2249-2252 already matches "specified a rule". The error message contains the rules JSON. We need to extract and format it.

**Step 2a: Add a rules formatter function** (above the `InlineTool` component, before line 2210):

```typescript
function formatPermissionDenial(error: string): string {
  // Extract rules JSON from the error message and format as readable list
  try {
    const match = error.match(/\[.*\]/s)
    if (!match) return "Permission denied by user rules."
    const rules = JSON.parse(match[0]) as Array<{ permission: string; pattern: string; action: string }>
    if (!Array.isArray(rules)) return "Permission denied by user rules."
    const denyRules = rules.filter(r => r.action === "deny")
    if (!denyRules.length) return "Permission denied by user rules."
    return "Permission denied:\n" + denyRules.map(r =>
      `  deny ${r.permission || "?"} → ${r.pattern || "*"}`
    ).join("\n")
  } catch {
    return "Permission denied by user rules."
  }
}
```

**Step 2b: Use formatted denial in `InlineTool`'s error prop.** In the `InlineTool` function where `error={error()}` is passed to `InlineToolRow` (line ~2275):

```typescript
// Current (around line 2203):
      error={error()}

// Replace with:
      error={denied() ? formatPermissionDenial(error() ?? "") : error()}
```

This ensures the formatted message flows into `InlineToolRow`'s error display and the strikethrough text shown for denied tools.

**Verification:** Denied tools show a clean "Permission denied: deny edit on src/*" message instead of raw JSON.

**Commit:**
```bash
git add packages/tui/src/routes/session/index.tsx
git commit -m "tui: format permission rules as readable list in denied tool output"
```

---

### Task 3: Build and verify (2 min)

```bash
cd L:/PROJECTS/arcana && bun run build
```

Expected: 8/8 successful.

```bash
git push
```

---

## Risks

1. **Rules JSON parsing is fragile.** The regex `match(/\[.*\]/s)` extracts the first JSON array. If the error message format changes, the regex won't match and the raw error is shown. **Acceptable — fallback returns the original error string.**

2. **Agent may still retry tools despite prompt guidance.** Prompt guidance is advisory — the LLM may ignore it. **Acceptable for now — the prompt is clear and the deny rendering provides human-readable feedback.**

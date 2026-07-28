# Fix: /loop Should Be Independent of /goal — TUI Slash Command Parity with CLI

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Make `/loop` in the TUI work the same as the CLI's native /loop hub — auto-set goal from input text, start loop, track progress — without requiring `/goal` to be set first. `/goal` becomes an independent command for manual goal setting.

**Architecture:** The TUI's slash command handler (prompt/index.tsx) currently lumps `/goal` and `/loop` together in one block where /loop is just a goal status viewer. The CLI (run.ts) has a full /loop hub with `set`, `done`, `blocked`, `stale`, and auto-set. Move the TUI /loop handler to match the CLI's behavior. Keep /goal as a standalone command.

**Tech Stack:** SolidJS, Effect, arcana/core/session/goal

---

## Current State (broken)

**TUI (prompt/index.tsx:1361-1417):** `/loop` and `/goal` share a handler:
```
/loop check PS5 folder  →  "No active goal. Set one with /goal <description>."
/goal read file          →  sets goal "read file"
```

User types `/loop` first, gets blocked. Types `/goal` to unblock. Loop never starts.

**CLI (run.ts:720-830):** `/loop` is a full autonomous hub:
```
/loop              →  show goal + kanban board + last reflection
/loop set <goal>   →  set goal + init board
/loop done/blocked →  mark goal status
/loop <text>       →  auto-set goal from text + track progress
```

---

## What Must Change

### 1. TUI `/loop` must mirror CLI `/loop`

| Input | Current TUI | New TUI |
|-------|-------------|---------|
| `/loop` | Shows "No active goal" | Shows goal status + kanban stats (if goal exists) |
| `/loop set <desc>` | N/A | Set goal + init kanban board |
| `/loop <text>` | "No active goal" | Auto-set goal from text + start loop |
| `/loop done` | N/A | Mark goal complete_unverified |
| `/loop blocked` | N/A | Mark goal blocked |
| `/goal <desc>` | Sets goal | **Unchanged** — standalone goal setter |

### 2. `/goal` stays independent

`/goal` sets a session goal WITHOUT starting a loop. It's for manual goal management. `/loop` auto-creates goals AND starts the loop tracking.

### 3. Multi-line slash commands

If the user types a slash command followed by plain text on subsequent lines (e.g. `/loop check PS5` on line 1, then additional context on line 2), the plain text lines are discarded — only the slash line is processed. If multiple `/` commands appear on separate lines, the input is rejected with a toast telling the user to submit each separately.

---

## Regression Analysis

**REG-1: `/loop` that previously showed status now auto-sets goal.** Users typing `/loop check something` expecting a status check will now have a goal auto-set. This is the desired behavior (matching CLI), but existing users may be surprised. **Fix:** Add toast confirmation "Goal auto-set: ..." so the transition is visible.

**REG-2: `/goal` now independent — no longer required before `/loop`.** Users who followed the old workflow (/goal first, then /loop) will find /loop works without /goal. No breakage — just a workflow improvement. **No fix needed.**

**REG-3: kanban board imports may fail in TUI context.** The CLI's `/loop set` calls `initBoard(sid, description, "")` which writes to `~/.arcana/kanban/`. The TUI may not have this path accessible or the imports may not be available in the browser-conditions environment. **Fix:** Make `initBoard` and `loadBoard` available via `@arcana/core/session/goal` or a separate kanban module that works in both CLI and TUI contexts.

**REG-4: Server round-trip for loop start.** Unlike the CLI where `/loop` runs in-process, the TUI needs to send the loop to the engine. The existing `sdk.client.session.command()` or `sdk.client.session.promptAsync()` can carry the loop intent. **Fix:** Use `session.command()` with command="loop" and arguments=text for structured handling.

**Confidence:**
- REG-1: 100% — toast confirmation handles the transition
- REG-2: 100% — pure improvement
- REG-3: 90% — kanban module may need browser-conditions testing
- REG-4: 95% — session.command already exists, just need to wire the loop handler

---

## Implementation Plan

### Task 1: Extract loop slash command from combined goal/loop handler

**Objective:** Split the combined `/goal`+`/loop` handler in prompt/index.tsx into two independent branches. `/goal` stays where it is. `/loop` gets its own handler matching CLI behavior.

**Files:**
- Modify: `packages/tui/src/component/prompt/index.tsx:1361-1417`

**Step 1: Read the current handler block**

Lines 1361-1417 handle both `/goal` and `/loop` together.

**Step 2: Replace the combined block with two separate handlers**

After line 1360 (end of previous `else if`), replace lines 1361-1417 with:

```tsx
    // ── /goal — standalone goal setter (does NOT start loop) ──
    } else if (inputText.startsWith("/goal ")) {
      move.startSubmit()
      const args = inputText.slice(6).trim()
      if (!args) {
        toast.show({
          title: "Goal",
          message: "Usage: /goal <description of what you want done>",
          variant: "info",
        })
        return true
      }
      void import("@arcana/core/session/goal")
        .then(({ setSessionGoal }) => {
          setSessionGoal(sessionID, { goal: args, status: "in_progress" })
          toast.show({
            title: "Goal set",
            message: args.length > 120 ? args.slice(0, 117) + "…" : args,
            variant: "success",
          })
        })
        .catch((error) => {
          toast.show({ title: "Goal command failed", message: errorMessage(error), variant: "error" })
        })

    // ── /loop — autonomous loop hub (matches CLI behavior) ──
    } else if (inputText.startsWith("/loop")) {
      move.startSubmit()
      const rest = inputText.slice(5).trim() // everything after "/loop"
      
      if (rest === "" || rest === "status") {
        // /loop — show goal + kanban status
        void import("@arcana/core/session/goal")
          .then(({ getSessionGoal, formatActiveGoalBlock }) => {
            const snap = getSessionGoal(sessionID)
            if (snap.status === "unset") {
              toast.show({
                title: "No active goal",
                message: "Start one with /loop set <description> or just /loop <what to do>",
                variant: "warning",
              })
              return
            }
            toast.show({
              title: "Goal status",
              message: formatActiveGoalBlock({
                sessionID,
                sessionAgent: agent.name,
                actorAgent: agent.name,
              }).replace(/<\/?active-goal>/g, "").trim(),
              variant: "info",
              duration: 8000,
            })
          })
          .catch((error) => {
            toast.show({ title: "Loop command failed", message: errorMessage(error), variant: "error" })
          })
      } else if (rest.startsWith("set ")) {
        // /loop set <description> — set goal + init board
        const description = rest.slice(4).trim()
        if (!description) {
          toast.show({ title: "Loop", message: "Usage: /loop set <description>", variant: "warning" })
          return true
        }
        void import("@arcana/core/session/goal")
          .then(({ setSessionGoal }) => {
            setSessionGoal(sessionID, { goal: description, status: "in_progress" })
            toast.show({ title: "Goal set", message: description, variant: "success" })
            // Trigger loop start via session.command
            void sdk.client.session.command({
              sessionID,
              command: "loop",
              arguments: description,
              agent: agent.name,
              model: `${selectedModel.providerID}/${selectedModel.modelID}`,
              variant,
            })
          })
          .catch((error) => {
            toast.show({ title: "Loop command failed", message: errorMessage(error), variant: "error" })
          })
      } else if (rest === "done" || rest === "blocked" || rest === "stale") {
        // /loop done|blocked|stale — mark goal status
        const status = rest as "done" | "blocked" | "stale"
        void import("@arcana/core/session/goal")
          .then(({ getSessionGoal, setSessionGoal }) => {
            const snap = getSessionGoal(sessionID)
            if (snap.status === "unset") {
              toast.show({ title: "Loop", message: "No active goal to mark " + status, variant: "warning" })
              return
            }
            const mapped = status === "done" ? "complete_unverified" as const
              : status === "blocked" ? "blocked" as const
              : "stale" as const
            setSessionGoal(sessionID, { goal: snap.goal, status: mapped })
            toast.show({ title: "Goal marked", message: mapped, variant: "success" })
          })
          .catch((error) => {
            toast.show({ title: "Loop command failed", message: errorMessage(error), variant: "error" })
          })
      } else {
        // /loop <text> — auto-set goal from text
        const text = rest
        if (!text) {
          toast.show({ title: "Loop", message: "Usage: /loop <what to do>", variant: "warning" })
          return true
        }
        void import("@arcana/core/session/goal")
          .then(({ getSessionGoal, setSessionGoal }) => {
            const snap = getSessionGoal(sessionID)
            if (snap.status === "unset") {
              // Use the FULL text as the goal so /loop status shows the actual objective.
              // The CLI also uses full text for goal display (run.ts:813).
              setSessionGoal(sessionID, { goal: text, status: "in_progress" })
              const display = text.length > 120 ? text.slice(0, 117) + "…" : text
              toast.show({ title: "Goal auto-set", message: display, variant: "success" })
            }
          })
          .catch((error) => {
            toast.show({ title: "Loop command failed", message: errorMessage(error), variant: "error" })
          })
      }
```

**Step 3: Remove the old condition that lumps /loop with /goal**

The old code at line 1042: `const isLocalGoal = slashName === "goal" || slashName === "loop"` — change to just `const isLocalGoal = slashName === "goal"`. Loop is no longer a "local goal" command.

**Step 4: Commit**

```bash
git add packages/tui/src/component/prompt/index.tsx
git commit -m "feat: make /loop independent of /goal in TUI, match CLI behavior"
```

---

### Task 2: Kanban board audit (resolved — no TUI changes needed)

**Objective:** Verify that kanban board functions don't break in the TUI's browser-conditions environment.

**Files:**
- Audited: `packages/arcana/src/agent/kanban.js` (imported by CLI `run.ts:11`)

**Step 1: Audit result**

`initBoard` and `loadBoard` are defined in `packages/arcana/src/agent/kanban.js` and imported ONLY by the CLI (`packages/arcana/src/cli/cmd/run.ts:11`). They use `node:fs` directly — they are CLI-only. Our TUI handler in `prompt/index.tsx` only calls `setSessionGoal` / `getSessionGoal` / `formatActiveGoalBlock` from `@arcana/core/session/goal`, which is available in both environments.

**Decision:** No changes needed. The TUI manages goals via `@arcana/core/session/goal`. The kanban board is a CLI visualization layer (run.ts). The TUI shows goal status via toasts. If kanban visualization is desired in the TUI later, it would be a separate feature (a session-panel tab or a `/kanban` command that loads board data via `session.command`).

---

### Task 3: Strip plain-text lines from slash command input

**Objective:** When the user types a slash command on line 1 followed by plain text on subsequent lines, strip the plain text before processing the slash command. This prevents stray lines from being absorbed into the loop goal. Multi-line `/` commands (e.g. `/loop` on line 1, `/goal` on line 2) are rejected with a toast — the user must submit each separately.

**Files:**
- Modify: `packages/tui/src/component/prompt/index.tsx`

**Step 1: Strip plain-text lines after slash command detection**

In the `/loop` handler (Task 1's output), change `const rest = inputText.slice(5).trim()` to strip trailing plain-text lines:

```tsx
    } else if (inputText.startsWith("/loop")) {
      // Strip trailing plain-text lines so they don't become part of the goal
      const firstNewline = inputText.indexOf("\n")
      const slashLine = firstNewline === -1 ? inputText : inputText.slice(0, firstNewline)
      const trailingText = firstNewline === -1 ? "" : inputText.slice(firstNewline + 1).trim()
      const rest = slashLine.slice(5).trim()

      // Reject multi-slash: user must submit slash commands separately
      const otherSlashLines = trailingText.split("\n").filter(l => l.trimStart().startsWith("/"))
      if (otherSlashLines.length > 0) {
        toast.show({
          title: "Multiple commands",
          message: "Submit each /command separately, not in one message.",
          variant: "warning",
        })
        return true
      }
      
      // Trailing plain text is discarded — only the slash line is processed.
      // The user can send follow-up context in a separate message.
      
      // … Task 1's branch chain continues here unchanged:
      //    if (rest === "" || rest === "status") { … }
      //    else if (rest.startsWith("set ")) { … }
      //    else if (rest === "done" || rest === "blocked" || rest === "stale") { … }
      //    else { … }
```

Apply the same `firstNewline`/`slashLine`/`rest` split to the `/goal` handler
(replacing `const args = inputText.slice(6).trim()` with the same pattern).

**Step 2: Commit**

```bash
git add packages/tui/src/component/prompt/index.tsx
git commit -m "fix: strip plain-text lines from slash command input, reject multi-slash"
```

---

### Task 4: Wire /loop to server-side loop runner

**Objective:** When the TUI sends `/loop set <text>`, the engine actually starts an autonomous loop.

**Files:**
- Modify: `packages/engine/src/cli/cmd/run.ts` (or wherever session.command is handled)

**Step 1: Add loop command handler to session.command endpoint**

When the engine receives `session.command({ command: "loop", arguments: "..." })`, it should:
1. Load the goal state
2. Auto-set goal if unset
3. Start the multi-agent loop runner
4. Stream results back via SSE

```typescript
// In the session.command handler — note: "arguments" is a reserved word in strict mode,
// so destructure with a rename: { command, arguments: argsText }
const { command, arguments: argsText } = input

if (command === "loop") {
  const { startLoopInSession } = await import("../../loop/runner")
  await startLoopInSession(sessionID, {
    objective: argsText,
    lanes: 3,
  })
}
```

**Important:** `arguments` is a reserved identifier in strict mode (ES modules are strict by default). Destructuring `{ arguments }` is a `SyntaxError`. Always rename on destructure: `{ arguments: argsText }`.

**Step 2: Commit**

```bash
git add packages/engine/src/cli/cmd/run.ts
git commit -m "feat: wire TUI /loop to server-side loop runner"
```

---

## Verification

1. Open TUI → type `/loop check PS5 folder` → Goal auto-set toast appears with full text
2. Type `/goal read file` → Goal set to "read file" independently
3. Type `/loop` → Shows current goal status (no goal → "Start one with /loop set...")
4. Type `/loop done` → Marks goal complete
5. Type `/loop set fix all bugs` → Sets goal "fix all bugs"
6. Type `/loop check PS5\nadditional context` (2 lines) → Only "check PS5" is used, trailing text stripped
7. Type `/loop PS5\n/goal read file` (multi-slash) → Toast "Submit each /command separately"

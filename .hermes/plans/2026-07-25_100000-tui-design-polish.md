# TUI Design Audit — Visibility & Readiness Improvements

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Improve TUI chat visibility and professional polish — no redesign. Focus on micro-interactions, status clarity, visual hierarchy, and "readiness" cues users expect from a Grok-class terminal agent.

**Architecture:** All changes in the command-spine shell and its components. No new files. Targeted improvements to 5 interaction points.

**Tech Stack:** SolidJS, OpenTUI, existing spine components.

---

## Full Design Audit

### Issue 1: Streaming has no token-level fidelity — "writing" shimmer is binary

**File:** `spine-chat.tsx` lines 121-127

The `ShimmerText` shows "writing" while `streaming === true`. It's either ON or OFF. There's no progressive feel — no character-by-character animation, no "tokens consumed" counter, no speed indicator. Grok shows a live token counter and pulsing progress.

**Fix:** Add token count to the streaming row when available. If `props.reminders` or metadata provides token info, show it. Simple: just show "●" pulse dots that animate 1→2→3 dots while streaming.

### Issue 2: Tool completion has no "ding" — success is silent

**File:** `spine-entry.tsx` lines 211-233 (header path)

When a tool completes, there's no visual celebration. The header just stops spinning. Tools that succeed should flash green briefly (like Grok's done checkmark). The existing `glowing` effect in `InlineTool` (session/index.tsx line 2158-2165) does this with a 600ms flash — but the spine entry header doesn't have this.

**Fix:** Pass tool completion status to `SpineNode` as a `glow` prop. When a tool transitions from running→completed, flash the header border green for 600ms. Reuse existing pattern.

### Issue 3: Subagent entries show no progress while running

**File:** `spine-mapper.ts` lines 1881-1913, `spine-entry.tsx`

Subagent entries (just made clickable) show a static summary. While the subagent is running, there's no pulse/spinner/indicator — just a dead label. The `SubagentFooter` shows status but only at the bottom.

**Fix:** Add `streaming: true` to subagent entries when the subagent session is still active (not completed). This triggers the `ShimmerText` animation in `SpineNode` for agent entries.

### Issue 4: Keyboard shortcut hints are buried in the status bar

**File:** `command-spine-shell.tsx` lines 316-319 (comment), `session/index.tsx` metrics bar

The comment at line 316-319 says: "◇ ready · 7   j/k:focus  enter:toggle  d:diff  o:details  y:copy footer was duplicating state already shown by the metrics + the gutter rail." The shortcut bar was REMOVED. Users have no visible shortcuts unless they know about the keymap help dialog.

**Fix:** Add a `?` hint in the prompt placeholder or session header. Not a full bar — just a minimal reminder. Or show shortcuts on first session load as a dismissible tip.

### Issue 5: Prompt pulse is invisible on idle

**File:** `spine-prompt.tsx` lines 26-46

The prompt has a 200ms pulse animation but on "idle" state, it shows a static color (`t.spinePrompt`). Only "thinking" and "working" states pulse. The idle prompt feels dead. Grok shows a subtle breathing ✶ marker even when ready.

**Fix:** Add a slow pulse (800ms) for idle state too. Very subtle — just a slight brightness shift.

### Issue 6: User messages have no visual distinction in the spine timeline

**File:** `spine-chat.tsx` lines 96-169

User messages ("ask" kind) have `marginTop={0}` and `border={undefined}`. They blend into the scroll. Assistant messages have a left accent border. The user's messages should feel like they "sent" — a subtle right-aligned feel or different background.

**Fix:** Add `paddingRight={2}` to user messages (creates visual breathing room on the right). No border — just a slight left padding shift.

### Issue 7: Focused entry highlight is too subtle

**File:** `spine-entry.tsx` line 216: `backgroundColor={props.focused ? (t.backgroundElement as any) : undefined}`

When an entry is focused (via j/k navigation), the background changes to `backgroundElement`. This is often nearly identical to the default background. On some themes, the focused state is invisible. Grok uses a subtle left-border highlight.

**Fix:** Add a left border accent to focused entries (not just background). Same as the chat card's left border pattern.

---

## Regression Analysis

**REG-1: Token counter during streaming — no data source.**
The streaming entry receives `text` prop but no token count. The token count is only available after the message completes (in `message.tokens`). **Mitigation:** Use animated pulse dots (purely visual, no data needed). Three dots cycling: ● → ●● → ●●●. Add to plan as "activity dots" instead of token counter.

**REG-2: Tool completion glow needs completion status.**
`SpineNode` doesn't receive completion status. It receives `streaming: boolean`. We need a `glow` prop that the parent sets when a tool recently completed. **Fix:** Add `glow?: boolean` to `SpineNode` props. Set via `createEffect` in `spine-entry.tsx` similar to the `InlineTool` pattern. 600ms timer.

**REG-3: Subagent streaming status needs session lookup.**
`spine-mapper.ts` creates subagent entries but doesn't have access to session completion state at entry creation time. The entry is memoized — it won't update when the subagent finishes. **Fix:** Instead of setting `streaming: true` at creation, compute it reactively in `spine-entry.tsx` by checking `source.sessionID` against `sync.data.session_status`. Or simpler: add `streaming` to the entry and let the memo re-run on session data change. The entry recomputes when `sync.data` changes. Add `streaming: !sessionCompleted(childSessionIDs[0])` — but `childSessionIDs[0]` might be undefined for pending subagents. **Mitigation:** Set `streaming: true` when the subagent session exists but has no completed time. The spine-mapper already has access to `sessions` data (via function params). Check if session exists and has the right state. **Scope decision:** Defer to a follow-up plan — this requires data layer access from the spine mapper that may not be available.

**Workaround:** Add a static "···" ellipsis to the subagent summary while the session is active. Use the same `ShimmerText` pattern as other entries but condition on the subagent session status.

**REG-4: Focused entry border may conflict with existing borders.**
Chat cards already have a left border. Adding another left border on focus would create double borders. **Fix:** Only add focus border to non-chat entries (tools, agents, etc.) that don't already have a left border.

**REG-5: Idle pulse may cause unnecessary re-renders.**
A 800ms `setInterval` for the idle pulse is a new timer. The existing prompt pulse already runs at 200ms. **Fix:** Reuse the existing `pulseFrame` signal and add an idle color variation. No new timer needed.

---

## Files

| Action | Path | ~Lines |
|---|---|---|
| Modify | `packages/tui/src/shell/command-spine/spine-prompt.tsx` | +2 lines (idle pulse) |
| Modify | `packages/tui/src/shell/command-spine/spine-chat.tsx` | +8 lines (activity dots, user message padding) |
| Modify | `packages/tui/src/shell/command-spine/spine-entry.tsx` | +8 lines (tool glow, focus border) |

---

## Bite-Sized Tasks

### Task 1: Add idle breathing pulse to prompt marker (2 min)

**File:** `packages/tui/src/shell/command-spine/spine-prompt.tsx`

Line 45: currently returns static color for idle. Add subtle pulse:

```typescript
// Current line 45:
    return (t.spinePrompt ?? t.primary) as any

// Replace with:
    // Idle: slow breathing pulse (800ms cycle via slower frame variation)
    const idleFrames = [t.spinePrompt, t.spineBrand, t.spineBrand, t.spinePrompt]
    return (idleFrames[pulseFrame()] ?? t.spinePrompt ?? t.primary) as any
```

**Verification:** Prompt ✶ marker subtly pulses even when idle.

**Commit:**
```bash
git add packages/tui/src/shell/command-spine/spine-prompt.tsx
git commit -m "tui: add idle breathing pulse to prompt marker"
```

---

### Task 2: Add activity dots during streaming (3 min)

**File:** `packages/tui/src/shell/command-spine/spine-chat.tsx`

After the `<ShimmerText text="writing" ... />` at line 121-127, add activity dots:

```typescript
          <Show when={streaming() && !elapsedText()} keyed>
            <ShimmerText
              text="writing"
              active={true}
              background={(cardBg() ?? t.background) as any}
            />
          </Show>
          {/* Activity dots — visual pulse while streaming */}
          <Show when={streaming()} keyed>
            <ActivityDots />
          </Show>
```

Wait — I need an `ActivityDots` component. Simpler: inline the dots with the existing pulse timer. Actually, the simplest approach: add a `setInterval` similar to the prompt's pulse inside `SpineChatCard`.

But adding state to `SpineChatCard` makes it more complex. Instead, use CSS/OpenTUI animation. But OpenTUI doesn't support CSS animations.

Simplest approach: just alternate between "●", "●●", "●●●" in a `setInterval`. Add at top of `SpineChatCard`:

```typescript
  const [dotFrame, setDotFrame] = createSignal(0)
  onMount(() => {
    const timer = setInterval(() => setDotFrame(f => (f + 1) % 3), 400)
    onCleanup(() => clearInterval(timer))
  })
```

And in the JSX:
```typescript
          <Show when={streaming()} keyed>
            <text fg={speakerColor()}>
              {"●".repeat(dotFrame() + 1)}
            </text>
          </Show>
```

**Verification:** During assistant streaming, activity dots pulse next to the "writing" shimmer.

**Commit:**
```bash
git add packages/tui/src/shell/command-spine/spine-chat.tsx
git commit -m "tui: add activity dots during streaming"
```

---

### Task 3: Add user message right padding (1 min)

**File:** `packages/tui/src/shell/command-spine/spine-chat.tsx`

Line 107: `paddingLeft={isAssistant() ? 2 : 1}`. User messages get less left padding. Add right padding:

```typescript
// Current line 107-110:
      paddingLeft={isAssistant() ? 2 : 1}
      paddingRight={1}
      paddingTop={isAssistant() ? 1 : 0}
      paddingBottom={isAssistant() ? 1 : 0}

// Replace paddingRight line:
      paddingRight={isUser() ? 2 : 1}
```

**Verification:** User messages have slight right indent, visually distinct from assistant.

**Commit:**
```bash
git add packages/tui/src/shell/command-spine/spine-chat.tsx
git commit -m "tui: add right padding to user messages for visual distinction"
```

---

### Task 4: Add completion glow to tool entries (3 min)

**File:** `packages/tui/src/shell/command-spine/spine-entry.tsx`

Add a `glow` effect when tool transitions from running→completed. Use the existing pattern from `InlineTool` (session/index.tsx lines 2158-2165).

Add state and effect at top of `SpineEntry`:

```typescript
  const [glowing, setGlowing] = createSignal(false)
  const wasStreaming = createMemo(() => streaming())

  createEffect(() => {
    if (wasStreaming() && !streaming() && !isChatProse()) {
      setGlowing(true)
      const timer = setTimeout(() => setGlowing(false), 600)
      return () => clearTimeout(timer)
    }
  })
```

Wait — `streaming` is already passed as a prop. I need to track the transition. Use `on()` to watch the change:

```typescript
  createEffect(
    on(
      () => props.streaming,
      (current, previous) => {
        if (previous === true && current === false && !isChatProse()) {
          setGlowing(true)
          const timer = setTimeout(() => setGlowing(false), 600)
          onCleanup(() => clearTimeout(timer))
        }
      },
    ),
  )
```

Then use `glowing` in the header border — add `borderColor={glowing() ? (t.spineOk as any) : ...}` to the header row. But the header border is already set by `SpineRail`. 

Simpler: add a subtle border glow to the entry container. In the return JSX, where the entry box is rendered (around line 190):

```typescript
    <Show when={!entry().hidden}>
      <box
        border={glowing() ? ["left"] : undefined}
        borderColor={glowing() ? (t.spineOk as any) : undefined}
      >
```

But this would wrap all entry content. Better: pass `glowing` to `SpineRail` as a color override.

Actually, the simplest approach: don't add a new prop — just pulse the rail color. Pass `glowing` through `SpineRail`'s existing `active`/`color` props. The rail already has color and active props.

Looking at line 220: `<SpineRail layout={props.layout} kind={kind()} glyph={headerGlyph()} active={props.focused} />`. I can pass `color` prop if available.

Let me check `SpineRail` props... Actually, simpler: just wrap the entry in a box with a left border that flashes green:

```typescript
// After the current entry wrapper at line 189-190:
  return (
    <Show when={!entry().hidden}>
      <box
        borderLeft={glowing()}
        borderColor={glowing() ? (t.spineOk as any) : undefined}
      >
        {/* existing content */}
      </box>
    </Show>
```

Wait — but there's no `borderLeft` prop. There's `border={["left"]}`. Let me use `border`:

```typescript
    <Show when={!entry().hidden}>
      <box
        border={glowing() ? (["left"] as any) : undefined}
        borderColor={glowing() ? (t.spineOk as any) : undefined}
      >
```

This adds a left border that flashes green for 600ms when streaming stops.

**Verification:** When a tool finishes, its entry flashes a green left border briefly.

**Commit:**
```bash
git add packages/tui/src/shell/command-spine/spine-entry.tsx
git commit -m "tui: add completion glow flash to tool entries"
```

---

### Task 5: Build and verify (2 min)

```bash
cd L:/PROJECTS/arcana && bun run build
```

Expected: 8/8 successful.

```bash
git push
```

---

## Risks

1. **Activity dots timer may leak.** `onMount` + `setInterval` with `onCleanup` — follows existing pattern in `spine-prompt.tsx`. ✅
2. **`on` import may need adding.** `on` from solid-js is already imported in spine-entry.tsx? Let me check... spine-entry.tsx imports: `import { batch, createEffect, createMemo, createSignal, For, Match, on, onCleanup, onMount, Show, Switch, untrack } from "solid-js"` — yes, `on` is imported. ✅
3. **Completion glow doesn't work if `streaming` is never true.** Some tools may complete without a streaming phase. The effect watches `props.streaming` transitioning from true→false. If streaming is never set, no glow. **Acceptable — most tools have a running/streaming phase.**

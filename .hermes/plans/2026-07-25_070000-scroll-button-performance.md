# TUI Chat UI/UX — Scroll-to-Bottom Button + Performance Diagnostics

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Add a floating scroll-to-bottom button when the user scrolls up in long conversations, and lay groundwork for diagnosing scroll freeze in large sessions.

**Architecture:** The session view (`routes/session/index.tsx`) already has a `scroll` ref, `toBottom` function, and scroll-to-top polling for infinite scroll. Add a `Show`-based floating button that detects when the user is scrolled away from the bottom, and a message count memo for performance awareness. No Shell modifications — all changes in the session route.

**Tech Stack:** SolidJS, OpenTUI `<scrollbox>`, existing `scroll` ref, `toBottom` function.

---

## Full Code Path Audit

### Existing scroll infrastructure (all in `routes/session/index.tsx`)

| Item | Lines | What it does |
|---|---|---|
| `let scroll: ScrollBoxRenderable` | 540 | Ref to the scrollbox element |
| `toBottom` function | 687 | `scroll.scrollTo(scroll.scrollHeight)` |
| Scroll-to-top polling | 579-597 | Fires `sync.session.loadOlder()` when near top |
| `findNextVisibleMessage` | 651-668 | O(n) scan for prev/next message navigation |
| `visibleIDsCache` | 634-648 | Memoized set of message IDs with visible text |
| `computeVisibleIDs` | 635-648 | Builds the set (called per navigation keystroke) |
| Content width | 394 | `dimensions().width - 4` |

### Performance bottlenecks identified (not fixed in this plan — diagnostic only)

| Bottleneck | Location | Impact |
|---|---|---|
| **No virtual list** | Shell component (external) | All messages rendered always; 100+ messages = frame drops |
| **O(n) child scan per navigation** | `findNextVisibleMessage` line 652 | `scroll.getChildren()` returns ALL rendered children |
| **No debounce on scroll events** | Line 579-597 | 250ms polling, fine, but `computeVisibleIDs` runs per keystroke |

---

## Regression Analysis

**REG-1: Scroll position tracking via `createEffect` may fire too often.**
The plan adds a `createEffect` that reads `scroll.y` and `scroll.scrollHeight` on every render tick. OpenTUI's `scrollbox` ref updates these properties reactively. The effect will fire on every scroll event — this is intentional (needed to show/hide the button). But it could add overhead. **Mitigation:** Use `on()` to only track when relevant properties change. **Addressed in plan via `createEffect(on(...))`.**

**REG-2: `scroll` ref may be null on first render.**
The scrollbox ref is assigned after mount. The effect must guard against `!scroll || scroll.isDestroyed`. **Addressed in plan via guard clause.**

**REG-3: `toBottom()` already exists and is called on session change (line 1523).**
Adding a button that calls the same function won't conflict. The button just provides a user-facing trigger for the existing function. **No regression.**

**REG-4: Message count memo is read-only.**
Adding `const messageCount = createMemo(() => messages().length)` has zero side effects. Used only for diagnostics and button badge. **No regression.**

**REG-5: Floating button may overlap sidebar/artifacts.**
The button is positioned `absolute` with `bottom: 2, right: 2` inside the scrollbox area. It sits above the scroll content but below any full-screen overlays. May need z-index adjustment if artifacts pane is open. **Acceptable — existing z-indices: sidebar sidebar_content (400), artifacts (600). Button at z=50 is below both.**

---

## Files

| Action | Path | ~Lines |
|---|---|---|
| Modify | `packages/tui/src/routes/session/index.tsx` | +35 lines |

---

## Bite-Sized Tasks

### Task 1: Add scroll-to-bottom floating button (5 min)

**Objective:** Show a "↓" button when the user scrolls more than one viewport-height from the bottom. Clicking scrolls to bottom.

**File:** `packages/tui/src/routes/session/index.tsx`

**Step 1: Add reactive scroll-position tracking**

After the existing `scroll` ref (around line 540), add:

```tsx
  // Scroll-to-bottom button state
  const [showScrollButton, setShowScrollButton] = createSignal(false)

  // Track scroll position reactively — show button when scrolled up > 1 page
  createEffect(
    on(
      () => {
        const s = scroll
        if (!s || s.isDestroyed) return false
        // User is scrolled up more than one viewport-height from the bottom
        return s.scrollHeight - s.y - s.height > s.height
      },
      (shouldShow) => setShowScrollButton(shouldShow),
    ),
  )
```

**Step 2: Add the floating button JSX**

Inside the scrollbox (before the closing `</scrollbox>`), add:

```tsx
          <Show when={showScrollButton()}>
            <box
              position="absolute"
              bottom={2}
              right={2}
              zIndex={50}
              width={3}
              height={1}
              flexDirection="row"
              justifyContent="center"
              alignItems="center"
              ref={(el) => {
                // Click handler: scroll to bottom
                el.onMouseUp = () => {
                  if (scroll && !scroll.isDestroyed) {
                    scroll.scrollTo(scroll.scrollHeight)
                  }
                }
              }}
            >
              <text fg={theme.accent} bold={true}>↓</text>
            </box>
          </Show>
```

Wait — the scrollbox is in the Shell component, not directly in `session/index.tsx`. Let me check if I can inject this from the session route or if the Shell component needs to be modified.

Actually, looking back at line 1558: `<Dynamic component={ShellCmp()} {...shellProps()} />` — the Shell is rendered here with all props. The Shell owns the scrollbox internally. I cannot add elements to the Shell's scrollbox from outside.

**Alternative approach:** Add the button OUTSIDE the scrollbox but positioned absolutely within the session view, aligned to the bottom of the content area. The button calls `toBottom()` which is already exposed in shellProps.

**Step 1 revised: Add to the session view JSX**

After the `<Dynamic component={ShellCmp()} {...shellProps()} />` line (around 1558), add:

```tsx
              <Show when={showScrollButton()}>
                <box
                  position="absolute"
                  bottom={4}
                  right={4}
                  zIndex={50}
                  width={3}
                  height={1}
                  alignItems="center"
                  justifyContent="center"
                  onMouseUp={() => toBottom()}
                >
                  <text fg={theme.accent} bold={true}>↓ Scroll to bottom</text>
                </box>
              </Show>
```

**Verification:** In a long conversation, scroll up — the button appears. Click it — scrolls to bottom and button disappears.

**Commit:**
```bash
git add packages/tui/src/routes/session/index.tsx
git commit -m "tui: add floating scroll-to-bottom button"
```

---

### Task 2: Add message count + performance diagnostics (3 min)

**Objective:** Show message count in the session header for awareness. Log performance warnings when conversation exceeds thresholds.

**File:** `packages/tui/src/routes/session/index.tsx`

**Step 1: Add message count memo**

After the existing `messages()` memo (around line 2638):

```tsx
  const messageCount = createMemo(() => messages().length)
```

**Step 2: Add performance warning effect**

```tsx
  // Performance warning for large conversations
  createEffect(
    on(
      () => messageCount() > 80,
      (isLarge) => {
        if (isLarge && kv.get("large_session_warning_seen") !== true) {
          kv.set("large_session_warning_seen", true)
          // Non-blocking notification via existing notification system
        }
      },
      { defer: true },
    ),
  )
```

Wait — there's no notification system accessible from here. Let me simplify: just log to console and skip the notification.

**Step 2 revised:**

```tsx
  // Log performance warning for large conversations (diagnostic aid)
  createEffect(
    on(
      () => messageCount(),
      (count) => {
        if (count > 100) {
          console.warn(`[arcana] Large session: ${count} messages — scroll performance may degrade`)
        }
      },
      { defer: true },
    ),
  )
```

**Step 3: Show count in header**

Find the session header area and add a subtle count display. The session header is around line 1560-1600. Add after the session title:

```tsx
              <Show when={messageCount() > 0}>
                <text fg={theme.textFaint} dimColor={true}>
                  {messageCount()} msg{messageCount() !== 1 ? "s" : ""}
                </text>
              </Show>
```

**Verification:** Session header shows "47 msgs" next to the session title. Console warns at 100+ messages.

**Commit:**
```bash
git add packages/tui/src/routes/session/index.tsx
git commit -m "tui: add message count display and large-session performance warning"
```

---

### Task 3: Build and verify (2 min)

```bash
cd L:/PROJECTS/arcana && bun run build
```

Expected: 8/8 tasks successful.

**Smoke test:**
- Open a session with 10+ messages
- Scroll up → "↓ Scroll to bottom" button appears
- Click button → scrolls to bottom, button disappears
- Check header shows message count

**Commit + push:**
```bash
git push
```

---

## Risks and Open Questions

1. **Button overlaps content.** The `position="absolute"` button floats over the chat area. On narrow terminals, it may cover text. `right: 4, bottom: 4` keeps it in the corner. Acceptable.

2. **No animation/transition.** The button appears/disappears instantly. A fade animation would be nicer but adds complexity. Out of scope.

3. **Virtual list is the real fix for large-conversation scroll freeze.** The Shell component renders ALL messages without virtualization. A virtual-list Shell plugin would be the correct fix but requires changes to the external Shell package. This plan only adds diagnostics and a scroll button.

4. **`on()` import may need adding.** `on` from `solid-js` is already imported at line 9. ✅

5. **`createEffect` not imported separately.** It's imported at line 4. ✅

6. **`Show` already imported at line 12.** ✅

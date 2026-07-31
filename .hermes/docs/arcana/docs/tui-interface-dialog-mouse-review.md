# Arcana TUI interface and dialog mouse QA review

- **Date:** 2026-07-14
- **Scope:** `packages/tui` interface structure, dialog transitions, mouse wheel routing, and click interaction
- **Method:** static code review only; no install, build, test, or runtime mutation was performed

## Outcome

**Current state:** mouse-wheel scrolling works. This was confirmed during QA, and the current `DialogSelect` source contains both a bounded `scrollbox` and an explicit wheel handler.

**Historical regression:** the code and change-log evidence point to the dialog overlay edit, not the renderer bootstrap or the timeline-to-message transition. `DialogProvider` always mounts an absolute wrapper at `zIndex={3000}` and conditionally mounts only the dialog below it. The M18 change recorded in `docs/qa-fixes-2026-07-10.md` added full-terminal bounds to that wrapper. In that shape, the wrapper remains a full-screen mouse hit surface even when the dialog stack is empty, so it can intercept clicks and wheel events intended for the visible route below it.

The current tree no longer gives the always-mounted provider wrapper those full-screen bounds, which is consistent with the repaired behavior. If a dialog overlay needs explicit viewport geometry in the future, the geometry and the overlay's mounted lifetime must change together. The required invariant is:

> The modal mouse surface is full-viewport while a dialog is open and absent while no dialog is open.

There is a separate, still-present pointer defect in `DialogMessage`: its action rows respond to hover and keyboard activation but have no click handler. That issue should be fixed and tested independently; it is not the cause of the now-resolved wheel regression.

## Current interface assessment

| Area | Assessment | Evidence |
| --- | --- | --- |
| Rendering and state | Strong | Solid signals/stores are separated from the OpenTUI renderables, and the SDK/sync substrate remains outside the presentation shell. |
| Session architecture | Strong | `resolveShell()` cleanly selects `command-spine` or the `opencode` fallback without changing persisted session data. |
| Command Spine identity | Strong but incomplete | The normalized spine model, receipts, responsive layouts, and prompt attachment are implemented. The header is currently passed an empty segment list, so normal model/project/context information is absent. |
| Keyboard interaction | Strong | Dialogs enter a modal keymap layer, most dialog actions have keyboard commands, and focus is restored after the stack clears. |
| Mouse interaction | Working but inconsistent | Wheel scrolling is currently working. Core lists and spine rows have handlers, but `DialogMessage` action rows still lack click activation and the provider overlay remains easy to regress through an unsafe geometry edit. |
| Overflow and narrow terminals | Partial | Main session containers generally use `minHeight={0}` and bounded scrollboxes. Several dialogs and the artifact viewer render potentially long content without a scrollbox. |
| Regression coverage | Weak around modals | Existing mouse tests cover spine entries. Existing dialog tests cover prompt keyboard submission, but not dialog wheel, click, replacement, backdrop, or focus restoration. |

## Render and input topology

```text
CliRenderer
  useMouse = !ARCANA_DISABLE_MOUSE && config.mouse
  config.mouse defaults to true
        |
        v
App root (terminal-sized mouse/copy surface)
  +-- Home
  |     +-- Prompt
  |     `-- Toast
  +-- Session
  |     +-- selected shell
  |     |     +-- transcript scrollbox
  |     |     `-- prompt
  |     `-- Toast
  +-- Plugin route
  |     `-- plugin surface (no global Toast render)
  `-- DialogProvider wrapper, always mounted, z=3000
        `-- Show when stack is non-empty
              `-- Dialog full-screen backdrop
                    `-- panel
                          +-- DialogSelect: scroll + row clicks
                          `-- DialogMessage: hover + keyboard only
```

The provider wrapper currently has no explicit `width`, `height`, `left`, or `top`, so it is not the historical full-terminal shield. The fragile part is the mismatch in lifetime: the wrapper exists all the time, but the modal content exists only while the stack is non-empty.

OpenTUI routes a wheel or click event to the renderable hit at the pointer position and then bubbles it through that renderable's ancestors. A full-screen provider wrapper above the route becomes the hit target; it is not an ancestor of the route's scrollbox or controls, so the event cannot bubble into them.

## Findings

### High — the historical full-screen provider wrapper swallowed route input

**File:** `packages/tui/src/ui/dialog.tsx`

The provider renders its wrapper unconditionally and puts only the `Dialog` child inside `Show`:

```tsx
<box position="absolute" zIndex={3000} onMouseDown={...} onMouseUp={...}>
  <Show when={value.stack.length}>
    <Dialog ... />
  </Show>
</box>
```

The wrapper currently has no explicit viewport dimensions. The historical M18 entry says `width="100%"`, `height="100%"`, `left={0}`, and `top={0}` were added to it. Adding those properties without also making the wrapper conditional creates this state:

| Dialog stack | Visible modal | Provider mouse surface | Result |
| --- | --- | --- | --- |
| Non-empty | Yes | Full terminal | Correct modal isolation |
| Empty | No | Still full terminal | Invisible surface can intercept route wheel and clicks |

That lifetime/geometry mismatch is the code-supported explanation for the historical report that editing dialog files broke both wheel scrolling and click interaction. The current absence of those bounds matches the operator-confirmed repair.

The robust shape is one of:

1. mount a full-viewport wrapper only inside `Show when={value.stack.length > 0}`; or
2. remove the extra wrapper and put selection behavior on the already full-viewport `Dialog` root or panel.

Do not restore full-screen dimensions to an input-capable wrapper that remains mounted between dialogs.

### Medium — `DialogMessage` actions do not activate on click

**Files:**

- `packages/tui/src/routes/session/dialog-timeline.tsx`
- `packages/tui/src/routes/session/dialog-message.tsx`
- `packages/tui/src/ui/dialog-select.tsx`

`DialogTimeline` supplies an option-level `onSelect` that synchronously replaces `DialogSelect` with `DialogMessage`. The source view has all of the following:

- a bounded `scrollbox`;
- an explicit `onMouseScroll` handler;
- row `onMouseDown`, `onMouseOver`, `onMouseMove`, and `onMouseUp` handlers.

The destination view has only this pointer behavior on each action row:

```tsx
onMouseOver={() => setFocused(i())}
```

Consequences:

- hovering changes the highlighted action;
- Enter executes the highlighted action;
- clicking the highlighted action does nothing.

The fixed five-action rail does not need to scroll, so its lack of a scrollbox is not evidence for the repaired wheel regression. It does need the same click contract as other actionable rows: focus on mouse-down and activate exactly once on left mouse-up.

### High — long modal and artifact content has no scrolling owner

**Files:**

- `packages/tui/src/ui/arcana.tsx`
- RunProof dialog components in `packages/tui/src/app.tsx`
- `packages/tui/src/ui/dialog-help.tsx`
- `packages/tui/src/routes/session/artifact-viewer.tsx`

`ArcanaSurface` is a plain box, yet the RunProof Actions, Contract, Verify, and Diff Gate surfaces can contain an unbounded number of events, checks, file operations, and evidence records. `DialogHelp` is also a fixed content column. `ArtifactViewer` renders code/text directly into a flex box.

On a short terminal or with a large record, content can be clipped and the wheel has no scrollbox to operate. This is the same user-visible symptom as failed wheel routing, but it is a content-container defect.

**Recommendation:** standardize a dialog body primitive with a bounded header/footer and a flex-growing scrollbox. Use the same primitive for proof surfaces and help. Give the artifact viewer its own content scrollbox.

### High — no regression test crosses a dialog replacement with the mouse

**Files:**

- `packages/tui/test/cli/tui/dialog-prompt.test.tsx`
- `packages/tui/test/spine-entry-interaction.test.tsx`

The dialog prompt tests assert keyboard submission. The mouse tests assert hover/right-click behavior on `SpineEntry`. No test currently does any of the following:

- scroll a `DialogSelect` with `mockMouse`;
- click a dialog row;
- replace one dialog from a mouse event;
- click the replacement dialog;
- verify that an empty dialog provider does not intercept its sibling UI;
- close a dialog and verify restored focus;
- exercise backdrop versus panel propagation.

This gap allowed an unsafe overlay edit and keyboard-correct but mouse-incomplete dialogs to pass QA.

### Medium — toast rendering is route-local instead of application-global

**Files:**

- `packages/tui/src/routes/home.tsx`
- `packages/tui/src/routes/session/index.tsx`
- `packages/tui/src/app.tsx`

`ToastProvider` is global, but `<Toast />` is rendered separately by Home and Session. A plugin route renders neither component, so a plugin can enqueue a toast that has no mounted visual surface. A route change can also remove the toast surface while the toast remains in the provider store.

**Recommendation:** render one Toast surface next to the route switch or next to the global dialog surface. Keep its existing `zIndex={4000}`.

### Medium — small terminal dialog height can become negative

**File:** `packages/tui/src/ui/dialog-select.tsx`

The list height is calculated as:

```ts
Math.min(rows(), Math.floor(dimensions().height / 2) - 6)
```

At terminal heights below 12 rows, the result can be zero or negative and is passed as `maxHeight`. Invalid or collapsed geometry also means invalid or missing hit regions.

**Recommendation:** clamp the viewport to at least one row after reserving header, filter, footer, and border space. Add static cases for heights 8, 10, 12, and 24.

### Medium — dialog selection copy is stopped at the panel boundary

**File:** `packages/tui/src/ui/dialog.tsx`

The inner panel stops every mouse-up event to prevent backdrop dismissal. The provider-level auto-copy handler is above that panel, so selection mouse-up inside a dialog cannot reach `copySelection()` through normal bubbling.

Backdrop protection is correct, but selection copying and dismissal should not share the same propagation dependency. The panel can perform copy-before-stop, or copy handling can be attached at a layer that receives selection completion without allowing backdrop close.

### Medium — Command Spine responsiveness is implemented but not fully wired

**Files:**

- `packages/tui/src/shell/command-spine/command-spine-shell.tsx`
- `packages/tui/src/shell/command-spine/spine-types.ts`
- `packages/tui/src/shell/command-spine/spine-header.tsx`

`getSpineLayout()` supports hysteresis through its `current` parameter, but the main shell calls it with only the width. The QA change log says all three call sites pass the previous layout; the current main shell does not. Resizing near 80, 100, or 120 columns can therefore toggle layouts without the intended dead zone.

The shell also passes `segments={[] as any}` to `SpineHeader`, leaving its project/model/context machinery unused during normal operation. The statusbar intentionally hides most metrics in command-spine mode unless compaction or pressure is active. The result is strong visual identity but less routine context than the design documents specify.

### Low — close and action affordances are inconsistent

Dialog close labels currently include `esc`, `[esc] close`, `[esc] dismiss`, `Cancel`, and icon/text variants. Many are clickable text without hover or pressed feedback. Keyboard access is generally present, but pointer discoverability differs by dialog.

Standardize close copy and a small button/row interaction state. Keep labels before color so monochrome and low-contrast terminals retain meaning.

## What is not supported as the primary cause

### “Replacing `DialogTimeline` with `DialogMessage` caused the wheel regression”

That transition does expose a separate missing-click defect, but it does not explain route scrolling and clicking failing globally. The current `DialogSelect` wheel path works, and the operator-confirmed regression followed the dialog overlay edit. The always-mounted, high-z-index provider wrapper becoming full-terminal explains both lost wheel events and lost clicks with one geometry/lifetime defect.

### “The full TUI disables mouse input”

That does not match current full-TUI code:

- `packages/tui/src/app.tsx` creates its renderer with `useMouse: !Flag.ARCANA_DISABLE_MOUSE && input.config.mouse`.
- `packages/tui/src/config/index.tsx` resolves `mouse` to `true` by default.

`packages/engine/src/cli/cmd/run/runtime.lifecycle.ts` uses `useMouse: false`, but that is the separate split-footer `arcana run` interface. It should not be used to explain a dialog regression in the full `packages/tui` application.

### “The visible scrollbar fixes wheel routing”

`DialogSelect` renders a visible scrollbar and has a manual wheel handler, and its wheel behavior is currently working. A scrollbar may expose state and the explicit handler may make scrolling deterministic, but neither can receive events through an unrelated full-screen overlay above the route.

### “It is definitely an OpenTUI version regression”

The repository pins OpenTUI 0.3.4, and historical notes discuss Windows behavior. This review did not install or execute the dependency, so no version-level conclusion is justified. The application-level defects above are sufficient to explain the reported behavior without relying on that hypothesis.

## Required interaction invariant

Treat the following as the shared contract for every modal:

| State | Wheel target | Click target | Focus |
| --- | --- | --- | --- |
| No dialog | Route scrollbox/control under pointer | Route control under pointer | Existing prompt/control remains focused |
| Dialog open, pointer on backdrop | No background scroll | Left mouse-up dismisses unless selection just completed | Background control is blurred |
| Dialog open, pointer in panel | Nearest modal scrollbox | Modal row/button | Modal input or selected row |
| Dialog replaced | New modal scrollbox after the next settled frame, if its content overflows | New modal row/button | New modal input/selection |
| Dialog closed | Route scrollbox/control under pointer | Route control under pointer | Previously focused live renderable is restored |

## Regression test plan

Once dependencies are available, add a focused `dialog-mouse-interaction.test.tsx` using OpenTUI's Solid test renderer and `mockMouse`.

1. **Historical regression guard:** mount `DialogProvider` over an underlying scrollbox and button; with an empty stack, assert wheel and click reach the underlying controls. This must remain true if overlay geometry is changed.
2. **Backdrop isolation:** open a dialog; assert backdrop click closes it and panel click does not.
3. **DialogSelect wheel:** use enough options to overflow; point inside the list, send wheel-down, and assert `scrollTop` increases exactly once.
4. **DialogSelect click:** click a visible option and assert its action fires exactly once.
5. **Replacement:** make that option call `dialog.replace()`; settle rendering, then click a control in the new dialog and assert it fires exactly once.
6. **Timeline to message:** reproduce the real `DialogTimeline` to `DialogMessage` path; assert mouse-down focuses an act and left mouse-up executes it.
7. **Focus restoration:** close the replacement dialog and assert the original live prompt regains focus.
8. **Small terminals:** repeat at 60x10 and 80x12; assert non-negative scroll geometry and reachable close/action controls.
9. **Selection:** drag-select inside the panel; assert it neither dismisses the dialog nor loses the configured copy behavior.
10. **Plugin toast:** navigate to a plugin route, show a toast, and assert the toast surface remains visible and dismissible.

For each mouse test, wait for a settled render after mounting and after `dialog.replace()`. Assert state changes such as `scrollTop`, action count, dialog stack length, and focused renderable rather than relying only on snapshots.

## Recommended implementation order

1. Lock the repaired behavior with an empty-stack wheel/click pass-through regression test.
2. If explicit provider bounds are needed, make the full-viewport overlay conditional on a non-empty dialog stack before adding them.
3. Give `DialogMessage` explicit left-click activation and add the replacement test.
4. Introduce a standard scrollable dialog body and migrate unbounded proof/help surfaces.
5. Move Toast to one global render location.
6. Clamp small-terminal dialog geometry.
7. Wire Command Spine hysteresis and contextual header segments.
8. Normalize close/button pointer affordances.

## Review boundary

This document records static, code-supported conclusions. Runtime timing, terminal-specific escape-sequence behavior, and native OpenTUI hit-grid behavior remain verification items until the dependency installation completes and the focused tests can run.

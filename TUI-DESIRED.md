Yes. Your document is already close, but we need to **reinterpret it toward the image**.

The image is not really “Grimoire.” It is closer to **Style B Chronicle**, but more specific:

# Arcana Command Spine

> **Current product surface (2026-07):** Command-spine is the **default** shell. Live chrome is documented in [command-spine-ui.md](.hermes/docs/arcana/docs/architecture/command-spine-ui.md). Summary vs the original image notes below:
>
> - Prompt lead is **`✶` + rounded box with `❯` / `!`** — **not** `arcana ›` on the lead.
> - Brand wordmark lives in the **header**, not the composer.
> - Footer sits **under** the box (content-offset aligned): status left + `key:label` hints.
> - Slash/@ autocomplete is **inline above** the composer.
> - Tight spacing: no rail-only blank stem; 0 blank between box and status.
>
> Prefer the living surface doc for day-to-day work; keep this file as migration intent + historical target.

So the migration should be:

```txt
Old plan name: Chronicle + Grimoire
New visual target: Command Spine Chronicle
```

Your contract already says Arcana must replace the presentation shell while keeping the SDK, sync, theme engine, keymap, and data substrate. That is exactly the right technical strategy. 

## 1. Do not migrate everything at once

The image should become the **default session shell**, not a total rewrite.

Keep:

```txt
@arcana/sdk/v2 message model
context/sync.tsx
context/sdk.tsx
context/event.tsx
theme/index.ts engine
plugin slots
keymap primitives
prompt input core
```

Replace:

```txt
routes/session/index.tsx layout
UserMessage / AssistantMessage rendering
InlineTool / BlockTool presentation
ReasoningPart presentation
statusbar/footer presentation
sidebar presentation
home presentation later
```

Your document already marks those as keep/replace boundaries. 

---

# 2. Rename the implementation target

In the code, I would not call it simply `ChronicleShell`. I would use:

```txt
packages/tui/src/shell/
  index.ts
  types.ts
  opencode-shell.tsx
  command-spine/
    command-spine-shell.tsx
    command-spine-layout.tsx
    spine-gutter.tsx
    spine-node.tsx
    spine-entry.tsx
    spine-receipt.tsx
    spine-diff.tsx
    spine-error.tsx
    spine-prompt.tsx
    spine-status.tsx
```

This matters because **Chronicle** is the broad concept, but the image is specifically **Command Spine**.

Use feature flag:

```ts
tui.shell = "command-spine" | "opencode"
```

Not:

```ts
tui.shell = "chronicle" | "opencode"
```

You can keep `"chronicle"` internally as an alias later, but the product identity should be **Command Spine**.

---

# 3. Map the image into components

The image has five real zones:

```txt
ARCANA brand / context
step index
command spine
execution content
bottom prompt
```

So implement it like this:

```txt
CommandSpineShell
  ├─ SpineHeader
  ├─ SpineViewport
  │   ├─ SpineGutter
  │   ├─ SpineRail
  │   └─ SpineContent
  └─ SpinePrompt
```

Concrete mapping:

| Image element                                             | Component            |
| --------------------------------------------------------- | -------------------- |
| `ARCANA` wordmark                                         | `SpineHeader`        |
| `proj ~/work/arcana branch main mode build model gpt-4.1` | `SpineHeaderContext` |
| left numbers `01, 02, 03...`                              | `SpineGutter`        |
| timestamps / elapsed time                                 | `SpineGutterTime`    |
| vertical glyph rail                                       | `SpineRail`          |
| `ask / plan / patch / run / fail / fix / ok`              | `SpineNode`          |
| user/assistant prose                                      | `SpineEntry`         |
| file change list                                          | `SpineReceipt`       |
| diff excerpt                                              | `SpineDiff`          |
| compiler error                                            | `SpineError`         |
| final summary                                             | `SpineSummary`       |
| `✶` + box (`❯` / `!`) bottom prompt                       | `SpinePrompt`        |

---

# 4. Convert messages into spine entries

Right now, the session is probably rendered like:

```tsx
<For each={messages()}>
  {(message) => (
    <Switch>
      <Match when={message.role === "user"}>
        <UserMessage />
      </Match>
      <Match when={message.role === "assistant"}>
        <AssistantMessage />
      </Match>
    </Switch>
  )}
</For>
```

That is the opencode shape your audit calls out as inherited. 

For Command Spine, convert messages/parts into a normalized view model first:

```ts
type SpineKind =
  | "ask"
  | "plan"
  | "inspect"
  | "patch"
  | "run"
  | "fail"
  | "fix"
  | "ok"
  | "think"
  | "tool"
  | "approval";

type SpineTone =
  | "neutral"
  | "active"
  | "success"
  | "warning"
  | "error"
  | "muted";

type SpineEntry = {
  id: string;
  index: number;
  kind: SpineKind;
  tone: SpineTone;
  actor: "you" | "arcana" | "tool" | "system";
  title?: string;
  summary: string;
  timestamp?: number;
  durationMs?: number;
  parts: SpinePart[];
  expanded?: boolean;
  active?: boolean;
};
```

Then render:

```tsx
<For each={spineEntries()}>
  {(entry) => (
    <SpineEntryView entry={entry} />
  )}
</For>
```

This is the important architecture change: **do not directly render SDK messages as chat messages anymore.**
Render a new Arcana view model.

---

# 5. Build a mapper layer

Create:

```txt
packages/tui/src/shell/command-spine/spine-mapper.ts
```

It should transform current message/part data into the visual structure.

Example:

```ts
export function messagesToSpineEntries(messages: Message[]): SpineEntry[] {
  const entries: SpineEntry[] = [];

  for (const message of messages) {
    if (message.role === "user") {
      entries.push(userMessageToAskEntry(message));
      continue;
    }

    if (message.role === "assistant") {
      entries.push(...assistantMessageToSpineEntries(message));
    }
  }

  return assignIndexesAndState(entries);
}
```

Assistant parts become:

```txt
text part      → plan / summary / ok
tool part      → inspect / patch / run / fail / fix
reasoning part → think, collapsed by default
diff output    → patch + SpineDiff
shell output   → run / fail / ok
```

This lets you keep the underlying SDK but completely change the presentation.

---

# 6. Replace tool cards with receipts

Your audit says InlineTool / BlockTool are still opencode card patterns. 

For the image, tools should become **receipts**, not cards.

Old:

```txt
[icon] Running command...
expanded bordered output
```

New:

```txt
run   cargo test --workspace
      ✓ 122 passed   0 failed   0 ignored        finished in 4.12s
```

Implement:

```txt
spine-receipt.tsx
spine-tool-receipt.tsx
spine-command-receipt.tsx
spine-file-receipt.tsx
spine-test-receipt.tsx
```

Tool receipt structure:

```ts
type SpineReceipt = {
  label: string;
  command?: string;
  file?: string;
  stats?: {
    added?: number;
    removed?: number;
    passed?: number;
    failed?: number;
    ignored?: number;
    duration?: string;
  };
  status: "pending" | "ok" | "fail" | "denied";
};
```

---

# 7. Use subtle artifact surfaces only for code/diff/error

The image works because most of the UI is **not boxed**, but code/error areas have enough separation.

So the rule should be:

```txt
prose      no box
file list  aligned text
commands   one-line receipt
diff       subtle code surface
error      subtle red-tinted surface
prompt     attached to spine, no big input box
```

Theme tokens should support that:

```ts
commandSpine: string;
commandSpineActive: string;
commandSpineMuted: string;

spineAsk: string;
spinePlan: string;
spinePatch: string;
spineRun: string;
spineFail: string;
spineFix: string;
spineOk: string;

artifactSurface: string;
artifactBorder: string;
errorSurface: string;
diffRemovedSurface: string;
diffAddedSurface: string;
```

Your contract already planned additive theme tokens and fallback-safe changes, which is the right method. 

---

# 8. Migration phases adjusted to the image

Use this sequence.

## Phase 0 — Shell flag, no visual change

Create:

```txt
packages/tui/src/shell/index.ts
packages/tui/src/shell/types.ts
packages/tui/src/shell/opencode-shell.tsx
packages/tui/src/shell/command-spine/command-spine-shell.tsx
```

Wire:

```ts
const shell = config.tui.shell ?? "opencode";
```

Do not change visuals yet.

---

## Phase 1 — Static Command Spine prototype

Render fake/sample entries first.

Goal: prove layout.

```txt
ARCANA               proj ~/work/arcana + branch main + mode build + model gpt-4.1

01 ask
02 plan
03 patch
04 run
05 fail
06 fix
07 run
08 ok
```

No real message integration yet.

---

## Phase 2 — Message mapper

Convert real `Message[]` into `SpineEntry[]`.

This is where the opencode transcript dies.

The old single-column chat renderer should become a compatibility shell only.

---

## Phase 3 — Tool receipts

Replace:

```txt
InlineTool
BlockTool
InlineToolRow
```

With:

```txt
SpineToolReceipt
SpineCommandReceipt
SpineFileReceipt
SpineDiffReceipt
SpineErrorReceipt
```

Keep old tool components only inside `opencode-shell`.

---

## Phase 4 — Diff/error polish

Implement the exact image behavior:

```txt
patch
  file changed list
  inline split diff excerpt

fail
  compiler error
  source location
  one highlighted line
  caret underline
```

Do not render giant diff blocks by default. Default should be compact. Expand on enter.

---

## Phase 5 — Prompt attached to spine

Keep `component/prompt/index.tsx` core, but replace the shell around it.

**Shipped target (supersedes image-era `✶ arcana ›`):**

```txt
✶   ┌──────────────────────────────┐
    │ ❯  <input>            model  │
    └──────────────────────────────┘
```

- Rail terminal: `✶` (state-colored).
- Box lead: `❯` / shell `!` — no brand string on the lead.
- Implementation: `spine-prompt.tsx` + `Prompt` with `variant="command-spine"`.

It wraps the existing prompt input core but renders it as the final spine node.

---

## Phase 6 — Status/header/footer cleanup

Replace the opencode footer/statusbar with a minimal line **under the composer**.

```txt
status / pending…          enter:send  …key:label
```

Optional context chips (project, branch, mode, model) belong in the **header** or sparse status — not a dashboard bar.

No token HUD. No crowded footer. No permanent "proof tape" brand word except on wide layouts while active (see command-spine-ui).

---

# 9. Small terminal behavior

Important: this design can break on narrow terminals if you keep the diff visible.

Rules:

```txt
>= 120 cols  show split diff excerpt
100-119 cols show compact unified diff
80-99 cols   collapse diff to file stats + "enter expand"
<80 cols     fallback to compact Zen/ledger row
```

This aligns with your contract’s risk note about narrow terminals and Windows Terminal. 

---

# 10. Acceptance criteria for the image migration

Use this checklist:

```txt
[ ] Default shell no longer renders UserMessage / AssistantMessage chat layout.
[ ] Session renders as Command Spine entries.
[ ] Prompt is attached to final spine node.
[ ] Tool calls render as receipts, not cards.
[ ] Diffs render as compact excerpts, not full opencode diff blocks by default.
[ ] Error output has distinct red artifact surface.
[ ] Reasoning is folded into a small spine entry.
[ ] Header/footer no longer look like opencode.
[ ] Feature flag can return to old shell.
[ ] Existing message/session data unchanged.
[ ] Existing slash commands/keybinds still work.
[ ] 80-col fallback works.
[ ] Snapshot tests exist for command-spine shell.
```

Your document already says rollback should be a feature flag flip with no persisted-state migration, and that is exactly how this should ship. 

---

# Coding-agent prompt

Use this:

```txt
Implement the Arcana Command Spine shell based on TUI-MIGRATION-CONTRACT.md.

Important: the target is not generic Chronicle + Grimoire. The visual target is the attached Command Spine image.

Keep the existing SDK/message/sync/theme/keymap substrate. Do not rewrite the data model, prompt input core, SDK, sync, or theme engine.

Create a shell abstraction under packages/tui/src/shell/ with:
- opencode-shell.tsx
- command-spine/command-spine-shell.tsx
- command-spine/spine-mapper.ts
- command-spine/spine-gutter.tsx
- command-spine/spine-rail.tsx
- command-spine/spine-entry.tsx
- command-spine/spine-receipt.tsx
- command-spine/spine-diff.tsx
- command-spine/spine-error.tsx
- command-spine/spine-prompt.tsx
- command-spine/spine-header.tsx

Add feature flag:
tui.shell = "command-spine" | "opencode"

Phase 0:
Wrap the current opencode session shell behind the shell abstraction with no visual change.

Phase 1:
Implement CommandSpineShell using sample static entries only.

Phase 2:
Implement messagesToSpineEntries(messages) to map user/assistant/tool/reasoning parts into spine entries.

Phase 3:
Replace tool card presentation in the command-spine shell with compact receipts:
ask, plan, inspect, patch, run, fail, fix, ok.

Do not modify old InlineTool/BlockTool behavior for the opencode shell.

Visual rules:
- dark graphite background
- warm ivory text
- muted gray secondary text
- restrained violet accent
- green success
- amber warning
- red error
- no chat bubbles
- no dashboard sidebar
- no giant cards
- no heavy boxes
- code/diff/error may use subtle artifact surfaces only
- prompt attaches to the final spine node

Responsive rules:
>=120 cols: split diff excerpt
100-119 cols: unified diff excerpt
80-99 cols: collapsed diff receipt
<80 cols: compact ledger rows

Verification:
- bunx tsgo --noEmit
- bun test packages/tui --timeout 120000
- snapshot tests for command-spine shell
- opencode shell snapshot parity
- manual 80-col render check
```

Bottom line: **do not migrate to a new theme. Do not migrate to a pane dashboard. Migrate to a new session shell.** The image becomes `CommandSpineShell`, and everything opencode-like stays behind the fallback shell.

Structure-exact? Yes.

The target is exactly this:

ARCANA wordmark                      compact context row

01  time       ◆ ask        user prompt
02  time       ├ plan       arcana response
03  time       ├ patch      files changed + inline diff
04  time       ▷ run        command + test result
05  time       × fail       compact error
06  time       ├ fix        fix receipt
07  time       ▷ run        retest result
08  time       ◎ ok         final summary

               ✶  [ ❯  … ]
What we are building

Call it:

CommandSpineShell

This becomes the concrete version of your contract’s Chronicle direction. Your document already recommends Style B “Chronicle” as the primary identity and says the migration should replace only the presentation shell while preserving the data model, SDK, sync, theme engine, and keymap substrate.

So the migration target becomes:

Chronicle concept  →  Command Spine implementation
What should match the image exactly

These parts should be treated as non-negotiable:

1. Dark graphite background
2. ARCANA wordmark top-left
3. Sparse context top-right
4. Left step index with timestamps
5. Vertical command spine with glyph nodes
6. Labels: ask / plan / patch / run / fail / fix / ok
7. Execution content aligned to each spine node
8. Inline diff excerpt, not giant panel
9. Compact test receipt
10. Compact error receipt
11. Bottom spine prompt (`✶` + box `❯`/`!`) attached to the spine
12. No chat bubbles
13. No dashboard sidebar
14. No opencode-style cards
15. No heavy bordered panes
What will not be exact

These should adapt:

terminal width
font rendering
diff layout
long messages
collapsed/expanded state
narrow-terminal fallback
Windows Terminal quirks

Your own contract already flags narrow terminal and Windows Terminal behavior as a risk, so the implementation must degrade cleanly instead of forcing this exact wide layout everywhere.

Required responsive behavior

For wide terminals:

>=120 cols
  render like the image
  split inline diff
  full command spine
  visible timestamps

For medium terminals:

100–119 cols
  keep spine
  use unified compact diff
  reduce right-side spacing

For narrow terminals:

80–99 cols
  keep labels + spine
  collapse diff to summary
  expand with enter

For very narrow terminals:

<80 cols
  compact ledger mode
  no split diff
  no wide context row
Migration shape

Your contract says to introduce a shell abstraction under packages/tui/src/shell/, keep the old opencode shell as fallback, and ship behind a feature flag. That is exactly the right path.

I would adjust the flag from this:

tui.shell = "chronicle" | "opencode"

To this:

tui.shell = "command-spine" | "opencode"

Or support both:

tui.shell = "command-spine" | "chronicle" | "opencode"

Where "chronicle" aliases to "command-spine".

Concrete file plan
packages/tui/src/shell/
  index.ts
  types.ts
  opencode-shell.tsx

  command-spine/
    command-spine-shell.tsx
    spine-header.tsx
    spine-gutter.tsx
    spine-rail.tsx
    spine-node.tsx
    spine-entry.tsx
    spine-receipt.tsx
    spine-diff.tsx
    spine-error.tsx
    spine-prompt.tsx
    spine-mapper.ts
Data flow

Do not render messages directly as chat anymore.

Instead:

SDK Message[] / Part[]
        ↓
messagesToSpineEntries()
        ↓
SpineEntry[]
        ↓
CommandSpineShell

The existing message/session data remains unchanged, matching your rollback requirement that the old shell can be restored with no data migration.

Final answer

Yes: this screenshot is the target.

But the implementation goal is:

exact structure
exact interaction model
exact visual identity
adaptive rendering
not pixel-perfect art reproduction

The next step should be to update your migration contract from Chronicle + Grimoire to:

Primary shell: Command Spine
Fallback shell: Opencode
Optional expanded artifact mode: Grimoire Pane later
Optional minimal mode: Zen later

That keeps the project focused and prevents drifting into dashboards, manuscripts, mind maps, or theme-only redesigns.

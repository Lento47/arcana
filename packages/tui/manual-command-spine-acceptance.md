# Manual Acceptance — Command Spine Shell

## Environment

```
OS:           
Terminals tested:
  [ ] Windows Terminal
  [ ] iTerm2
  [ ] Other: _______

Font:         
Widths tested:
  [ ] >=120
  [ ] ~100
  [ ] ~80
  [ ] <80

Date:         
Operator:     
```

---

## Render Checks

Open a session with `tui.shell = "command-spine"` and check visual layout at each width.

```
[ ] >=120 cols — split diff, wide receipts, full rail
[ ] ~100 cols  — unified diff, compact receipts
[ ] ~80 cols   — collapsed diff stats, narrow receipts
[ ] <80 cols   — no diff body, minimal receipts, compact rail
```

---

## Real Session Checks

Start a conversation and trigger each tool type.

### Text-only session

```
[ ] User ask renders as spine ask entry (◆)
[ ] Text-only assistant response renders as plan entry (├), not a fake ok
[ ] Assistant ok summary (◎) appears only after completed tool activity, never for plain text
[ ] No receipt shown for text-only assistant response
[ ] Think/hidden parts do not create visible entries
```

### Shell tool session

```
[ ] bash tool renders as spine run entry (▷)
[ ] Running state shows "running…" receipt
[ ] Success shows ✓ N passed · M failed · duration receipt
[ ] Failure shows error excerpt (FAIL at minimal, truncated message at narrow, full at wider)
```

### Failed tool session

```
[ ] Error state shows receipt with FAIL / error message
[ ] Error code extracted when pattern matches (e.g. E0308: cause)
[ ] Compact error at narrow, full message at wider
```

### Patch/edit/write session

```
[ ] Patch renders as spine patch entry (├)
[ ] +N -M stats shown in receipt
[ ] Diff excerpt renders at appropriate width:
    - split body at ≥120
    - unified body at 100-119
    - collapsed stats at 80-99
    - no diff body at <80
```

### Inspect/read/grep/glob session

```
[ ] Read/grep/glob entries render as inspect (◈) — matches SPINE_GLYPH.inspect
[ ] Receipt returns null (deferred: no match stats exposed by mapper yet)
[ ] Summary line shows tool operation description
```

---

## Prompt Checks

```
[ ] Typing — keys appear in textarea
[ ] Enter submits prompt
[ ] Shift+Enter inserts newline (multiline)
[ ] Slash commands — /editor, /skills, etc. trigger dialogs
[ ] Autocomplete — suggestions appear and selectable
[ ] History — Up/Down cycles through previous prompts
[ ] Multiline — prompt box expands without crushing scrollbox
[ ] Resize — terminal resize while prompt open does not break layout
[ ] Sticky — prompt stays at bottom, does not scroll with history
```

---

## Keymap Parity

```
[ ] Scroll up/down works
[ ] Message navigation works
[ ] Copy/export still works
[ ] Undo/redo still works, if available
[ ] Dialog escape/cancel works
[ ] Which-key/help layer still works, if available
```

---

## Streaming / Performance

```
[ ] Long assistant response streams without visible stutter
[ ] 4k-token response does not degrade badly versus opencode shell
[ ] Scroll remains responsive during/after streaming
```

---

## Interaction Surface Checks

### Permission prompts

```
[ ] PermissionPrompt appears above prompt when a tool requests approval
[ ] Prompt is disabled while permission prompt is visible
[ ] Permission resolves (approve/reject), prompt re-enables
```

### Question prompts

```
[ ] QuestionPrompt appears above prompt when model asks a question
[ ] QuestionPrompt only appears when NO permission prompt is active
[ ] Question resolves, prompt re-enables
```

### Child/subagent sessions

```
[ ] SubagentFooter appears for sessions with parentID
[ ] Footer shows subagent status correctly
```

### Opencode fallback

```
[ ] Switch to tui.shell = "opencode"
[ ] OpencodeShell renders without errors
[ ] All existing functionality preserved
[ ] Switch back to tui.shell = "command-spine"
[ ] Command spine renders without errors
```

---

## Known Deferred — Not Blocking This Acceptance Pass

Items explicitly not covered here (tracked separately):

- `session_prompt` / `session_prompt_right` plugin slots — not yet validated in command-spine shell
- inspect receipt match/file stats — mapper does not expose them yet
- revert banner — infrequent, requires Dialog import
- artifact viewing — not wired in command-spine shell
- command-spine-specific theme tokens — not needed yet
- snapshot tests for full shell render — deferred to post-flip
- perf parity benchmark — required before public/release default; optional for internal candidate flip
- statusbar/sidebar redesign — post-migration scope

---

## Decision

```
[ ] Approved for default flip
    Evidence attached:
    - screenshots/render logs:
    - terminal(s):
    - commit:

[ ] Conditional
    Follow-ups required before/after flip:

[ ] Rejected
    Blocking issues:
```

### Issues

```

```

---

## After Default Flip

```
shell: "command-spine"
```

Rollback:
```
shell: "opencode"
```

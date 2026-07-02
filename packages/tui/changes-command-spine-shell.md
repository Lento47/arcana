# Command Spine Shell — Migration Tracking

## Status: ACCEPTANCE (Phase 7)

The command-spine shell is implemented behind `tui.shell = "command-spine"` and passing all automated checks. Default shell remains `"opencode"` until acceptance gate is passed.

---

## Files Added (13)

```
src/shell/command-spine/
  command-spine-shell.tsx   root shell component
  spine-types.ts            types, layout, glyphs
  spine-mapper.ts           Message[] → SpineEntry[]
  spine-entry.tsx           single entry composition
  spine-node.tsx            kind label + summary
  spine-receipt.tsx         kind-aware receipt rendering
  spine-diff.tsx            responsive diff excerpt
  spine-gutter.tsx          index + elapsed column
  spine-rail.tsx            glyph column
  spine-header.tsx          top bar (session title)
  spine-prompt.tsx          connector + real Prompt
  sample-entries.ts         dev sample data
  index.ts                  re-exports
```

## Files Modified (4)

```
src/shell/                  shell abstraction (Phase 0)
  types.ts                  ShellProps interface
  resolver.tsx              shell registry
  opencode-shell.tsx        unchanged (fallback)
  index.ts                  re-exports
```

## Test Files (2)

```
test/
  spine-mapper.test.ts      26 tests
  spine-receipt.test.tsx    14 render tests
```

## Pre-existing Test Fixes (inline-tool-wrap fixes, data.test.tsx, arcana-task.test.ts)

Referenced in session history — not part of the shell migration contract but fixed during stabilization.

---

## Verification Commands

```bash
# typecheck
cd packages/tui && bun run typecheck

# lint
cd packages/tui && npx oxlint src/shell/

# tests
cd packages/tui && bun test ./test/spine-mapper.test.ts
cd packages/tui && bun test ./test/spine-receipt.test.tsx
cd packages/tui && bun test ./test/cli/tui/inline-tool-wrap-snapshot.test.tsx
cd packages/tui && bun test ./test/arcana-task.test.ts
cd packages/tui && bun test ./test/cli/tui/data.test.tsx
```

**Current results:**
- typecheck: clean (0 errors)
- lint: 0 warnings, 0 errors
- mapper: 26/26 pass
- receipt: 14/14 pass
- inline-tool-wrap: 17/17 pass
- arcana-task: 10/10 pass
- data: 4/4 pass
- **Total: 71 tests, 0 fail**

---

## Phases Completed

| Phase | Title | Status |
|-------|-------|--------|
| 0 | Shell abstraction | complete |
| 1 | Static command-spine shell | complete |
| 2 | Real message mapper | complete + tested |
| 3 | Compact receipts | complete + render-tested |
| 4 | Diff/error polish | complete |
| 5 | Real prompt attachment | complete |
| 6 | Chrome cleanup | complete |
| 7 | Acceptance/hardening | **current** |

---

## Default-Flip Criteria

Flip `packages/tui/src/config/index.tsx` default from `"opencode"` to `"command-spine"` only when all are true:

- [x] typecheck clean
- [x] lint clean
- [x] mapper tests pass
- [x] receipt tests pass
- [x] permission/question/subagent prompts restored
- [ ] manual render at ≥120 cols accepted
- [ ] manual render at ~100 cols accepted
- [ ] manual render at ~80 cols accepted
- [ ] manual render at <80 cols accepted
- [ ] real session with text only — renders cleanly
- [ ] real session with shell tool — receipt compact
- [ ] real session with failed tool — error visible
- [ ] real session with patch/edit/write — diff excerpt renders
- [ ] real session with read/grep/glob/search — inspect entries shown
- [ ] real session with permission prompt — appears above prompt
- [ ] real session with question prompt — appears above prompt
- [ ] real child/subagent session — footer visible
- [ ] slash commands work
- [ ] autocomplete works
- [ ] history works
- [ ] multiline prompt works
- [ ] prompt does not scroll away (sticky)
- [ ] resize while prompt open — layout recovers
- [ ] opencode fallback still works (`tui.shell = "opencode"`)

---

## Deferred Items (not blocking default-flip)

- inspect receipt match/file stats (mapper doesn't expose them yet)
- `session_prompt` / `session_prompt_right` plugin slots
- revert banner (rare; needs Dialog import chain)
- artifact viewing support
- command-spine-specific theme tokens
- snapshot tests for full shell render
- perf parity benchmark
- statusbar/sidebar redesign
- header model/provider/status metadata (session title only for now)

---

## Rollback

Set `packages/tui/src/config/index.tsx`:
```ts
shell: "opencode"
```
The OpencodeShell remains untouched and fully functional as the fallback.

# Arcana TUI — OpenCode Sameness Audit, Migration Styles & Execution Contract

**Date:** 2026-07-02
**Subject:** `packages/tui` (arcana) vs `packages/tui` (opencode / anomalyco/opencode)
**Stack (both):** OpenTUI + SolidJS + Bun — arcana is an explicit opencode fork (see `README.md` "vs OpenCode" + `branding.ts` "cyberpunk/arcane redesign").

---

## 0. Executive summary

Arcana's TUI is **structurally opencode's TUI**. ~90% of the component tree, data model,
rendering primitives, theme token schema, dialog system, keymap, and chat layout are inherited
verbatim from opencode. Arcana has differentiated only the **cosmetic/lexical skin** (themes,
glyphs, verb lexicon, dither, border chrome) and added two **arcana-original surfaces**
(Run Capsule / verification-record proof tape, and the arcana task/contract prompt model).

The fork has not yet diverged at the **layout / interaction-paradigm** level. To stop "keeping
the same TUI as opencode," arcana must replace the *presentation shell* while keeping opencode's
*data + SDK + sync + theme-engine* substrate.

---

## 1. What is the SAME as opencode

### 1.1 Rendering stack & component model — identical
- `@opentui/core`, `@opentui/solid`, `@opentui/keymap`, `opentui-spinner` (see `packages/tui/package.json`).
- Primitives in use: `<box>`, `<text>`, `<scrollbox>`, `<markdown>`, `<diff>`, `<code>`, `<line_number>`.
- SolidJS reactivity: `createMemo/createSignal/createStore/Show/Switch/Match/For/Dynamic`.

### 1.2 App shell & routing — identical
- `app.tsx` host; two-route model `routes/home.tsx` (empty prompt) + `routes/session/index.tsx` (conversation).
- Plugin slot system: `pluginRuntime.Slot` with `name` + `mode` (`replace` / `single_winner`) — slots `home_logo`, `home_prompt`, `home_bottom`, `home_footer`, `session_prompt`, `session_prompt_right`.
- Context providers (`context/`): route, sync, sdk, project, runtime, theme, kv, local, event, editor, clipboard, epilogue, exit, prompt, path-format, args.
- Feature-plugin registration via `feature-plugins/builtins.ts` → `home/`, `sidebar/`, `system/`.

### 1.3 Chat / conversation UI — identical structure
- `routes/session/index.tsx`: `<scrollbox>` + `<For each={messages()}>` + `Switch/Match` on `message.role`.
- `UserMessage` / `AssistantMessage` split; `PART_MAPPING = { text, tool, reasoning }`.
- **Message/part model** imported from `@arcana/sdk/v2`: `Message, Part, TextPart, ToolPart, ReasoningPart, AssistantMessage, UserMessage, Provider, SessionStatus` — mirrors opencode's session schema.
- Single-column, left-padded (`paddingLeft 2`–`3`) transcript; role labels (`USER` / `ASSISTANT {model}`); dashed separator between turns.
- Hover-background panels (`backgroundElement`/`backgroundPanel`); click-to-edit message via `DialogMessage`.

### 1.4 Tool "cards" (InlineTool / BlockTool) — identical pattern
- `InlineTool` + `InlineToolRow`: compact one-line (icon + label), `pending`/`complete`/`error`/`denied` states, running→complete **glow flash**, click-to-expand, permission-warning color.
- `BlockTool`: bordered left-rail panel for verbose output, hover background, click-to-expand truncation via `collapseToolOutput`.
- Per-tool components: `Shell, Glob, Read, Grep, WebFetch, WebSearch, Write, Edit, Task, ApplyPatch, TodoWrite, Question, Skill, GenericTool` — switched by `toolDisplay(part.tool)`.
- `Diagnostics` sub-panel; `Task` subagent row with retry/background/toolcall-count detail.
- **Note:** arcana swapped *pending verbs* (`VerbPool.pending.*` → "Scrying…/Inscribing…/Transmuting…") and icons, but the card *structure & behavior* is opencode's.

### 1.5 Agent thinking / reasoning UI — identical structure
- `ReasoningPart` + `ReasoningHeader`: collapsible; title/body split via `reasoningSummary()` (parses OpenAI Responses-API `**Title**\n\nbody`).
- `useThinkingMode` (KV `thinking_mode`, show/hide) + legacy `thinking_visibility` migration.
- Left-border accent using the `borderThinking` token; dimmed markdown body via `generateSubtleSyntax()` × `thinkingOpacity`.
- Duration display; click-to-toggle in minimal mode.
- **Note:** arcana swaps the header verb (`pickVerb(VerbPool.thought/thinking)`) and uses `SigilSpinner`; structure is opencode's.

### 1.6 Diff viewer — identical
- `<diff>` renderable; `view` = `split` (width > 120) / `unified` / `stacked`; `showLineNumbers`, `wrapMode`.
- Full opencode diff-token set consumed (see 1.7).

### 1.7 Theme / token system — identical schema (arcana adds 2 tokens)
- `Theme` type (`theme/index.ts`) is opencode's token set: `primary, secondary, accent, error, warning, success, info, text, textMuted, selectedListItemText, background, backgroundPanel, backgroundElement, backgroundMenu, border, borderActive, borderSubtle, diff* (14), markdown* (13), syntax* (9), thinkingOpacity`.
- `ThemeJson` schema: `defs` refs, dark/light variants, hex/ANSI/ref resolution; `resolveTheme`, `generateSystem` (terminal-palette sampling), `generateSyntax`, `generateSubtleSyntax`, `tint`, `terminalMode`, `selectedForeground` — all opencode-derived.
- Custom-theme discovery scans **`.opencode/themes/*.json`** (opencode's directory convention).
- **Arcana extensions:** only `borderThinking`, `surfaceAlt` (both with safe fallbacks) + 7 new color themes (`arcana, bloodmoon, coven, crypt, dragon, lich, wraith`) — same schema, different values. Fallback chain in `context/theme.tsx`: `themes.arcana ?? themes.opencode`.

### 1.8 Dialog system — identical
- `ui/dialog.tsx` (stack-based) + `dialog-alert/confirm/select/prompt/help/export-options`.
- `component/dialog-*.tsx`: agent, mcp, model, provider, session-list/rename/delete-failed, skill, stash, status, theme-list, variant, workspace-*, retry-action, tag, console-org, move-session.
- Command palette (`command-palette.tsx`) + slash commands.

### 1.9 Keymap — identical (literally named opencode)
- `useOpencodeKeymap()` (`@opentui/keymap`); `ARCANA_BASE_MODE` layer on top.
- Session commands: share/rename/timeline/fork/compact/unshare/undo/redo/sidebar/conceal/timestamps/thinking/actions/scrollbar/generic_tool_output, message nav, copy/export, child/parent session nav.
- `feature-plugins/system/which-key.tsx` hint layer.

### 1.10 Footer / statusbar / sidebar — identical
- `routes/session/footer.tsx`: cwd + LSP / MCP / permission counts + `/status`.
- `feature-plugins/system/statusbar.tsx`: model, token-usage meter (`tokens / context %`), cost, compacting/busy — opencode's statusbar (arcana swaps `Lexicon.Token.label` = "glyphs" + `Glyph.diamond`).
- `feature-plugins/sidebar/` (+ `context.tsx`): session list with per-session token/cost — opencode's sidebar.

### 1.11 Prompt / input — identical core
- `component/prompt/index.tsx`: `TextareaRenderable`, autocomplete, history (frecency), stash, workspace-switch, move-session, file attachments, paste/clipboard, slash commands, `PromptInfo`/`PromptRef` API.
- **Arcana additions:** `PromptChrome` (intent/command/seal modes), arcana-task parsing (`arcanaTaskFromPart`, `assessArcanaTaskRisk`, `parseArcanaPromptCommand`) — added *on top of* opencode's input core.

### 1.12 Spinner / loading — shared base
- `ui/spinner.ts` (KnightRider scanner styles: charge/signal/pulse), `component/spinner.tsx`, `opentui-spinner`.
- Arcana-original overlays: `sigil-spinner.tsx`, `scramble.tsx`, `startup-loading.tsx`, `bg-pulse.tsx`, `logo.tsx`.

### 1.13 Summary table

| Surface | Same as opencode? | Arcana delta |
|---|---|---|
| Rendering stack (OpenTUI/Solid) | ✅ identical | — |
| App shell / routing / plugin slots | ✅ identical | — |
| Chat transcript layout | ✅ identical | dither ticks, sigil labels |
| Tool cards (Inline/Block) | ✅ identical | verb lexicon, icons |
| Reasoning / thinking UI | ✅ identical | verb + SigilSpinner |
| Diff viewer | ✅ identical | — |
| Theme token schema | ✅ identical | +2 tokens, 7 palettes |
| Dialog system | ✅ identical | — |
| Keymap | ✅ identical (`useOpencodeKeymap`) | `ARCANA_BASE_MODE` |
| Footer / statusbar / sidebar | ✅ identical | lexicon swap |
| Prompt input | ✅ identical core | PromptChrome + task model |
| Spinner / loading | shared base | sigil/scramble/bg-pulse |
| **Run Capsule / proof tape** | ❌ arcana-original | `app.tsx` RunProof, `ui/arcana.tsx` |
| **Arcana task / contract model** | ❌ arcana-original | `arcana/task.ts`, `CONTRACTS.md` |
| Branding lexicon (Glyph/Lexicon/VerbPool) | ❌ arcana-original | `branding.ts` |

---

## 2. Migration styles — diverging from opencode's TUI

Goal: replace the **presentation shell** while preserving opencode's **data model / SDK / sync /
theme engine / keymap primitives**. Six distinct directions; each changes layout, message
rendering, tool rendering, thinking, tokens, and input. Rated by divergence, risk, effort.

### Style A — "Grimoire" (two-pane spatial)  ★ recommended baseline
- **Layout:** persistent left **conversation river** (narrow, ≤48 col) + right **workspace pane**
  (active file / diff / artifact / proof tape). Panes via OpenTUI `flexDirection=row`.
- **Messages:** river is compact (role sigil + 1-line summary); full content opens in right pane.
- **Tools:** `BlockTool` output (shell/diff/write) renders in the **right pane**, not inline. Inline
  tools stay one-line in the river. Eliminates opencode's single-column scroll.
- **Thinking:** right-pane drawer, river shows only a `▰ Divining…` chip.
- **Tokens:** right-pane footer meter (glyphs / charge / tribute).
- **Input:** bottom command bar spanning both panes.
- **Divergence:** high. **Risk:** med (pane resize/focus). **Effort:** ~8–10 d.

### Style B — "Chronicle" (timeline / ledger)  ★ strongest identity
- **Layout:** vertical **ledger** with a left gutter (timestamp · sigil · agent mark · turn #)
  and right content column. Heavy use of existing `ArcanaTapeItem` / `ArcanaDitherBand` / `COPY`
  ("chronicle", "echoes", "tribute", "well").
- **Messages:** each turn = a ledger entry; user prompts debited, assistant turns credited with
  token cost (tribute). Looks like an accounting/audit log, not a chat — matches arcana's
  governed-execution / proof identity.
- **Tools:** ledger rows (`ArcanaTapeItem`) with kind/time/summary/detail/tone; expand inline.
- **Thinking:** folded ledger sub-entry with duration.
- **Tokens:** running ledger totals in a sticky header (glyphs spent this rite).
- **Divergence:** very high. **Risk:** med (density/readability on small terminals).
- **Effort:** ~9–12 d.

### Style C — "Console" (panel-grid cyberpunk HUD)
- **Layout:** fixed multi-zone grid — top status band, main canvas, side rail, bottom CLI.
  Uses `chrome.ts` `FrameBorder`/`DoubleBorder`/`RAIL` heavily.
- **Messages:** canvas zone; rail shows session/child/subagent tree + proof tape.
- **Tools:** pop into canvas as bordered panels; rail shows active tool stack.
- **Tokens:** top band HUD (model · glyphs · charge% · cost · latency).
- **Divergence:** very high. **Risk:** high (fixed grid breaks on <100 col / mobile-width terms).
- **Effort:** ~12–15 d.

### Style D — "Zen" (minimal typographic)
- **Layout:** strip ALL chrome — no borders, no dither, no sigils. Whitespace + single accent +
  monospace type hierarchy only. Maximum contrast to opencode's bordered cards.
- **Messages:** role by leading glyph + weight only; generous vertical rhythm.
- **Tools:** one-line, no panels; expand reveals plain text.
- **Divergence:** high (aesthetically), low (structurally still a column). **Risk:** low.
- **Effort:** ~4–6 d. Good as a *theme mode*, weak as the sole identity.

### Style E — "Threaded" (collapsible outline tree)
- **Layout:** conversation as a collapsible outline; turns fold into summaries; subagents/child
  sessions nest as tree children (maps directly to arcana's subagent model).
- **Messages:** outline nodes; `z`/`o` fold; depth guides via `RAIL`.
- **Tools:** nested under their parent turn; counts in the summary line.
- **Divergence:** high. **Risk:** med (navigation complexity). **Effort:** ~8–10 d.

### Style F — "Cards / Stack" (discrete card deck)
- **Layout:** each turn/tool = a discrete card with header/footer; cards stack with peek/expand;
  horizontal artifact rail.
- **Divergence:** med-high. **Risk:** med. **Effort:** ~7–9 d.

### Recommendation
- **Primary identity → Style B "Chronicle"** (strongest brand fit: audit/proof/governed-execution;
  reuses existing `ArcanaTapeItem`/dither/lexicon; visibly non-opencode).
- **Pair with Style A "Grimoire" pane for diff/artifact/proof viewing** (right pane).
- **Offer Style D "Zen" as a `--minimal` mode** for low-chrome users.
- Keep opencode's data model, SDK, sync, theme engine, keymap — replace only the shell + card +
  reasoning + statusbar/home components behind a `Shell` abstraction (see contract Phase 0).

### What to KEEP from opencode (do not rewrite)
- `@arcana/sdk/v2` message/part model, `context/sync.tsx`, `context/sdk.tsx`, `context/event.tsx`.
- `theme/index.ts` engine (`resolveTheme`/`generateSystem`/`generateSyntax`) — extend, don't fork.
- `@opentui/keymap` + `useOpencodeKeymap` primitives (rename internally later).
- Plugin slot system + `feature-plugins/` registration.

### What to REPLACE (arcana-owned presentation)
- `routes/session/index.tsx` layout, `UserMessage`/`AssistantMessage`, `InlineTool`/`BlockTool`/
  `InlineToolRow`, `ReasoningPart`/`ReasoningHeader`, `routes/home.tsx`, `routes/session/footer.tsx`,
  `feature-plugins/system/statusbar.tsx`, `feature-plugins/sidebar/`, `component/prompt/index.tsx`
  shell (keep input core).

---

## 3. Execution contract

### 3.1 Goal
Migrate arcana's TUI from an opencode-inherited presentation shell to an arcana-native
**Chronicle + Grimoire** shell, eliminating structural/visual sameness with opencode while
preserving the opencode data/SDK/sync/theme/keymap substrate and all existing user behavior
(slash commands, keybinds, sessions, sharing, export, subagents, permissions).

### 3.2 Scope
**In scope**
- Introduce a `Shell` presentation abstraction (`packages/tui/src/shell/`) that wraps the opencode
  component tree so the layout/card/reasoning/statusbar/home layers are swappable.
- Implement Chronicle ledger transcript (Style B) as the default session shell.
- Implement Grimoire right-pane (Style A) for diff/artifact/proof/tool-block viewing.
- Redesign tool cards, reasoning header, statusbar, home, sidebar to the new shell.
- Extend theme token schema with arcana-native tokens (`gutter`, `ledgerDebit`, `ledgerCredit`,
  `hudBand`, `rail`, `cardHeader`, `cardFooter`); keep backward-compatible fallbacks.
- Add `--minimal` Zen mode toggle.
- Keep `useOpencodeKeymap` working; add `ARCANA_BASE_MODE` bindings for new nav (fold, pane-focus).

**Out of scope**
- Rewriting `@arcana/sdk`, `context/sync`, `context/sdk`, the theme *engine*, or the prompt *input core*.
- Changing the message/part data model or session persistence format.
- Provider/MCP/LSP/auth logic.
- The web app (`packages/enterprise`).

### 3.3 Allowed work
- Edit/create files only under `packages/tui/src/` (shell, routes, component, ui, feature-plugins, theme/assets, context theme glue).
- Extend `theme/index.ts` `Theme`/`ThemeJson` with new optional tokens (fallback-safe).
- Add new theme JSON assets under `theme/assets/`.
- Add tests under `packages/tui/test/`.
- Update `packages/tui/package.json` exports for the new shell entrypoints.

### 3.4 Risk — medium (pre-classified)
**Risk reasons**
- Layout rewrite touches the most-rendered, most-tested code path (session transcript).
- Pane/responsive behavior must degrade on narrow terminals (≤80 col) and Windows Terminal.
- Reactive perf: new memo structure must not regress streaming token throughput.
- Keymap/which-key must stay consistent or users lose muscle memory.

**Mitigations**
- Ship behind a feature flag (`tui.shell = "chronicle" | "opencode"`) with opencode shell as fallback.
- Snapshot/visual regression tests for transcript rendering (extend existing `bun test packages/tui`).
- Perf gate: streaming render budget test (tokens/sec parity ±5%).

### 3.5 Approvals — not_required (pre-classified)
Governed-execution request; produce evidence (verification records) instead of gating on approval.
Risk boundaries still apply per `CONTRACTS.md` (warn on risky work; this contract is presentation-
only, no deps/CI/secrets touched).

### 3.6 Artifacts
1. `packages/tui/src/shell/` — `Shell` abstraction + `ChronicleShell` + `GrimoirePane` + `ZenShell`.
2. Rewritten `routes/session/index.tsx` (or new `routes/session/chronicle.tsx`) using the shell.
3. New `LedgerEntry`/`LedgerRow`/`PaneTool`/`PaneReasoning` components.
4. Extended `theme/index.ts` tokens + updated 7 theme JSONs + `generateSystem` additions.
5. `--minimal` mode + KV toggle.
6. Tests: `packages/tui/test/shell/*.test.tsx`, snapshot tests, perf-parity test.
7. `changes-tui-shell-migration.md` changelog (matches existing `changes-tui-contrast-fallbacks.md` pattern).
8. Verification record (Run Capsule) per `CONTRACTS.md`.

### 3.7 Rollback
- Feature flag `tui.shell` defaults to `"chronicle"`; flip to `"opencode"` to restore the prior
  shell instantly with no data migration (same message/part model).
- Each phase lands behind the flag on a separate branch; revert = drop the branch + flag default.
- New theme tokens are additive + fallback-safe → old themes render unchanged.
- No persisted-state changes → no migration on rollback.

### 3.8 Verification
**Required for proven success (per `CONTRACTS.md`)**
- `bunx tsgo --noEmit` (packages/tui) clean.
- `bun test packages/tui --timeout 120000` — existing suite green + new shell tests green.
- `bun test packages/engine/test/cli/run/*` — footer/theme/view tests green (existing parity).
- Lint: `bun run lint` — 0 errors (warnings only).
- Smoke: `bun run smoke` green.
- Snapshot: transcript rendering unchanged for the `opencode` shell flag; new snapshots for `chronicle`.
- Perf parity: streaming render throughput within ±5% of baseline (measured on a fixed 4k-token fixture).
- Manual: narrow-terminal (80 col) + Windows Terminal + iTerm2 render check; keymap parity checklist.
- If any check skipped → mark result `unproven`, not `successful`.

### 3.9 Budget

Effort (eng-days) is the firm number; LLM cost is volatile and execution-mode-dependent.

| Phase | Work | Effort (eng-days) | Agent LLM cost (est.) |
|---|---|---|---|
| 0 | `Shell` abstraction + feature flag + opencode shell wrapped (no visual change) | 2–3 | $25–50 |
| 1 | Theme token extension + 7 palettes updated + `generateSystem` glue | 1–2 | $15–35 |
| 2 | Chronicle ledger transcript shell (messages + gutter + sticky totals) | 4–5 | $90–170 |
| 3 | Tool card redesign → `LedgerRow` (inline) + `GrimoirePane` (block) | 2–3 | $45–85 |
| 4 | Reasoning/thinking redesign (drawer + chip) | 1–2 | $20–40 |
| 5 | Home + statusbar + sidebar reskin + `--minimal` Zen mode | 2–3 | $35–65 |
| 6 | Tests (snapshot + perf parity) + changelog + verification record | 2–3 | $25–55 |
| **Total (base)** | | **14–21 eng-days** | **$255–500 LLM** |

**Contingency reserve (effort):** +25% → narrow-terminal/responsive fixes, keymap edge cases, snapshot churn.
**Inclusive budget:** **~18–26 eng-days**, **$300–800 LLM** (mode-dependent, see below).

**LLM cost by execution mode** (the dominant variance driver):
- Human-guided + tight context management (don't re-read whole files, targeted edits): **$300–450**
- Mixed guidance (most likely): **$450–650**
- Fully autonomous agent + render/perf debug churn: **$650–900** (tail risk >$800)

**Plan-to number:** ~$500 LLM + ~22 eng-days. Treat $800 as the ceiling, not the target.

**Cost controls that keep it in range**
- Snapshot-first debugging — never eyeball TUI output; assert via snapshots (cuts the biggest inflator).
- Human checkpoint after each phase — catch visual/behavioral divergence before it compounds.
- Hard perf-parity gate (±5%) — prevents open-ended reactive-perf tuning from spiraling.
- Context management — pass file slices, not whole files, to the agent.

**Tail risk that breaks the range**
- Reactive memo restructure for streaming throughput (can eat days + tokens).
- Narrow-terminal (≤80 col) responsive fixes across all 7 themes.
- Upstream opencode merge conflict mid-window (rebase risk — noted, not budgeted).

**Assumptions**
- 1 engineer, SolidJS + OpenTUI fluent; agent-assisted.
- Baseline = current `packages/tui` test count (206 pass / 1 skip per `changes-tui-contrast-fallbacks.md`).
- Labor cost (eng-days × rate) dwarfs LLM cost; LLM is a line item, not the project budget.

### 3.10 Sequence & dependencies
```
0 (Shell+flag) ─┬─► 1 (tokens) ─► 2 (Chronicle) ─► 3 (cards) ─► 4 (reasoning) ─► 6 (verify)
                └─────────────────────────────► 5 (home/status/sidebar/zen) ─► 6 (verify)
```
Phase 0 is the hard gate: no visual divergence is safe until the opencode shell is wrapped behind
the `Shell` abstraction + flag. Phases 1–5 parallelize after 0; 6 is terminal.

### 3.11 Definition of done
- Default shell = Chronicle; opencode shell reachable via flag and fully functional.
- Zero structural/visual sameness with opencode in the default experience (layout, cards, reasoning,
  statusbar, home, sidebar all arcana-native).
- All `CONTRACTS.md` verification gates pass; result marked `successful` (not `unproven`).
- Rollback verified (flag flip restores prior shell in <1 min, no data migration).

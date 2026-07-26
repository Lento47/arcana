# Vercel agent-browser + Native SDK Integration Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Integrate Vercel's agent-browser (browser automation CLI) and Native SDK (desktop app toolkit) into Arcana as first-class capabilities — browser automation tools for agents, plus skills for Native SDK app development/testing.

**Architecture:** Two independent but complementary integrations. agent-browser connects via Arcana's existing MCP client (low-effort, full feature coverage). Native SDK integrates as Arcana skills — teaching agents how to build, test, and automate native desktop apps. Phase 3 explores using Native SDK as Arcana's desktop client backend.

**Source repos:** `L:\tmp\ideas\agent-browser` (v0.33.0, Rust CLI, ~100 commands) and `L:\tmp\ideas\native` (v0.6.0, Zig engine, ~40 examples).

**Tech Stack:** agent-browser (Rust/CDP Chrome), Native SDK (Zig/native rendering), Arcana (Bun/TypeScript/Effect-TS, MCP client, SolidJS TUI).

---

## Strategic Decisions

### agent-browser: MCP Bridge (not custom tools)

agent-browser ships a production MCP server (`agent-browser mcp`) with typed tool discovery across 8 profiles (core, network, state, debug, tabs, react, mobile, all). Arcana already has an MCP client. Wrapping 100+ CLI commands as custom Arcana tools would be ~2,000+ lines of brittle glue code, would stale on every agent-browser release, and would miss the tool discovery, pagination, and typed arguments the MCP server already handles.

**Decision:** Configure agent-browser as an Arcana MCP server. Zero new tool code. Tools appear automatically. All security features (domain allowlists, content boundaries, action policies) work out of the box.

### Native SDK: Skills (not baked-in tools)

Native SDK's automation server is file-based IPC. It's designed for smoke tests and CI, not for ad-hoc agent tool use. The right integration is an Arcana skill — teach the agent how to `native automate wait/snapshot/assert/bridge` — plus maybe a thin wrapper tool for the most common snapshot/wait cycle.

**Decision:** Skills-first with optional thin wrapper tools for the high-value operations.

---

## Phase 1: agent-browser MCP Integration

### Overview

Register agent-browser as an MCP server in Arcana's config. The MCP client handles tool discovery, invocation, and session management. agent-browser's session isolation (`--session <id>`) maps naturally to Arcana's workspace-scoped sessions.

### Task 1.1: Verify MCP client readiness

**Objective:** Confirm Arcana's MCP client can consume agent-browser's MCP server.

**Files:**
- Read: `packages/core/src/tool/tool.ts` (tool registration)
- Read: `packages/engine/src/session/tools.ts` (session tool loading)
- Read: MCP client config (where Arcana reads MCP server configs)

**Step 1: Install agent-browser locally**

```bash
npm install -g agent-browser
agent-browser install
agent-browser doctor
```

Verify: `agent-browser mcp --tools core` starts without errors.

**Step 2: Test MCP tool discovery manually**

Check that Arcana's MCP client can connect to an agent-browser MCP process. Verify tool list includes `agent_browser_navigate`, `agent_browser_snapshot`, `agent_browser_click`, etc.

**Step 3: Test an MCP call end-to-end**

```bash
# In one terminal: agent-browser mcp --tools core
# In Arcana: trigger a browser tool call
```

Verify: agent opens a page, takes a snapshot, returns element refs.

### Task 1.2: Create Arcana MCP config for agent-browser

**Objective:** Define the MCP server entry so Arcana can discover and launch agent-browser.

**Files:**
- Modify: Arcana MCP config (exact path TBD — check `arcana config` output)
- Create: `skills/browser-automation/SKILL.md`

**Step 1: Add agent-browser MCP server to Arcana config**

```json
{
  "mcpServers": {
    "agent-browser": {
      "command": "agent-browser",
      "args": ["mcp", "--tools", "all"],
      "env": {
        "AGENT_BROWSER_SESSION": "${ARCANA_SESSION_ID}"
      }
    }
  }
}
```

Use `--tools all` for full parity. For memory-constrained sessions, use `--tools core,network,tabs`.

**Step 2: Map Arcana session → agent-browser session**

Each Arcana agent session should get an isolated browser session. Use the workspace path to derive a stable session ID:

```
AGENT_BROWSER_SESSION=$(agent-browser session id --scope worktree --prefix arcana)
```

This prevents cross-session browser state leakage.

### Task 1.3: Create agent-browser Arcana skill

**Objective:** Teach the agent the agent-browser workflow (snapshot-ref loop, security features, troubleshooting).

**Files:**
- Create: `skills/browser-automation/SKILL.md`
- Create: `skills/browser-automation/references/security.md`
- Create: `skills/browser-automation/references/troubleshooting.md`

**Skill content outline:**

```markdown
---
name: browser-automation
description: Browser automation for AI agents. Use agent-browser via MCP tools for
  navigating pages, filling forms, clicking buttons, taking screenshots, extracting
  data, testing web apps, or any browser task. Tools available: navigate, snapshot,
  click, fill, type, press_key, hover, select_option, scroll, wait_for, get, find,
  screenshot, evaluate, tabs, console, network_requests, close.
---

# Browser Automation (agent-browser via MCP)

## Core Loop
1. `navigate` to a URL
2. `snapshot` to get accessibility tree with @eN refs
3. Act on refs: `click @e3`, `fill @e2 "text"`
4. Re-`snapshot` after every page change (refs stale immediately)

## Security
- Use `allowedDomains` to restrict navigation
- Set `contentBoundaries: true` to wrap untrusted page content
- Never echo credentials — use auth vault or cookie import
...
```

### Task 1.4: Add security guardrails

**Objective:** Configure sensible defaults so the agent can't navigate to arbitrary URLs or leak data.

**Files:**
- Modify: MCP server config (add default `allowedDomains`)

**Step 1: Enforce domain allowlist by default**

For production deployments, start with an empty allowlist and have the user populate it:

```json
{
  "agent-browser": {
    "command": "agent-browser",
    "args": ["mcp", "--tools", "all"],
    "env": {
      "AGENT_BROWSER_ALLOWED_DOMAINS": "",
      "AGENT_BROWSER_CONTENT_BOUNDARIES": "1",
      "AGENT_BROWSER_MAX_OUTPUT": "50000"
    }
  }
}
```

**Step 2: Document confirmation gates**

Sensitive actions (eval, file downloads) require explicit approval. Document this in the skill:

```
Use --confirm-actions eval,download to gate dangerous operations.
```

### Task 1.5: Integration test

**Objective:** Run a full end-to-end browser workflow through Arcana's MCP client.

**Files:**
- Create: `test/integration/agent-browser-mcp.test.ts`

**Test scenario:**

```
1. Start Arcana with agent-browser MCP server configured
2. Agent calls: navigate to https://example.com
3. Agent calls: snapshot (gets @e1..@eN refs)
4. Agent calls: get text @e1
5. Agent calls: close
```

Verify: All calls succeed, session is isolated, no browser state leaks.

---

## Phase 2: Native SDK Skill Integration

### Overview

Native SDK is a cross-platform desktop app toolkit (Zig engine). Every app embeds an automation server with file-based IPC. The agent needs to know how to build, run, test, and automate these apps.

### Task 2.1: Create Native SDK Arcana skill (core)

**Objective:** Teach agents how to build, run, and develop Native SDK apps.

**Files:**
- Create: `skills/native-sdk-core/SKILL.md`

**Content outline:**

```markdown
---
name: native-sdk-core
description: Build and develop Native SDK desktop apps. Use when the user asks to
  create, modify, build, run, test, or debug a Native SDK app. Covers app.zon,
  build.zig, src/main.zig, frontend integration, Zig 0.16 idioms, packaging,
  and debugging.
---

# Native SDK Development

## Mental Model
- `.native` files = declarative views (markup)
- `src/core.ts` or `src/main.zig` = app logic
- `app.zon` = manifest (identity, windows, permissions, capabilities)
- `build.zig` = build graph
- `native dev` = hot-reload development
- `native build` = release binary

## Quick Start
```bash
npm install -g @native-sdk/cli
native init my_app
cd my_app
native dev
```

## Project Anatomy
...
```

### Task 2.2: Create Native SDK automation skill

**Objective:** Teach agents how to drive and test running Native SDK apps via the automation server.

**Files:**
- Create: `skills/native-sdk-automation/SKILL.md`
- Create: `skills/native-sdk-automation/references/snapshot-schema.md`

**Content outline:**

```markdown
---
name: native-sdk-automation
description: Automate and test running Native SDK apps. Use when the user asks to
  test a running app, inspect runtime state, drive widgets, take screenshots,
  send bridge commands, or debug automation failures.
---

# Native SDK Automation

Every Native SDK app embeds an automation server. File-based IPC in
`.zig-cache/native-sdk-automation/`.

## Prerequisites
Build with automation enabled:
```bash
zig build run -Dplatform=macos -Dautomation=true
```

## Commands
```bash
native automate wait          # Wait until app is ready
native automate snapshot      # Full runtime state dump
native automate assert 'role=button name="Submit"'  # Poll until match
native automate screenshot <view-label>  # Deterministic PNG
native automate bridge '{"id":"smoke","command":"native.ping",...}'
native automate widget-click <view> <widget-id>
native automate widget-key <view> tab
```

## Workflow
1. Start app with -Dautomation=true
2. `native automate wait` (blocks until ready=true)
3. `native automate snapshot` (inspect state)
4. Drive widgets via widget-* commands
5. Assert on state with automate assert
...
```

### Task 2.3: Create Native UI skill (for native-rendered apps)

**Objective:** Teach agents how to author Native SDK's declarative markup views.

**Files:**
- Create: `skills/native-sdk-ui/SKILL.md`

**Content:** Covers the native markup grammar, Model/Msg/update loop, bindings, components, testing, hot reload. Essentially wraps `skill-data/native-ui/SKILL.md` from the native repo into an Arcana skill.

### Task 2.4: Create Zig skill (for the Zig core path)

**Objective:** Teach agents Zig 0.16 idioms for Native SDK development.

**Files:**
- Create: `skills/native-sdk-zig/SKILL.md`

**Content:** Maps common Zig compile errors to the 0.16 idioms used by Native SDK. Wraps `skill-data/zig/SKILL.md` from the native repo.

---

## Phase 3: Native SDK as Arcana Desktop Client (Exploratory)

### Overview

Arcana currently ships as a CLI/TUI app. The TUI uses SolidJS + OpenTUI for terminal rendering. A desktop client could:

1. **WebView Shell** — Wrap Arcana's existing web dashboard (`packages/ui`) in a Native SDK WebView app. Bridge calls from the web frontend to native Zig for filesystem, process management, and OS integration.

2. **Full Native Render** — Rewrite the Arcana UI in Native SDK markup. Major undertaking — would replace the entire SolidJS TUI.

### Task 3.1: Spike — WebView shell proof of concept

**Objective:** Determine if Arcana's web dashboard can run inside a Native SDK WebView with bridge commands for OS integration.

**Files:**
- Create: `examples/arcana-desktop/` (Native SDK app)

**Checklist:**
- [ ] `native init arcana-desktop --frontend vite` (or next)
- [ ] Configure `app.zon` to point at Arcana's web dashboard build
- [ ] Set up bridge commands for `window.zero.invoke("arcana.openFile", path)`
- [ ] Verify the web dashboard renders in the native window
- [ ] Verify bridge round-trips work
- [ ] Assess: is this actually better than the TUI, or just different?

**Go/No-go criteria:**
- Web dashboard must run without modification
- Bridge must handle filesystem ops, theme, and window management
- Build must be ≤10s incremental
- Binary size must be reasonable (< 50MB)

### Task 3.2: Native render spike (defer)

Only consider if the WebView shell proves that desktop-first UX matters for Arcana users AND the WebView approach has unacceptable perf/size tradeoffs. A native render rewrite would be 3-6 months of focused work.

---

## Phase Ordering & Dependencies

```
Phase 1 (agent-browser MCP) ── independent, can start immediately
    │
    ├── 1.1 Verify MCP client ──── 1 day
    ├── 1.2 MCP config ──────────── 1 day
    ├── 1.3 Arcana skill ────────── 1 day
    ├── 1.4 Security guardrails ─── 1 day
    └── 1.5 Integration test ────── 1 day
                                    ──────
                                    5 days total

Phase 2 (Native SDK skills) ── independent, can start immediately
    │
    ├── 2.1 Core skill ───────────── 1 day
    ├── 2.2 Automation skill ─────── 1 day
    ├── 2.3 Native UI skill ──────── 1 day
    └── 2.4 Zig skill ────────────── 1 day
                                    ──────
                                    4 days total

Phase 3 (Desktop client spike) ── depends on Phase 1 & 2 complete
    │
    └── 3.1 WebView shell PoC ────── 2-3 days
```

Total: ~2 weeks for Phases 1+2 (parallelizable). Phase 3 is gated on Go decision from spike.

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| MCP client doesn't handle agent-browser's large tool surface | Use `--tools core` (14 tools) initially; paginated discovery handles `all` |
| agent-browser install fails on Windows | agent-browser has Windows CI; verify with `agent-browser doctor` |
| Native SDK Zig 0.16 requirement conflicts with user's system Zig | Use the npm-packaged binary (`@native-sdk/cli`), not system Zig |
| MCP process lifecycle — who owns the agent-browser daemon? | agent-browser daemon auto-starts on first command; Arcana MCP client manages subprocess |
| Security: agent navigates to malicious URLs | `allowedDomains` enforcement + skill guidance on trust boundaries |

---

## Key Design Decisions

1. **MCP, not custom tools.** agent-browser's MCP server is the supported interface. Custom tool wrappers would duplicate effort and stale.

2. **One agent-browser session per Arcana session.** Uses `agent-browser session id --scope worktree` for stable, isolated sessions.

3. **Skills over tools for Native SDK.** The automation server is file-based, not RPC. A skill teaches the agent the workflow; thin wrapper tools handle only the highest-value operations (wait + snapshot).

4. **WebView shell over native render for desktop PoC.** Native SDK's WebView path lets us reuse Arcana's existing web dashboard. Native render is a much bigger commitment.

---

## Success Metrics

- **Phase 1:** Agent can navigate to a URL, snapshot, click, fill a form, and extract data — all through MCP tools, no custom code.
- **Phase 2:** Agent can `native init`, `native dev`, `native automate` snapshot/assert/screenshot a running app.
- **Phase 3 (stretch):** Arcana web dashboard runs in a native window with bridge commands for OS integration.

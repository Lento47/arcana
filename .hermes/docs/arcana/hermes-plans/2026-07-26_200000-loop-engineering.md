# Arcana Loop Engineering — `/loop` Implementation Plan v2

> **For Hermes:** Execute task-by-task. Every patch verified.

**Goal:** Expose Arcana's existing cockpit/verifier infrastructure as a `/loop` CLI command + TUI command for autonomous research loops.

**Key finding:** Arcana already has the entire loop architecture as the **cockpit system**. The paper's three-plane design (planning, search, verification) IS Arcana's cockpit — contract, verifier-board, governance actions. We're exposing, not building from scratch.

---

## Code Audit — What EXISTS

| Paper concept | Arcana implementation | File |
|---|---|---|
| Objective contract | `AgentContract` with objective, constraints, evidence_required, verification_gates | `cockpit.contract.ts` |
| Verification plane | `cockpit.governance-actions.ts` — verifier rerun, acceptance | `cockpit.governance-actions.ts` |
| Cockpit TUI | `ArcanaCockpit` component renders areas, verifier-board | `cockpit.component.tsx` |
| Lane visualization | `CockpitAreaCard` — per-lane status | `cockpit.area-card.component.tsx` |
| Portfolio lanes | `cockpit.shell` → areas (e.g. "verifier-board") | `cockpit.shell.ts` |
| Subagent spawning | Task/subtask tool → child sessions | `agent/agent.ts` |
| Session routing | `route.navigate({ type: "session" })` — already working | `command-spine-shell.tsx` |

**What's MISSING for `/loop`:**
1. CLI command to launch a loop from contract file
2. `/loop` slash command in TUI prompt
3. Spine entries for loop events (candidate proposals, verifier results, frontier updates)
4. Specific search lane strategies (hill-climb, novelty, tabu) as agent prompts

---

## Tasks

### Task 1: `/loop` CLI command

**File:** `packages/engine/src/cli/cmd/loop.ts` (new)

```bash
arcana loop --contract .arcana/loop/contract.json
```

Loads `AgentContract`, starts a session with the contract bound, spawns cockpit with loop-mode areas. Registers in `index.ts` command loaders.

### Task 2: Loop-mode cockpit areas

**File:** `packages/engine/src/cli/cmd/run/cockpit.shell.ts`

Add loop-specific cockpit areas:
- `search-lanes` — active exploration lanes with status
- `frontier` — best-so-far candidates with metric trend  
- `verifier-board` — per-candidate verifier results (already exists)
- `budget` — token cost, wall time, lane count

### Task 3: Search lane agent prompts

**File:** `packages/engine/src/agent/agent.ts`

Add `mode: "lane"` agents:
- `lane-hillclimb` — local improvement of current best
- `lane-novelty` — exploration along neglected dimensions
- `lane-tabu` — avoid previously explored regions
- `lane-repair` — fix failing candidates

Each has a specialized system prompt driving the search strategy.

### Task 4: `/loop` TUI slash command

**File:** `packages/tui/src/routes/session/index.tsx` — sessionCommandList

Add `/loop` command that opens a contract selector or takes inline contract JSON, then starts a loop session.

### Task 5: Loop spine entries in TUI

**File:** `packages/tui/src/shell/command-spine/spine-mapper.ts`

Add `kind: "loop-proposal"` and `kind: "loop-verdict"` spine entries for loop events. Rendered as:
```text
12  ├ propose  exploit   candidate c17
13  ├ verify   c17        smoke ✓ · unit ✓
14  ├ bench    c17        20.7ms p95 · -31.4%
15  ◆ frontier            new incumbent c17
```

### Task 6: Build + typecheck

```bash
cd L:/PROJECTS/arcana && bun run typecheck && bun run build
```

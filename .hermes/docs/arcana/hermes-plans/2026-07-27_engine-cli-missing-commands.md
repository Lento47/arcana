# Integrate Missing CLI Commands into Engine Binary

> **For Hermes:** Use subagent-driven-development to implement task-by-task.

**Goal:** Port 9 missing CLI commands (theme, learn, config, history, skills, memory, feedback, cron, gateway) from the unused `packages/arcana/src/cli/cmd/` wrapper into `packages/engine/src/cli/cmd/` so they execute in the running npm binary.

**Architecture:** The engine binary registers commands in `packages/engine/src/index.ts` `commandLoaders` (32 commands today). The wrapper at `packages/arcana/src/index.ts` has a subcommand branch with 14 additional commands, but this code is NEVER invoked — the npm launcher at `bin/arcana.js` downloads and runs only the engine binary. Fix: add the missing command implementations directly into the engine's `commandLoaders`. Engine supports both plain yargs `CommandModule` and `effectCmd` patterns — all new commands use plain yargs (no Effect TS), matching the existing `doctor.ts` pattern.

**Tech Stack:** TypeScript, Bun, yargs (CommandModule), `@arcana/memory` (SQLite-backed store), `@arcana/cron` (job scheduler). Node.js stdlib for file I/O.

---

## What Exists Today

### Engine's `commandLoaders` (32 commands, `packages/engine/src/index.ts:194-227`)
Has: `acp`, `mcp`, `attach`, `run`, `generate`, `debug`, `console`, `providers`, `agent`, `upgrade`, `uninstall`, `serve`, `web`, `models`, `stats`, `export`, `import`, `github`, `pr`, `session`, `plugin`, `workflow`, `plugin-store`, `db`, `license`, `proxy`, `doctor`, `team`, `audit`, `trust`, `loop`, `daemon`

### Wrapper's subcommand branch (14 commands, `packages/arcana/src/index.ts:106-120`)
`run`, `skills`, `cron`, `memory`, `gateway`, `completion`, `config`, `learn`, `doctor`, `history`, `theme`, `feedback`, `web`, `daemon`

### Missing from engine (9 commands):
`skills`, `cron`, `memory`, `gateway`, `config`, `learn`, `history`, `theme`, `feedback`

Note: `doctor`, `web`, `daemon`, `run` already exist in engine with their own implementations. `completion` is built-in to yargs.

### Dependencies already in engine:
- `gray-matter: 4.0.3` — used by skill loader for YAML frontmatter parsing (verified: `packages/engine/package.json:95`)
- `jsonc-parser: 3.3.1` — JSON with comments (already in engine)
- `drizzle-orm: catalog:` — SQLite/Postgres ORM (not needed; memory uses direct SQLite)

### Dependencies NOT in engine (must add):
- `@arcana/memory` — lightweight (only depends on `zod`, no native modules)
- `@arcana/cron` — lightweight job store + scheduler
- Neither has native module dependencies; both are pure TypeScript

### Engine already uses this pattern for `~/.arcana` path resolution:
```ts
process.env.ARCANA_HOME ?? join(homedir(), ".arcana")
```
Verified in: `account/license-bind.ts:22`, `license.ts:154,173`, `proxy.ts:14`, `tui/worker.ts:25`, `index.ts:118`, `provider.ts:185`

### Engine supports both command patterns:
- **Plain yargs `cmd({...})`** — `doctor.ts`, `daemon.ts`, `trust.ts` (plain async handlers, no Effect)
- **`effectCmd({...})`** — `account.ts`, `web.ts`, `providers.ts` (Effect-based, needs Effect runtime)

---

## Regression Analysis

### REG-1: Config path mismatch — wrapper uses `~/.arcana/config.json`, engine uses multiple paths
**Description:** The wrapper's `loadConfig()` reads `~/.arcana/config.json`. The engine uses ConfigV1 from `~/.config/arcana/arcana.json` or `opencode.json`. If a user has config in the wrapper path but not the engine path, the `config show` command shows empty/wrong data.
**Fix:** The `config` command reads from `~/.arcana/config.json` directly (matching wrapper behavior). It's a read-only display command; it doesn't set the engine's active config. Add a note in command output: "Engine config is at ~/.config/arcana/arcana.json."
**Confidence: 100%** — read-only, no config mutation.

### REG-2: Skill loader cache path must exist
**Description:** The wrapper's `loader.ts` reads from `~/.cache/arcana/skills-cache.json`. On first run, this file doesn't exist — the loader falls back to filesystem scan. The simplified loader must handle this.
**Fix:** The ported skills command does NOT use the cache — it scans directories directly. Cache is an optimization, not a correctness requirement. Directory scan fallback is already tested.
**Confidence: 100%** — no cache dependency.

### REG-3: Memory DB schema compatibility — wrapper vs engine sessions
**Description:** The engine writes session data to SQLite using Drizzle ORM with its own schema. The wrapper's MemoryStore writes to a separate DB file (`~/.arcana/data/memory.db`). These are DIFFERENT databases. The `history list` command reads from the wrapper's `memory.db`, not the engine's session DB.
**Fix:** This is CORRECT behavior — the `history` command shows sessions created via the wrapper (old arcana sessions). The engine sessions live in a different DB managed by Drizzle. The `history` command is for legacy/wrapper sessions. If the user has no wrapper sessions, the command shows "No sessions found." which is accurate.
**Risk:** Users who only ever used the engine binary will see "No sessions." This is not a regression — it's accurate. We could wire it to also read the engine's session DB in a follow-up.
**Confidence: 100%** — deliberate design, not a bug.

### REG-4: Gateway and cron use `createDelegatedRunner` which imports from wrapper's agent module
**Description:** The wrapper's `cron.ts` `runJob()` and `gateway.ts` message handler create an in-process AgentRunner via `createDelegatedRunner()`. This imports `../../agent/delegated.js`, `../../agent/runner.js`, `../../agent/tools.js`, `../../agent/mcp.js` — all in `packages/arcana/src/agent/`. These are NOT available in `packages/engine/src/`.
**Fix:** For cron, replace `runJob()` with subprocess execution using `process.execPath` (spawns same engine binary). This avoids the in-process agent runner dependency entirely. Gateway is deferred.
**Confidence: 95%** for cron (subprocess is reliable, latency doesn't matter for scheduled jobs). Gateway deferred to follow-up.

### REG-8: spawnSync blocks event loop — cron daemon becomes single-threaded
**Description:** `spawnSync` blocks the Node.js event loop while waiting for the subprocess to exit. During cron `start`, this means only one job runs at a time and the scheduler's interval timer is blocked during execution. For a simple cron daemon this is acceptable — most cron implementations are single-threaded.
**Fix:** Documented limitation. Can switch to async `spawn` + Promise in a follow-up if parallel execution is needed.
**Confidence: 98%** — intentional design trade-off. Does not affect correctness.

### REG-9: Recursive subprocess — cron spawns arcana which could spawn cron
**Description:** The cron daemon uses `process.execPath` to spawn `arcana run` subprocesses. If the user's config has cron enabled and the subprocess detects cron jobs, this could theoretically trigger recursive cron spawning. In practice, each `arcana run` instance is a one-shot execution that exits after completion — it doesn't start the cron scheduler.
**Fix:** The spawned subprocess runs `arcana run <prompt>` which is a one-shot execution (not `arcana cron start`). No recursion risk.
**Confidence: 100%** — one-shot subprocess, no cron scheduler started.

### REG-5: Engine build can't resolve `@arcana/memory` and `@arcana/cron` workspace imports if not added to package.json
**Description:** If `@arcana/memory` is imported from engine's source but not listed in `dependencies`, the Bun build fails with module resolution error.
**Fix:** Task 0 adds the workspace dependencies with `bun add` before any command porting.
**Confidence: 100%** — Bun's `bun add` handles workspace resolution natively.

### REG-6: Commands registered in `commandLoaders` but removed later cause merge conflicts
**Description:** If someone adds a command with the same key (e.g., `theme` already registered), engine startup crashes with "Command already registered."
**Fix:** Verify no key collision before adding. Current `commandLoaders` has no `theme`, `learn`, `config`, `history`, `skills`, `memory`, `feedback`, `cron`, or `gateway` keys.
**Confidence: 100%** — verified by grep.

### REG-7: `arcana` help output grows — all 9 new commands appear in `--help`
**Description:** Adding 9 commands to `commandLoaders` means they all appear in `arcana --help`. The help output is already long (32 commands). Adding 9 more makes it ~40 commands.
**Fix:** This is desired — users need to discover these commands. The help output groups by section (not alphabetical), so the new commands will appear in their natural order. If help becomes too long, we can add section grouping in a follow-up.
**Confidence: 100%** — intentional, not a regression.

---

## Implementation Tasks

### Task 0: Add workspace dependencies to engine

**Objective:** Make `@arcana/memory` and `@arcana/cron` importable in engine source.

**Files:**
- Modify: `packages/engine/package.json`

**Step 1: Add dependencies**

```bash
cd packages/engine && bun add @arcana/memory@workspace:* @arcana/cron@workspace:*
```

**Step 2: Verify import works**

```bash
cd packages/engine && bun -e "import '@arcana/memory'; import '@arcana/cron'; console.log('OK')"
```
Expected: `OK`

**Step 3: Commit**

```bash
git add packages/engine/package.json
git commit -m "deps: add @arcana/memory and @arcana/cron to engine"
```

---

### Task 1: Create shared utility module for Arcana home/data paths

**Objective:** Provide `getArcanaHome()` and `getDataDir()` used by multiple ported commands. Avoids duplicating the path resolution pattern.

**Files:**
- Create: `packages/engine/src/cli/cmd/arcana-home.ts`

**Step 1: Write the module**

```typescript
import { join } from "node:path"
import { homedir } from "node:os"
import { mkdirSync, existsSync } from "node:fs"

/**
 * Resolves the Arcana home directory (~/.arcana).
 * Respects ARCANA_HOME environment variable.
 */
export function getArcanaHome(): string {
  return process.env.ARCANA_HOME ?? join(homedir(), ".arcana")
}

/**
 * Resolves the data directory for memory DB, job store, etc.
 * Default: ~/.arcana/data
 */
export function getDataDir(): string {
  const dir = join(getArcanaHome(), "data")
  if (!existsSync(dir)) {
    try { mkdirSync(dir, { recursive: true }) } catch {}
  }
  return dir
}
```

**Step 2: Verify compiles**

```bash
cd packages/engine && bun run typecheck
```
Expected: No new errors.

**Step 3: Commit**

```bash
git add packages/engine/src/cli/cmd/arcana-home.ts
git commit -m "feat: add arcana-home path utility for ported CLI commands"
```

---

### Task 2: Port `theme` command

**Objective:** Move theme list/set from wrapper to engine. Zero external deps.

**Files:**
- Create: `packages/engine/src/cli/cmd/theme.ts`
- Modify: `packages/engine/src/index.ts` (commandLoaders)

**Step 1: Write theme command**

Copy the wrapper's `theme.ts` (47 lines) with one change: use engine's path resolution (`join(homedir(), ".config", "arcana", "tui.json")` already matches — no change needed).

```typescript
import type { CommandModule } from "yargs"
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { homedir } from "node:os"

const THEMES = ["arcana", "bloodmoon", "coven", "crypt", "dragon", "lich", "wraith"] as const
const TUI_CONFIG = join(homedir(), ".config", "arcana", "tui.json")

export const ThemeCommand: CommandModule = {
  command: "theme [action]",
  describe: "list and set arcana themes",
  builder: (yargs) =>
    yargs
      .positional("action", { choices: ["list", "set"] as const, default: "list" as const })
      .option("name", { alias: "n", type: "string", choices: THEMES as unknown as string[], describe: "theme name" }),
  async handler(args) {
    const action = String(args.action ?? "list")
    if (action === "set") {
      if (!args.name) { console.error("--name required. Choices: " + THEMES.join(", ")); process.exit(1) }
      const name = String(args.name)
      let config: Record<string, unknown> = {}
      if (existsSync(TUI_CONFIG)) {
        try { config = JSON.parse(readFileSync(TUI_CONFIG, "utf8")) } catch {}
      }
      config.theme = name
      mkdirSync(dirname(TUI_CONFIG), { recursive: true })
      writeFileSync(TUI_CONFIG, JSON.stringify(config, null, 2), "utf8")
      console.log(`Theme set to "${name}". Restart arcana to apply.`)
      return
    }
    // list
    const current = (() => {
      if (!existsSync(TUI_CONFIG)) return "arcana"
      try { const c = JSON.parse(readFileSync(TUI_CONFIG, "utf8")); return (c.theme as string) ?? "arcana" } catch { return "arcana" }
    })()
    console.log("7 arcane themes:\n")
    for (const t of THEMES) {
      console.log(`  ${t === current ? "\u25C6" : " "} ${t}${t === current ? " \u2190 active" : ""}`)
    }
    console.log("\n  arcana theme set --name <name>   to switch")
  },
}
```

**Step 2: Register in commandLoaders**

In `packages/engine/src/index.ts`, add after line 226 (`daemon` loader):
```ts
theme: () => import("./cli/cmd/theme").then((m) => m.ThemeCommand),
```

**Step 3: Build and smoke test**

```bash
cd packages/engine && bun run build
./dist/@arcana/engine-windows-x64/bin/arcana theme list
```
Expected: "7 arcane themes:" with arcana marked as active.

**Step 4: Commit**

```bash
git add packages/engine/src/cli/cmd/theme.ts packages/engine/src/index.ts
git commit -m "feat: port theme command to engine CLI"
```

---

### Task 3: Port `learn` command

**Objective:** Move learn list/show/moc from wrapper to engine. Pure file I/O, zero deps.

**Files:**
- Create: `packages/engine/src/cli/cmd/learn.ts`
- Modify: `packages/engine/src/index.ts`

**Step 1: Write learn command**

Copy wrapper's `learn.ts` (46 lines). Uses `cwd()` for path resolution — same behavior.

```typescript
import type { CommandModule } from "yargs"
import { readdirSync, readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { cwd } from "node:process"

const LEARNED_DIR = join(cwd(), ".arcana", "learned")
const LEARNED_MD = join(cwd(), ".arcana", "LEARNED.md")

export const LearnCommand: CommandModule = {
  command: "learn [action]",
  describe: "view and manage learned knowledge",
  builder: (yargs) =>
    yargs
      .positional("action", { choices: ["list", "show", "moc"] as const, default: "list" as const })
      .option("slug", { alias: "s", type: "string", describe: "wiki entry slug to show" }),
  async handler(args) {
    const action = String(args.action ?? "list")
    if (action === "moc") {
      if (!existsSync(LEARNED_MD)) { console.log("No LEARNED.md found. Learnings are created after sessions with >2 turns."); return }
      console.log(readFileSync(LEARNED_MD, "utf8"))
      return
    }
    if (!existsSync(LEARNED_DIR)) { console.log("No learned entries yet. Run arcana in REPL mode, chat for >2 turns, then /exit."); return }
    if (action === "show") {
      if (!args.slug) { console.error("--slug required"); process.exit(1) }
      const fp = join(LEARNED_DIR, `${String(args.slug)}.md`)
      if (!existsSync(fp)) { console.error(`Entry not found: ${args.slug}`); process.exit(1) }
      console.log(readFileSync(fp, "utf8"))
      return
    }
    // list
    const files = readdirSync(LEARNED_DIR).filter((f) => f.endsWith(".md"))
    if (!files.length) { console.log("No entries."); return }
    console.log(`${files.length} learned entries:\n`)
    for (const f of files.sort()) {
      const raw = readFileSync(join(LEARNED_DIR, f), "utf8")
      const firstLine = raw.split("\n")[0]?.replace(/^#+\s*/, "") ?? f
      console.log(`  ${f.replace(".md", "")}  \u2014  ${firstLine.slice(0, 80)}`)
    }
  },
}
```

**Step 2: Register** — same pattern as Task 2.

**Step 3: Build and test**

```bash
cd packages/engine && bun run build
./dist/@arcana/engine-windows-x64/bin/arcana learn list
```
Expected: "No learned entries yet." if no .arcana/learned, or lists entries otherwise.

**Step 4: Commit**

---

### Task 4: Port `history` command

**Objective:** Move session history list/show/resume from wrapper to engine. Uses @arcana/memory.

**Files:**
- Create: `packages/engine/src/cli/cmd/history.ts`
- Modify: `packages/engine/src/index.ts`

**Step 1: Write history command**

Adapted from wrapper — replaces `loadConfig()` + `getDataDir(config)` with `getDataDir()` from our utility module.

```typescript
import type { CommandModule } from "yargs"
import { openMemoryDB, MemoryStore } from "@arcana/memory"
import { getDataDir } from "./arcana-home.js"

export const HistoryCommand: CommandModule = {
  command: "history [action]",
  describe: "browse and resume past sessions",
  builder: (yargs) =>
    yargs
      .positional("action", { choices: ["list", "show", "resume"] as const, default: "list" as const })
      .option("id", { alias: "i", type: "string", describe: "session ID" })
      .option("limit", { alias: "n", type: "number", default: 20, describe: "max results" }),
  async handler(args) {
    const db = openMemoryDB(getDataDir())
    const memory = new MemoryStore(db)
    const action = String(args.action ?? "list")

    if (action === "show" || action === "resume") {
      if (!args.id) { console.error("--id required"); process.exit(1) }
      const wanted = String(args.id)
      let session = memory.getSession(wanted)
      if (!session) session = memory.listSessions(1000).find((s) => s.id.startsWith(wanted)) ?? null
      if (!session) { console.error(`Session not found: ${args.id}`); process.exit(1) }
      if (action === "resume") {
        console.log(`arcana run --resume ${session.id}`)
        return
      }
      console.log(`ID:       ${session.id}`)
      console.log(`Title:    ${session.title ?? "(untitled)"}`)
      console.log(`Model:    ${session.model ?? "?"} @ ${session.provider ?? "?"}`)
      console.log(`Messages: ${session.message_count}`)
      console.log(`Created:  ${session.created_at}`)
      if (session.summary) console.log(`Summary:  ${session.summary}`)
      const msgs = memory.getMessages(session.id)
      console.log("\n--- Last 10 messages ---")
      for (const m of msgs.slice(-10)) {
        console.log(`[${m.role}] ${m.content.slice(0, 120)}${m.content.length > 120 ? "\u2026" : ""}`)
      }
      return
    }
    const sessions = memory.listSessions(Number(args.limit ?? 20))
    if (!sessions.length) { console.log("No sessions found."); return }
    console.log(`${sessions.length} sessions:\n`)
    for (const s of sessions) {
      const id = s.id.slice(0, 8)
      const title = (s.title ?? "(untitled)").slice(0, 40)
      const date = s.updated_at.slice(0, 16).replace("T", " ")
      console.log(`  ${id}  ${date}  ${String(s.message_count).padEnd(8)} ${title}`)
    }
    console.log("\n  arcana history show --id <id>   for details")
  },
}
```

**Step 2: Register** in commandLoaders.

**Step 3: Build and test**

```bash
cd packages/engine && bun run build
./dist/@arcana/engine-windows-x64/bin/arcana history list
```
Expected: Lists sessions from ~/.arcana/data/memory.db, or "No sessions found."

**Step 4: Commit**

---

### Task 5: Port `config` command

**Objective:** Show current config or init a new config file. Reads `~/.arcana/config.json`.

**Files:**
- Create: `packages/engine/src/cli/cmd/config.ts`
- Modify: `packages/engine/src/index.ts`

**Step 1: Write config command**

```typescript
import type { CommandModule } from "yargs"
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { getArcanaHome } from "./arcana-home.js"

export const ConfigCommand: CommandModule = {
  command: "config [action]",
  describe: "manage arcana configuration",
  builder: (yargs) =>
    yargs
      .positional("action", { choices: ["show", "init"] as const, default: "show" as const })
      .option("key", { alias: "k", type: "string", describe: "show only this key" }),
  async handler(args) {
    const configPath = join(getArcanaHome(), "config.json")
    const action = String(args.action ?? "show")

    if (action === "init") {
      if (existsSync(configPath)) {
        console.log(`Config exists at ${configPath}. Use 'arcana config show' to view.`)
        return
      }
      const defaults = {
        memory: { enabled: true, maxSessions: 1000 },
        cron: { enabled: true, intervalSeconds: 60 },
      }
      mkdirSync(dirname(configPath), { recursive: true })
      writeFileSync(configPath, JSON.stringify(defaults, null, 2), "utf8")
      console.log(`Created ${configPath}`)
      console.log("Provider and model are auto-detected from env vars.")
      console.log("Set a provider key (e.g. ANTHROPIC_API_KEY, OPENAI_API_KEY) to activate.")
      return
    }

    if (!existsSync(configPath)) {
      console.log(`No config found at ${configPath}. Run 'arcana config init' to create one.`)
      return
    }
    const config = JSON.parse(readFileSync(configPath, "utf8"))
    if (args.key) {
      const key = String(args.key)
      if (config[key] === undefined) { console.error(`Key not found: ${key}`); process.exit(1) }
      console.log(JSON.stringify(config[key], null, 2))
      return
    }
    console.log(JSON.stringify(config, null, 2))
    console.log(`\n  Config path: ${configPath}`)
    console.log("  Engine config: ~/.config/arcana/arcana.json")
  },
}
```

**Step 2-4:** Register, build, test, commit.

---

### Task 6: Port `skills` command

**Objective:** List/search/info/ranked skills. Scans skill directories for SKILL.md files.

**Files:**
- Create: `packages/engine/src/cli/cmd/skills.ts`
- Modify: `packages/engine/src/index.ts`

**Step 1: Write skills command**

Simplified version — scans directories directly, no cache. Uses gray-matter (already in engine deps).

```typescript
import type { CommandModule } from "yargs"
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs"
import { join, dirname, relative } from "node:path"
import { homedir } from "node:os"
import matter from "gray-matter"
import { openMemoryDB, MemoryStore } from "@arcana/memory"
import { getDataDir } from "./arcana-home.js"

interface SkillEntry {
  name: string
  description: string
  id: string
  category: string
  path: string
}

const DEFAULT_DIRS = [
  join(homedir(), ".arcana", "skills"),
  join(process.cwd(), "skills"),
  join(process.cwd(), ".arcana", "skills"),
]

function scanDir(dir: string): SkillEntry[] {
  if (!existsSync(dir)) return []
  const results: SkillEntry[] = []
  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const e of entries) {
      const full = join(dir, e.name)
      if (e.isDirectory()) { results.push(...scanDir(full)); continue }
      if (e.name !== "SKILL.md") continue
      try {
        const raw = readFileSync(full, "utf8")
        const parsed = matter(raw)
        const meta = parsed.data as { name?: string; description?: string }
        if (!meta.name) continue
        const relDir = relative(dir, dirname(full))
        results.push({
          name: meta.name,
          description: meta.description ?? "",
          id: relDir.replace(/[\\/]/g, "/") || meta.name.toLowerCase().replace(/\s+/g, "-"),
          category: relDir.split(/[\\/]/)[0] ?? "misc",
          path: full,
        })
      } catch {}
    }
  } catch {}
  return results
}

function scanAll(): SkillEntry[] {
  const all: SkillEntry[] = []
  for (const dir of DEFAULT_DIRS) all.push(...scanDir(dir))
  return all
}

function loadSkillBody(id: string): string | undefined {
  for (const dir of DEFAULT_DIRS) {
    const fp = join(dir, id, "SKILL.md")
    if (existsSync(fp)) return readFileSync(fp, "utf8")
  }
}

export const SkillsCommand: CommandModule = {
  command: "skills [action]",
  describe: "manage and browse arcana skills",
  builder: (yargs) =>
    yargs
      .positional("action", { choices: ["list", "info", "search", "ranked"] as const, default: "list" as const })
      .option("query", { alias: "q", type: "string", describe: "search query" })
      .option("skill", { alias: "s", type: "string", describe: "skill id for info" })
      .option("category", { alias: "c", type: "string", describe: "filter by category" }),
  async handler(args) {
    const action = String(args.action ?? "list")
    const skills = scanAll()

    if (action === "search") {
      const q = String(args.query ?? "").toLowerCase()
      const hits = skills.filter((s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q))
      if (!hits.length) { console.log(`No skills match "${args.query}"`); return }
      console.log(`${hits.length} matching skills:\n`)
      for (const s of hits) console.log(`  ${s.id.padEnd(36)} ${s.description}`)
      return
    }

    if (action === "ranked") {
      const db = openMemoryDB(getDataDir())
      const mem = new MemoryStore(db)
      const stats = mem.getRecentSkillStats(50)
      if (!stats.length) { console.log("No skill usage data yet."); return }
      const statMap = new Map(stats.map((s) => [s.skillId, s]))
      const ranked = skills
        .filter((s) => statMap.has(s.id) || statMap.has(s.name.toLowerCase()))
        .map((s) => ({ ...s, stat: statMap.get(s.id) ?? statMap.get(s.name.toLowerCase())! }))
        .sort((a, b) => (b.stat.recent || b.stat.total) - (a.stat.recent || a.stat.total))
      console.log(`${ranked.length} ranked skills:\n`)
      for (const s of ranked.slice(0, 20)) {
        console.log(`  ${s.id.padEnd(36)} ${s.stat.recent ?? 0} recent  ${s.description}`)
      }
      return
    }

    if (action === "info") {
      if (!args.skill) { console.error("--skill required"); process.exit(1) }
      const skill = skills.find((s) => s.id === String(args.skill) || s.name.toLowerCase().includes(String(args.skill).toLowerCase()))
      if (!skill) { console.error(`Skill not found: ${args.skill}`); process.exit(1) }
      const body = loadSkillBody(skill.id) ?? readFileSync(skill.path, "utf8")
      console.log(`# ${skill.name}\n`)
      console.log(`ID: ${skill.id}  |  Category: ${skill.category}`)
      if (skill.description) console.log(`\n${skill.description}`)
      console.log(`\n---\n${body}`)
      return
    }

    // list
    let filtered = skills
    if (args.category) filtered = filtered.filter((s) => s.category === String(args.category))
    if (!filtered.length) { console.log("No skills found."); return }
    const cats = [...new Set(filtered.map((s) => s.category))]
    for (const cat of cats.sort()) {
      console.log(`\n${cat}:`)
      for (const s of filtered.filter((s) => s.category === cat)) {
        console.log(`  ${s.id.padEnd(36)} ${s.description}`)
      }
    }
  },
}
```

**Step 2-4:** Register, build, test, commit.

---

### Task 7: Port `memory` command

**Objective:** Search/sessions/facts/stats from memory DB. Largest command (257 lines).

**Files:**
- Create: `packages/engine/src/cli/cmd/memory.ts`
- Modify: `packages/engine/src/index.ts`

**Step 1: Write memory command**

Strips cloud sync (push/pull/sync). Keeps: search, sessions, facts, stats, artifacts, compile.

```typescript
import type { CommandModule } from "yargs"
import { openMemoryDB, MemoryStore } from "@arcana/memory"
import { getDataDir } from "./arcana-home.js"
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { getArcanaHome } from "./arcana-home.js"

export const MemoryCommand: CommandModule = {
  command: "memory <action>",
  describe: "search, compile FACTS.md, and query arcana memory",
  builder: (yargs) =>
    yargs
      .positional("action", {
        choices: ["search", "sessions", "facts", "stats", "artifacts", "compile"] as const,
        demandOption: true,
      })
      .option("query", { alias: "q", type: "string", describe: "search query" })
      .option("limit", { alias: "n", type: "number", default: 10, describe: "max results" })
      .option("min-confidence", { type: "number", default: 0, describe: "min confidence when compiling" }),
  async handler(args) {
    const db = openMemoryDB(getDataDir())
    const store = new MemoryStore(db)
    const action = String(args.action)

    if (action === "search") {
      if (!args.query) { console.error("--query required"); process.exit(1) }
      const q = String(args.query).toLowerCase()
      const allFacts = store.getUserFacts()
      const results = allFacts.filter((f) =>
        f.key.toLowerCase().includes(q) || f.value.toLowerCase().includes(q)
      ).slice(0, Number(args.limit))
      if (!results.length) { console.log("No results."); return }
      for (const r of results) {
        const conf = Math.round((r.confidence ?? 0) * 100)
        console.log(`  [${conf}%] ${r.key}: ${r.value}`)
      }
      return
    }

    if (action === "sessions") {
      const sessions = store.listSessions(Number(args.limit))
      if (!sessions.length) { console.log("No sessions."); return }
      for (const s of sessions) {
        console.log(`  ${s.id.slice(0, 8)}  ${s.title ?? "(untitled)"}  ${s.message_count} msgs`)
      }
      return
    }

    if (action === "facts") {
      const facts = store.getUserFacts().slice(0, Number(args.limit))
      if (!facts.length) { console.log("No facts."); return }
      for (const f of facts) {
        console.log(`  [${Math.round((f.confidence ?? 0) * 100)}%] ${f.key}: ${f.value}`)
      }
      return
    }

    if (action === "stats") {
      const sessions = store.listSessions(10000)
      const facts = store.getUserFacts()
      console.log(`Sessions: ${sessions.length}`)
      console.log(`Facts: ${facts.length}`)
      const totalMsgs = sessions.reduce((sum, s) => sum + (s.message_count ?? 0), 0)
      console.log(`Messages: ${totalMsgs}`)
      const withSummaries = sessions.filter((s) => s.summary).length
      console.log(`Summaries: ${withSummaries}`)
      return
    }

    if (action === "artifacts") {
      const arts = store.listArtifacts(Number(args.limit))
      if (!arts.length) { console.log("No artifacts."); return }
      for (const a of arts) {
        console.log(`  ${a.id.slice(0, 8)}  ${a.name ?? "unnamed"}  ${a.type ?? "?"}`)
      }
      return
    }

    if (action === "compile") {
      const facts = store.getUserFacts(Number(args.minConfidence ?? 0)).slice(0, 10000)
      if (!facts.length) { console.log("No facts to compile."); return }
      const lines = ["# Arcana Learned Facts", "", `Compiled ${new Date().toISOString()}`, `Total facts: ${facts.length}`, ""]
      for (const f of facts) {
        lines.push(`## ${f.key}`)
        lines.push(f.value)
        if (f.source) lines.push(`_source: ${f.source}_`)
        lines.push("")
      }
      const fp = join(getArcanaHome(), "FACTS.md")
      mkdirSync(dirname(fp), { recursive: true })
      writeFileSync(fp, lines.join("\n"), "utf8")
      console.log(`Compiled ${facts.length} facts to ${fp}`)
      return
    }
  },
}
```

**Step 2-4:** Register, build, test, commit.

---

### Task 8: Port `feedback` command

**Objective:** Record and list feedback. Uses @arcana/memory.

**Files:**
- Create: `packages/engine/src/cli/cmd/feedback.ts`
- Modify: `packages/engine/src/index.ts`

**Step 1: Write feedback command**

Copy wrapper's `feedback.ts` (106 lines). Replace `loadConfig/getDataDir(config)` with `getDataDir()`. All other logic unchanged — `MemoryStore.recordFeedback()`, `listFeedback()`, `feedbackStats()` are standard API.

```typescript
import type { CommandModule } from "yargs"
import { openMemoryDB, MemoryStore } from "@arcana/memory"
import { getDataDir } from "./arcana-home.js"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { mkdirSync } from "node:fs"

function drainQueue(store: MemoryStore): number {
  const queuePath = join(homedir(), ".arcana", "feedback-queue.jsonl")
  if (!existsSync(queuePath)) return 0
  let drained = 0
  try {
    const lines = readFileSync(queuePath, "utf8").split("\n").filter((l) => l.trim())
    for (const line of lines) {
      try {
        const e = JSON.parse(line)
        store.recordFeedback({
          rating: e.rating === "up" || e.rating === "down" ? e.rating : undefined,
          note: e.note ?? undefined,
          category: e.category ?? undefined,
          sessionId: e.session_id ?? undefined,
          messageId: e.message_id ?? undefined,
          source: e.source ?? "tui",
        })
        drained++
      } catch {}
    }
    writeFileSync(queuePath, "", "utf8")
  } catch {}
  return drained
}

export const FeedbackCommand: CommandModule = {
  command: "feedback [message..]",
  describe: "send feedback about arcana, or review past feedback",
  builder: (yargs) =>
    yargs
      .positional("message", { type: "string", array: true, describe: 'feedback text, or "list" / "stats"' })
      .option("bug", { type: "boolean", describe: "tag as a bug report" })
      .option("idea", { type: "boolean", describe: "tag as a feature idea" })
      .option("praise", { type: "boolean", describe: "tag as praise" })
      .option("limit", { alias: "n", type: "number", default: 20, describe: "max rows" }),
  async handler(args) {
    const dataDir = getDataDir()
    try { mkdirSync(dataDir, { recursive: true }) } catch {}
    const db = openMemoryDB(dataDir)
    const store = new MemoryStore(db)

    const parts = ((args.message as string[] | undefined) ?? []).map(String)
    const first = (parts[0] ?? "").toLowerCase()

    if (first === "list" && parts.length === 1) {
      drainQueue(store)
      const rows = store.listFeedback(Number(args.limit))
      if (!rows.length) { console.log('No feedback yet. Send some: arcana feedback "..."'); return }
      for (const f of rows) {
        const tag = f.rating ? (f.rating === "up" ? "\uD83D\uDC4D" : "\uD83D\uDC4E") : f.category ?? "note"
        console.log(`${f.id.slice(0, 4)}  ${f.created_at.slice(0, 10)}  ${String(tag).padEnd(6)} ${f.note ?? ""}  [${f.source}]`)
      }
      return
    }
    if (first === "stats" && parts.length === 1) {
      drainQueue(store)
      const s = store.feedbackStats()
      console.log(`Feedback: ${s.total} total \u00B7 \uD83D\uDC4D ${s.up} \u00B7 \uD83D\uDC4E ${s.down}`)
      return
    }
    const note = parts.join(" ").trim()
    if (!note) {
      console.error('Usage: arcana feedback "your feedback" [--bug|--idea|--praise]\n       arcana feedback list\n       arcana feedback stats')
      process.exit(1)
    }
    const category = args.bug ? "bug" : args.idea ? "idea" : args.praise ? "praise" : undefined
    const fb = store.recordFeedback({ note, category, source: "cli" })
    console.log(`\u2713 Feedback logged (${fb.id.slice(0, 4)}${category ? `, ${category}` : ""}). Thank you!`)
  },
}
```

**Step 2-4:** Register, build, test, commit.

---

### Task 9: Port `cron` command (CRUD only + subprocess execution)

**Objective:** Manage cron jobs (add/list/remove/pause/resume) with JobStore. Execute jobs via subprocess.

**Files:**
- Create: `packages/engine/src/cli/cmd/cron.ts`
- Modify: `packages/engine/src/index.ts`

**Step 1: Write cron command**

Keeps JobStore CRUD. Replaces `runJob()` with subprocess spawn. Removes in-process agent runner dependency.

```typescript
import type { CommandModule } from "yargs"
import { JobStore, Scheduler } from "@arcana/cron"
import type { Job, RunResult } from "@arcana/cron"
import { getDataDir } from "./arcana-home.js"
import { spawnSync } from "node:child_process"

/**
 * Resolves the arcana binary for subprocess execution.
 * In production (Bun-compiled binary), process.execPath IS the engine binary.
 * In dev mode (bun run dev / node), fall back to "arcana" on PATH.
 *
 * Detection: if execPath ends with "bun" or "node", we're in dev mode.
 * Bun-compiled binaries embed the runtime but execPath is the binary file
 * (e.g., arcana.exe on Windows, arcana on Linux/Mac).
 */
function getArcanaBinary(): string {
  const ep = process.execPath.toLowerCase()
  if (
    ep.endsWith("bun.exe") || ep.endsWith("bun") ||
    ep.endsWith("node.exe") || ep.endsWith("node")
  ) {
    return "arcana" // dev mode — resolve via PATH
  }
  // Production (compiled binary) — execPath is arcana.exe / arcana
  return process.execPath
}

function spawnArcanaRun(prompt: string): Promise<RunResult> {
  return new Promise((resolve) => {
    const startedAt = new Date().toISOString()
    const binary = getArcanaBinary()
    const result = spawnSync(binary, ["run", prompt], {
      stdio: "pipe",
      timeout: 300_000, // 5 min
    })
    resolve({
      jobId: "",
      startedAt,
      finishedAt: new Date().toISOString(),
      success: result.status === 0,
      error: result.status !== 0 ? (result.stderr?.toString() || result.stdout?.toString() || `exit ${result.status}`) : undefined,
    })
  })
}

export const CronCommand: CommandModule = {
  command: "cron <action>",
  describe: "manage scheduled jobs",
  builder: (yargs) =>
    yargs
      .positional("action", {
        choices: ["list", "add", "remove", "pause", "resume", "run", "start"] as const,
        demandOption: true,
      })
      .option("name", { alias: "n", type: "string", describe: "job name" })
      .option("schedule", { alias: "s", type: "string", describe: "cron schedule (e.g. '0 9 * * *' or @daily)" })
      .option("prompt", { alias: "p", type: "string", describe: "prompt to run" })
      .option("id", { alias: "i", type: "string", describe: "job ID" }),
  async handler(args) {
    const dataDir = getDataDir()
    const store = new JobStore(dataDir)
    const action = String(args.action)

    switch (action) {
      case "list": {
        const jobs = await store.list()
        if (!jobs.length) { console.log("No scheduled jobs."); return }
        console.log(`${jobs.length} job(s):\n`)
        for (const j of jobs) {
          const status = !j.enabled ? "paused" : j.last_run ? `last: ${j.last_run.slice(0, 16)}` : "pending"
          console.log(`  ${j.id.slice(0, 8)}  ${status.padEnd(20)} ${j.name ?? j.prompt.slice(0, 50)}`)
        }
        break
      }
      case "add": {
        if (!args.schedule || !args.prompt) { console.error("--schedule and --prompt required"); process.exit(1) }
        const job = await store.create({
          name: String(args.name ?? ""),
          schedule: String(args.schedule),
          prompt: String(args.prompt),
        })
        console.log(`Job created: ${job.id.slice(0, 8)}  schedule: ${job.schedule}`)
        break
      }
      case "remove": {
        if (!args.id) { console.error("--id required"); process.exit(1) }
        await store.remove(String(args.id))
        console.log(`Removed ${args.id}`)
        break
      }
      case "pause": {
        if (!args.id) { console.error("--id required"); process.exit(1) }
        await store.update(String(args.id), { enabled: false })
        console.log(`Paused ${args.id}`)
        break
      }
      case "resume": {
        if (!args.id) { console.error("--id required"); process.exit(1) }
        await store.update(String(args.id), { enabled: true })
        console.log(`Resumed ${args.id}`)
        break
      }
      case "run": {
        if (!args.id) { console.error("--id required"); process.exit(1) }
        const job = await store.get(String(args.id))
        if (!job) { console.error(`Job not found: ${args.id}`); process.exit(1) }
        console.log(`Running job: ${job.name ?? job.prompt}`)
        try {
          await spawnArcanaRun(job.prompt)
          await store.markRan(job.id)
          console.log("Done.")
        } catch (e) {
          console.error(`Failed: ${e}`)
        }
        break
      }
      case "start": {
        console.log("Starting cron scheduler... (Ctrl+C to stop)")
        const scheduler = new Scheduler(store, async (job: Job) => {
          console.log(`[${new Date().toISOString()}] Running: ${job.name ?? job.prompt.slice(0, 40)}`)
          return spawnArcanaRun(job.prompt)
        })
        scheduler.start()
        // Keep process alive
        await new Promise(() => {})
        break
      }
    }
  },
}
```

**Step 2-4:** Register, build, test, commit.

**Note:** `JobStore` methods are all async (`get`, `create`, `remove`, `update`, `list`, `markRan`). `Scheduler.start()` is synchronous. `MemoryStore` uses `getUserFacts(minConfidence)` not `listFacts`. No `searchFacts` — implement via `getUserFacts().filter()`.

---

## Summary

| Task | Command | New file | Deps | Lines | Confidence |
|------|---------|----------|------|-------|------------|
| 0 | Add deps | package.json | — | — | 100% |
| 1 | arcana-home util | arcana-home.ts | none | 20 | 100% |
| 2 | theme | theme.ts | none | 47 | 100% |
| 3 | learn | learn.ts | none | 46 | 100% |
| 4 | history | history.ts | memory | 55 | 100% |
| 5 | config | config.ts | none | 45 | 100% |
| 6 | skills | skills.ts | memory, gray-matter | 120 | 100% |
| 7 | memory | memory.ts | memory | 110 | 100% |
| 8 | feedback | feedback.ts | memory | 100 | 100% |
| 9 | cron | cron.ts | cron, memory | 145 | 100% |
| — | gateway | *(deferred)* | gateway, memory | 79 | — |

**Gateway deferred:** Requires `@arcana/gateway` (Gateway class for transport) + per-message agent execution (subprocess). Each gateway message spawning `arcana run` adds 1-3s latency. Acceptable for cron but degrades the gateway experience. Deferred to follow-up plan that ports the agent runner or uses the engine's HTTP API.

**Execution order:** Task 0 → 1 → 2 → 3 → 5 → 4 → 8 → 6 → 7 → 9

Push ONCE at the end after all 9 tasks build successfully.

---

## Verification

After all tasks complete:

```bash
# Build from engine root
cd packages/engine && bun run build

# Verify all commands appear in help
./dist/@arcana/engine-windows-x64/bin/arcana --help | grep -E "theme|learn|config|history|skills|memory|feedback|cron"

# Smoke test each
./dist/@arcana/engine-windows-x64/bin/arcana theme list
./dist/@arcana/engine-windows-x64/bin/arcana learn list
./dist/@arcana/engine-windows-x64/bin/arcana config show
./dist/@arcana/engine-windows-x64/bin/arcana history list
./dist/@arcana/engine-windows-x64/bin/arcana skills list
./dist/@arcana/engine-windows-x64/bin/arcana memory stats
./dist/@arcana/engine-windows-x64/bin/arcana feedback stats
./dist/@arcana/engine-windows-x64/bin/arcana cron list
```

# Persistent Named Workflows + Output Contracts — Implementation Plan (v3)

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Add named workflow persistence (save, list, show, delete) and optional JSON Schema output contracts to Arcana's existing workflow engine.

**Architecture:** Store workflows as JSON files under `~/.arcana/workflows/<name>.json`, validated on load via Effect Schema. Add `arcana workflow` CLI with stdin safety (isTTY check) and path-traversal-proof filenames. Extend `WorkflowStep` schema with `output_schema: Schema.optional(Schema.Unknown).annotate({ description: ... })` so the LLM understands the field. Validate subagent outputs against user-provided JSON Schemas at runtime, with graceful fallback for invalid schemas and non-JSON output.

**Tech Stack:** TypeScript, Effect-TS, bun:test, `ajv` (new dep — no existing validator in project), Node.js fs.

---

## Full Code Path Audit

### Who consumes `WorkflowStep`?

| Location | How | Impact of adding `output_schema` |
|---|---|---|
| `workflow/schema.ts:3` | Defines the struct | Source of truth — add field here |
| `workflow/schema.ts:28` | `WorkflowPlan.steps` is `Array<WorkflowStep>` | Inherits change. LLM sees new field in tool JSON Schema |
| `workflow/engine.ts:2` | Type import only | No impact |
| `workflow/engine.ts:42` | `plan.steps ?? []` — reads array | Steps carry `output_schema`; engine ignores it (doesn't read the field) |
| `workflow/tool.ts:2` | Type import | Tool definition regenerates JSON Schema |
| `workflow/tool.ts:10` | `Schema.Array(WorkflowStep)` — decode LLM output | LLM may include `output_schema`; decode accepts it (optional) |
| `workflow/tool.ts:62` | `fromSchema(WorkflowPlan)` → LLM tool definition | LLM sees `output_schema` with `description` annotation |
| `workflow/tool.ts:76-79` | `params.steps ?? []` — auto-orchestration may reassign `steps` | Steps carry `output_schema` through to engine (closure captures after reassignment — verified at line 90 vs 76) |
| `workflow/tool.ts:108-110` | `snapshot.steps` for progress | No impact — `StepRun` doesn't include schema metadata |

### Who implements `WorkflowExecutors.runSubagent`?

| Location | Role | Impact of adding `stepId` |
|---|---|---|
| `workflow/tool.ts:92-98` | Only implementation — callback passed to `createEngine` | Must add `stepId` parameter |
| `workflow/engine.ts:148` | Only call site — `runStep` dispatches to executor | Must pass `step.id` |

**Single implementation, single call site.** TypeScript compiler gates correctness. Safe.

### What existing tests exist?

**Zero tests** for the workflow module. No `*.test.ts` files under `packages/engine/src/workflow/`. Nothing to break.

### What JSON Schema is generated for the LLM?

`fromSchema(WorkflowStep)` at line 62 converts to JSON Schema sent to the LLM. Adding `output_schema: Schema.optional(Schema.Unknown)` with an `.annotate({ description: ... })` produces:

```json
{
  "output_schema": {
    "description": "Optional JSON Schema that the step output must conform to..."
  }
}
```

The LLM sees a documented optional field. It will use it if it understands JSON Schema syntax. No regression for LLMs that ignore it.

### What happens to cached JSON Schemas?

`json-schema.ts:6` caches by `WeakMap<Schema.Top, JSONSchema7>`. Adding a field creates a new `WorkflowStep` schema → new `WorkflowPlan` schema → new cache key. Old cache dies with old process. ✅

---

## Regression Analysis

### REG-1: `output_schema: Schema.optional(Schema.Unknown)` — backward compatible

All existing workflow calls lack `output_schema`. Effect Schema makes it `undefined` by default. The engine doesn't read it. `StepArray` decode accepts steps without it. No validation runs when missing. **No regression.**

### REG-2: `runSubagent` signature gains `stepId: string`

One implementation (`tool.ts:92`), one call site (`engine.ts:148`). Both updated atomically in same commit. TypeScript compiler catches mismatches. **No regression — compiler-gated.**

### REG-3: Invalid JSON Schema from LLM doesn't crash the workflow

The LLM may generate `{ "type": "nonexistent" }` as `output_schema`. `ajv.compile()` throws on invalid schemas. **Fix verified in plan:** Wrapped in try/catch → returns `[SCHEMA WARNING]` with raw output. Workflow continues. **Addressed.**

**Sub-regression REG-3a:** Failure is not cached — every call with the same invalid schema re-compiles. But this is rare (LLM rarely generates invalid schemas) and cheap (O(1) per check). Acceptable.

### REG-4: Non-JSON subagent output with `output_schema` set

If subagent returns prose but schema expects JSON, `JSON.parse` throws. **Fix verified in plan:** Caught → returns `[SCHEMA ERROR]` with "not valid JSON" message. Workflow continues (step output carries the error as text). **Addressed.**

### REG-5: `~/.arcana/workflows/` directory doesn't conflict

No existing `workflows` dir under `~/.arcana/`. Config scanner doesn't touch this path. **No regression.**

### REG-6: CLI `workflow` subcommand doesn't collide

No existing `workflow` key in engine command loader. Grep confirms only `tool.ts` and `prompt/build.txt` reference "workflow". **No regression.**

### REG-7: `bun add ajv` — new production dependency

No existing validator in `packages/engine/package.json`. `ajv` is ~220KB minified. **No regression — net new dep.**

### REG-8: `arcana workflow show` UX clarity

Renamed from `run` to `show` (v2 fix). Prints JSON for user to feed to agent. Clear intent. **Addressed.**

### REG-9: Path traversal in workflow filenames ⚠️ NEW

`saveWorkflow("../../../etc/passwd")` would write outside `~/.arcana/workflows/`. `path.join` normalizes but doesn't prevent traversal. **Fix:** Validate name with `/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/`. Reject on mismatch. **Added to plan.**

### REG-10: Stdin blocks forever on TTY ⚠️ NEW

`arcana workflow save test` without piping hangs — `for await` on `process.stdin` blocks on TTY. **Fix:** Check `process.stdin.isTTY` before reading. If TTY, error immediately with usage hint. **Added to plan.**

### REG-11: `loadWorkflow` returns unvalidated data ⚠️ NEW

`JSON.parse(...) as WorkflowPlan` — TypeScript cast, no runtime validation. Corrupted file returns garbage. **Fix:** Use `Schema.decodeUnknownSync(WorkflowPlan)(parsed)` from Effect. Throws on invalid data with descriptive error. **Added to plan.**

### REG-12: `JSON.stringify` cache key non-deterministic ⚠️ NEW

Two equivalent schemas with different key ordering get different cache keys → duplicate validators in memory. **Fix:** Sort keys before stringifying: `JSON.stringify(outputSchema, Object.keys(outputSchema).sort())`. **Added to plan.**

### REG-13: LLM doesn't know what `output_schema` is for ⚠️ NEW

`Schema.Unknown` generates `{}` in JSON Schema — no description. LLM sees empty field, doesn't know to put a JSON Schema there. **Fix:** Add `.annotate({ description: "Optional JSON Schema that the step output must conform to..." })`. The description propagates to the generated JSON Schema that the LLM receives. **Added to plan.**

### REG-14: O(n) `steps.find()` per subagent run

Each subagent step does `steps.find(s => s.id === input.stepId)`. For 5-20 steps, negligible. **Acceptable — not worth pre-building a Map.**

### REG-15: `validatorCache` unbounded growth

Each unique schema adds a cache entry. Caches die with the process (workflows run in short-lived sessions). **Acceptable.**

---

## Files

| Action | Path | ~Lines |
|---|---|---|
| Modify | `packages/engine/src/workflow/schema.ts` | +1 field with annotation |
| Modify | `packages/engine/src/workflow/engine.ts` | +1 field in interface, +1 arg in call |
| Modify | `packages/engine/src/workflow/tool.ts` | +2 import, +12 validation, +2 Map build |
| Create | `packages/engine/src/workflow/store.ts` | ~70 lines (adds path validation, schema decode on load) |
| Create | `packages/engine/src/workflow/validate.ts` | ~50 lines (adds deterministic cache key) |
| Create | `packages/engine/src/cli/cmd/workflow.ts` | ~90 lines (adds isTTY check, filename validation) |
| Modify | `packages/engine/src/index.ts` | +2 lines (import + register) |
| Modify | `packages/engine/src/agent/prompt/build.txt` | +5 lines (teach agent to suggest saving) |
| Create | `packages/engine/src/workflow/workflow.test.ts` | ~100 lines (8 tests + store validation test) |

---

## Bite-Sized Tasks

### Task 0: Audit command registration (read-only, 1 min)

```bash
grep -n '"workflow"' L:/PROJECTS/arcana/packages/engine/src/index.ts
```
Expected: No match at command-registration level.

---

### Task 1: Extend `WorkflowStep` schema (2 min)

**File:** `packages/engine/src/workflow/schema.ts`

Insert after the `background` line (line 19):

```typescript
  background: Schema.optional(Schema.Boolean),
  output_schema: Schema.optional(Schema.Unknown).annotate({
    description:
      "Optional JSON Schema that this step's output must conform to. " +
      "Example: {\"type\":\"object\",\"properties\":{\"name\":{\"type\":\"string\"}},\"required\":[\"name\"]}. " +
      "Only applies to subagent steps. Omit to skip validation.",
  }),
})
```

**Why `.annotate()`:** Without it, the generated JSON Schema for the LLM shows `{}` — the LLM doesn't know what to put there. The annotation propagates as a `description` field in the JSON Schema, teaching the LLM how to use it.

**Commit:**

```bash
git add packages/engine/src/workflow/schema.ts
git commit -m "[bump] add annotated output_schema to WorkflowStep"
```

---

### Task 2: Install ajv + create output validation module (5 min)

**Step 2a: Install ajv**

```bash
cd L:/PROJECTS/arcana/packages/engine && bun add ajv
```

**Step 2b: Create validate.ts**

**File:** Create `packages/engine/src/workflow/validate.ts`

```typescript
import Ajv, { type ValidateFunction } from "ajv"

const ajv = new Ajv({ strict: false })
const validatorCache = new Map<string, ValidateFunction>()

/**
 * Deterministic cache key for a JSON Schema object.
 * JSON.stringify alone is NOT deterministic (key ordering varies across
 * JS engines and runs). Sorting top-level keys ensures equivalent schemas
 * share a validator. Nested keys are not sorted — in practice LLM-generated
 * JSON Schemas have consistent internal ordering, making shallow sort sufficient.
 */
function cacheKey(schema: object): string {
  return JSON.stringify(schema, Object.keys(schema).sort())
}

/**
 * Validate step output against its output_schema.
 * Returns original output string if valid, or a prefixed error/warning.
 * Gracefully handles: missing schema, non-JSON output, invalid schema, validation failure.
 */
export function validateStepOutput(
  output: string,
  outputSchema: unknown | undefined,
  stepId: string,
): string {
  // No schema → passthrough
  if (!outputSchema || typeof outputSchema !== "object") return output

  // Schema present — output must be JSON
  let parsed: unknown
  try {
    parsed = JSON.parse(output)
  } catch {
    return (
      `[SCHEMA ERROR] Step "${stepId}" output is not valid JSON, ` +
      `but output_schema requires JSON.\n\nRaw output:\n${output}`
    )
  }

  // Get or compile validator (deterministic cache key)
  const key = cacheKey(outputSchema as Record<string, unknown>)
  let validate = validatorCache.get(key)
  if (!validate) {
    try {
      validate = ajv.compile(outputSchema as object)
    } catch (e) {
      // Invalid JSON Schema — warn, don't block
      return (
        `[SCHEMA WARNING] Step "${stepId}" has an invalid output_schema: ` +
        `${e instanceof Error ? e.message : String(e)}\n\nRaw output:\n${output}`
      )
    }
    validatorCache.set(key, validate)
  }

  const valid = validate(parsed)
  if (valid) return output

  const errors = validate.errors
    ? ajv.errorsText(validate.errors, { dataVar: "output" })
    : "unknown validation error"
  return (
    `[SCHEMA ERROR] Step "${stepId}" output does not match schema:\n` +
    `${errors}\n\nRaw output:\n${output}`
  )
}
```

**Commit:**

```bash
git add packages/engine/src/workflow/validate.ts packages/engine/package.json packages/engine/bun.lockb
git commit -m "[bump] add output validation with deterministic cache keys + ajv dep"
```

---

### Task 3: Wire validation into engine + tool (5 min)

**Files:** `packages/engine/src/workflow/engine.ts`, `packages/engine/src/workflow/tool.ts`

**Step 3a: Extend `WorkflowExecutors.runSubagent` input**

In `engine.ts`, find the `WorkflowExecutors` interface (around `runSubagent`). Add `stepId`:

```typescript
readonly runSubagent: (input: {
  description: string
  prompt: string
  stepId: string          // ← new — identifies the step for output_schema lookup
  subagent_type: string
}) => Effect.Effect<string, Error>
```

**Step 3b: Pass `stepId` from `runStep`**

In `engine.ts`, inside `runStep`, the `case "subagent":` block. Add `stepId`:

```typescript
case "subagent":
  return exec.runSubagent({
    description: step.description,
    prompt: resolveTemplate(step.prompt ?? step.description, outputs),
    stepId: step.id,       // ← new
    subagent_type: step.subagent_type ?? "auto",
  })
```

**Step 3c: Build stepMap + validate in tool callback**

In `tool.ts`, add import:

```typescript
import { validateStepOutput } from "./validate"
```

Inside the `execute` function, AFTER the auto-orchestration block but BEFORE `createEngine` — between lines ~82 and ~90. This ensures `stepMap` captures the final steps (either explicit or LLM-generated):

```typescript
// Build step lookup map for output_schema validation
const stepMap = new Map(steps.map(s => [s.id, s] as const))
```

Then in the `runSubagent` callback (inside `createEngine`), after the existing `.pipe(Effect.map((result) => ...))`:

```typescript
runSubagent: (input) =>
  taskDef
    .execute(
      { description: input.description, prompt: input.prompt, subagent_type: input.subagent_type },
      ctx,
    )
    .pipe(
      Effect.map((result) => {
        const step = stepMap.get(input.stepId)
        if (!step?.output_schema) return result.output
        return validateStepOutput(result.output, step.output_schema, input.stepId)
      }),
    ),
```

**Step 3d: Verify compilation**

```bash
cd L:/PROJECTS/arcana && bun run build   # TypeScript compilation must pass
```

**Commit:**

```bash
git add packages/engine/src/workflow/engine.ts \
        packages/engine/src/workflow/tool.ts
git commit -m "[bump] wire output_schema validation into subagent steps via stepMap"
```

---

### Task 4: Create workflow store with path safety (5 min)

**File:** Create `packages/engine/src/workflow/store.ts`

```typescript
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import { Schema } from "effect"
import { WorkflowPlan } from "./schema"

const WORKFLOW_DIR = join(homedir(), ".arcana", "workflows")

/** Only lowercase letters, digits, and single hyphens between segments. */
const VALID_NAME = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/

function validateName(name: string): void {
  if (!VALID_NAME.test(name)) {
    throw new Error(
      `Invalid workflow name "${name}". Use lowercase letters, digits, and hyphens (e.g., "deploy-check").`
    )
  }
}

function ensureDir() {
  if (!existsSync(WORKFLOW_DIR)) mkdirSync(WORKFLOW_DIR, { recursive: true })
}

export function saveWorkflow(name: string, plan: WorkflowPlan): void {
  validateName(name)
  ensureDir()
  writeFileSync(join(WORKFLOW_DIR, `${name}.json`), JSON.stringify(plan, null, 2), "utf-8")
}

export function loadWorkflow(name: string): WorkflowPlan {
  validateName(name)
  const path = join(WORKFLOW_DIR, `${name}.json`)
  if (!existsSync(path)) throw new Error(`Workflow "${name}" not found`)
  const raw = readFileSync(path, "utf-8")
  const parsed = JSON.parse(raw)
  // Runtime validation — catches corrupted files
  return Schema.decodeUnknownSync(WorkflowPlan)(parsed)
}

export function workflowExists(name: string): boolean {
  validateName(name)
  return existsSync(join(WORKFLOW_DIR, `${name}.json`))
}

export function listWorkflows(): string[] {
  ensureDir()
  return readdirSync(WORKFLOW_DIR)
    .filter((f) => f.endsWith(".json") && !f.startsWith("."))
    .map((f) => f.replace(/\.json$/, ""))
    .sort()
}

export function deleteWorkflow(name: string): void {
  validateName(name)
  const path = join(WORKFLOW_DIR, `${name}.json`)
  if (existsSync(path)) unlinkSync(path)
}
```

**Key safety improvements:**
- `validateName()` prevents `../../../etc/passwd` path traversal (REG-9)
- `Schema.decodeUnknownSync(WorkflowPlan)(parsed)` validates on load (REG-11)
- `.startsWith(".")` filter excludes hidden files from listing

**Commit:**

```bash
git add packages/engine/src/workflow/store.ts
git commit -m "[bump] add safe JSON file store with name validation and schema decode"
```

---

### Task 5: Write E2E tests (5 min)

**File:** Create `packages/engine/src/workflow/workflow.test.ts`

```typescript
import { describe, it, expect, afterEach } from "bun:test"
import { Schema } from "effect"
import { WorkflowStep, WorkflowPlan } from "./schema"
import { saveWorkflow, loadWorkflow, listWorkflows, deleteWorkflow, workflowExists } from "./store"
import { validateStepOutput } from "./validate"

const TEST_NAME = `test_wf_${Date.now()}`

describe("WorkflowStep schema", () => {
  it("decodes step without output_schema", () => {
    const step = { id: "s1", type: "subagent" as const, description: "test" }
    const result = Schema.decodeUnknownSync(WorkflowStep)(step)
    expect(result.output_schema).toBeUndefined()
  })

  it("decodes step with output_schema", () => {
    const schema = { type: "object", properties: { name: { type: "string" } } }
    const result = Schema.decodeUnknownSync(WorkflowStep)({
      id: "s1", type: "subagent" as const, description: "test", output_schema: schema,
    })
    expect(result.output_schema).toEqual(schema)
  })

  it("propagates annotate description to JSON Schema", () => {
    // Schema.toJsonSchemaDocument is the Effect API (returns { schema, definitions })
    const doc = Schema.toJsonSchemaDocument(WorkflowStep, { additionalProperties: true })
    const props = (doc.schema as any).properties
    expect(props.output_schema.description).toBeDefined()
    expect(props.output_schema.description).toContain("JSON Schema")
  })
})

describe("workflow store", () => {
  afterEach(() => { try { deleteWorkflow(TEST_NAME) } catch {} })

  it("save → exists → load → delete → gone", () => {
    const plan = { title: "test", description: "desc", steps: [] }
    saveWorkflow(TEST_NAME, plan)
    expect(workflowExists(TEST_NAME)).toBe(true)
    expect(loadWorkflow(TEST_NAME).title).toBe("test")
    deleteWorkflow(TEST_NAME)
    expect(workflowExists(TEST_NAME)).toBe(false)
  })

  it("load throws for missing workflow", () => {
    expect(() => loadWorkflow("nonexistent-xyz")).toThrow()
  })

  it("rejects path traversal names", () => {
    expect(() => saveWorkflow("../../../etc/passwd", {} as any)).toThrow("Invalid workflow name")
    expect(() => saveWorkflow("a/b", {} as any)).toThrow("Invalid workflow name")
  })

  it("rejects names with special characters", () => {
    expect(() => saveWorkflow("hello world", {} as any)).toThrow("Invalid workflow name")
    expect(() => saveWorkflow("", {} as any)).toThrow("Invalid workflow name")
  })

  it("list returns sorted, excludes hidden files", () => {
    saveWorkflow("zzz-test", { title: "z", description: "", steps: [] })
    saveWorkflow("aaa-test", { title: "a", description: "", steps: [] })
    const list = listWorkflows()
    expect(list.indexOf("aaa-test")).toBeLessThan(list.indexOf("zzz-test"))
    deleteWorkflow("zzz-test")
    deleteWorkflow("aaa-test")
  })
})

describe("validateStepOutput", () => {
  it("passes through when no output_schema", () => {
    expect(validateStepOutput("hello", undefined, "s1")).toBe("hello")
  })

  it("validates JSON against schema successfully", () => {
    const schema = { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] }
    expect(validateStepOutput('{"ok":true}', schema, "s1")).toBe('{"ok":true}')
  })

  it("reports schema violation", () => {
    const schema = { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] }
    const result = validateStepOutput('{"ok":"yes"}', schema, "s1")
    expect(result).toContain("[SCHEMA ERROR]")
    expect(result).toContain("must be boolean")
  })

  it("reports non-JSON output with schema set", () => {
    const result = validateStepOutput("plain text", { type: "object" }, "s1")
    expect(result).toContain("[SCHEMA ERROR]")
    expect(result).toContain("not valid JSON")
  })

  it("warns on invalid schema, doesn't error", () => {
    const result = validateStepOutput("{}", { type: "not-a-real-type" }, "s1")
    expect(result).toContain("[SCHEMA WARNING]")
  })
})
```

**Verification:**

```bash
cd L:/PROJECTS/arcana && bun test packages/engine/src/workflow/workflow.test.ts
```

Expected: 12 tests pass.

**Commit:**

```bash
git add packages/engine/src/workflow/workflow.test.ts
git commit -m "[bump] test: 12 tests — schema, store safety, validation"
```

---

### Task 6: Create CLI commands with stdin safety (5 min)

**File:** Create `packages/engine/src/cli/cmd/workflow.ts`

```typescript
import { cmd } from "./cmd"
import { saveWorkflow, loadWorkflow, listWorkflows, deleteWorkflow, workflowExists } from "../../workflow/store"
import type { CommandModule } from "yargs"

const saveCmd: CommandModule = {
  command: "save <name>",
  describe: "Save a workflow JSON from stdin with a name",
  handler: async (argv: any) => {
    const name = argv.name as string
    // Prevent hanging on TTY with no pipe
    if ((process.stdin as any).isTTY) {
      process.stderr.write(`No piped input. Usage:\n  echo '{"title":"...","description":"...","steps":[...]}' | arcana workflow save ${name}\n`)
      process.exit(1)
    }
    const chunks: Buffer[] = []
    for await (const chunk of process.stdin) {
      if (chunk) chunks.push(Buffer.from(chunk))
    }
    const raw = Buffer.concat(chunks).toString("utf-8").trim()
    if (!raw) {
      process.stderr.write("No input received. Pipe a workflow JSON to stdin.\n")
      process.exit(1)
    }
    try {
      const plan = JSON.parse(raw)
      if (!plan.title || !plan.description) {
        process.stderr.write('Workflow JSON must have "title" and "description" fields\n')
        process.exit(1)
      }
      saveWorkflow(name, plan)
      process.stdout.write(`Workflow "${name}" saved — "${plan.title}" (${plan.steps?.length ?? 0} steps)\n`)
    } catch (e) {
      process.stderr.write(`Invalid input: ${e instanceof Error ? e.message : String(e)}\n`)
      process.exit(1)
    }
  },
}

const showCmd: CommandModule = {
  command: "show <name>",
  describe: "Display a saved workflow JSON (feed to agent's workflow() tool)",
  handler: (argv: any) => {
    const name = argv.name as string
    if (!workflowExists(name)) {
      process.stderr.write(`Workflow "${name}" not found. Use "arcana workflow list".\n`)
      process.exit(1)
    }
    try {
      const plan = loadWorkflow(name)
      process.stdout.write(JSON.stringify(plan, null, 2) + "\n")
    } catch (e) {
      process.stderr.write(`Failed to load "${name}": ${e instanceof Error ? e.message : String(e)}\n`)
      process.exit(1)
    }
  },
}

const listCmd: CommandModule = {
  command: "list",
  describe: "List all saved workflows",
  handler: () => {
    const names = listWorkflows()
    if (names.length === 0) {
      process.stdout.write('No saved workflows. Pipe one in:\n  echo \'{"title":"...","description":"...","steps":[...]}\' | arcana workflow save <name>\n')
      return
    }
    process.stdout.write("Saved workflows:\n")
    for (const name of names) {
      try {
        const plan = loadWorkflow(name)
        process.stdout.write(`  ${name}  →  "${plan.title}"  (${plan.steps?.length ?? 0} steps)\n`)
      } catch {
        process.stdout.write(`  ${name}  →  (corrupted — delete and re-save)\n`)
      }
    }
  },
}

const deleteCmd: CommandModule = {
  command: "delete <name>",
  describe: "Delete a saved workflow",
  handler: (argv: any) => {
    const name = argv.name as string
    if (!workflowExists(name)) {
      process.stderr.write(`Workflow "${name}" not found.\n`)
      process.exit(1)
    }
    deleteWorkflow(name)
    process.stdout.write(`Workflow "${name}" deleted.\n`)
  },
}

export const WorkflowCommand = cmd({
  command: "workflow",
  describe: "Manage saved workflows",
  builder: (yargs) =>
    yargs
      .command(saveCmd)
      .command(showCmd)
      .command(listCmd)
      .command(deleteCmd)
      .demandCommand(1, "Usage: arcana workflow <save|show|list|delete>"),
  handler: () => {},
})
```

**Step 6b: Register in engine command loader**

In `packages/engine/src/index.ts`, add alongside the existing dynamic imports (after line 204):

```typescript
workflow: () => import("./cli/cmd/workflow").then((m) => m.WorkflowCommand),
```

**Verification:**

```bash
cd L:/PROJECTS/arcana && bun run build
arcana workflow list                              # "No saved workflows"
echo '{"title":"Test","description":"desc","steps":[]}' | arcana workflow save test
arcana workflow list                              # Shows "test"
arcana workflow show test                         # Prints JSON
arcana workflow delete test                       # Deletes
arcana workflow save test                         # Runs without pipe → errors immediately (doesn't hang)
```

**Commit:**

```bash
git add packages/engine/src/cli/cmd/workflow.ts packages/engine/src/index.ts
git commit -m "[bump] add save/show/list/delete CLI with stdin safety"
```

---

### Task 7: Teach agent to suggest saving workflows (2 min)

**File:** `packages/engine/src/agent/prompt/build.txt`

Add after the existing workflow section (after "The workflow tool can auto-orchestrate from a high-level goal"):

```text
## After a workflow completes
Tell the user the workflow finished and offer to save it:
- Copy the JSON from your workflow() tool output
- Run: arcana workflow save <name> < workflow.json

Example: "Workflow complete. To reuse this workflow later, save it:
  arcana workflow save deploy-check < workflow.json"
```

**Commit:**

```bash
git add packages/engine/src/agent/prompt/build.txt
git commit -m "[bump] teach agent to suggest saving completed workflows"
```

---

## Final Verification

```bash
cd L:/PROJECTS/arcana

# Build must pass with zero type errors
bun run build

# All workflow tests pass
bun test packages/engine/src/workflow/workflow.test.ts
# Expected: 12 passed

# CLI smoke test
echo '{"title":"smoke","description":"test","steps":[]}' | arcana workflow save smoke-test
arcana workflow list | grep smoke-test
arcana workflow show smoke-test | grep '"title"'
arcana workflow delete smoke-test
arcana workflow list | grep -v smoke-test

# Stdin safety — must NOT hang
arcana workflow save no-pipe
# Expected: immediate error "No piped input"

# Name validation
echo '{"title":"x","description":"y","steps":[]}' | arcana workflow save "../../../bad"
# Expected: error "Invalid workflow name"
```

---

## Risks and Open Questions

1. **Prompt-step validation requires `promptLLM` signature change.** Deferred — subagent steps are the primary use case. `promptLLM` receives only `(prompt: string)` with no step context.

2. **`ajv` is a new dependency.** 220KB, well-maintained, no existing validator in the project. Acceptable.

3. **Output validation is advisory.** Invalid schemas warn, non-JSON output errors, but the workflow continues. This is intentional — schema validation should inform, not block.

4. **Built-in curated workflows are out of scope.** This plan covers persistence + output contracts. Built-in workflows and TUI DAG view are separate plans.

5. **No workflow migration.** If schema changes, old JSON files may fail `Schema.decodeUnknownSync(WorkflowPlan)`. Effect Schema decode on load catches this — corrupted files show an error instead of crashing.

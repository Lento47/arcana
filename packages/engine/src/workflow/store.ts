import { mkdirSync, readdirSync, readFileSync, existsSync, unlinkSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import { Schema } from "effect"
import { WorkflowPlan } from "./schema"
import { atomicWriteSync } from "../util/atomic-write"

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
  atomicWriteSync(join(WORKFLOW_DIR, `${name}.json`), JSON.stringify(plan, null, 2))
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

import type { ClassifiedCall, ToolCallSpec, ToolCapability, ToolRisk } from "./types.js"

type Seed = {
  capability: ToolCapability
  risk: ToolRisk
  paths?: (input: Record<string, unknown>) => { readSet: string[]; writeSet: string[] }
}

function pathField(input: Record<string, unknown>, ...keys: string[]): string[] {
  for (const key of keys) {
    const value = input[key]
    if (typeof value === "string" && value.trim()) return [value.trim()]
    if (Array.isArray(value)) {
      return value.map(String).map((v) => v.trim()).filter(Boolean)
    }
  }
  return []
}

function readPaths(input: Record<string, unknown>) {
  return {
    readSet: pathField(input, "path", "filePath", "filepath", "file", "pattern", "glob"),
    writeSet: [] as string[],
  }
}

function writePaths(input: Record<string, unknown>) {
  const paths = pathField(input, "path", "filePath", "filepath", "file")
  return { readSet: paths, writeSet: paths }
}

const SEED: Record<string, Seed> = {
  read: { capability: "read", risk: "low", paths: readPaths },
  grep: { capability: "read", risk: "low", paths: readPaths },
  glob: { capability: "read", risk: "low", paths: readPaths },
  list: { capability: "read", risk: "low", paths: readPaths },
  git_status: { capability: "read", risk: "low" },
  git_diff: { capability: "read", risk: "low" },
  env_probe: { capability: "read", risk: "low" },
  artifact_get: { capability: "read", risk: "low" },
  memory_search: { capability: "read", risk: "low" },
  skill: { capability: "read", risk: "low" },
  web_fetch: { capability: "network", risk: "medium" },
  web_search: { capability: "network", risk: "medium" },
  webfetch: { capability: "network", risk: "medium" },
  websearch: { capability: "network", risk: "medium" },
  write: { capability: "write", risk: "high", paths: writePaths },
  edit: { capability: "write", risk: "high", paths: writePaths },
  apply_patch: { capability: "write", risk: "high", paths: writePaths },
  delete: { capability: "write", risk: "high", paths: writePaths },
  rename: { capability: "write", risk: "high", paths: writePaths },
  shell: { capability: "shell", risk: "critical" },
  bash: { capability: "shell", risk: "critical" },
  task: { capability: "shell", risk: "high" },
  batch: { capability: "unknown", risk: "critical" },
}

const CAPABILITY_ORDER: Record<ToolCapability, number> = {
  read: 0,
  network: 1,
  write: 2,
  verify: 3,
  shell: 4,
  model: 5,
  unknown: 6,
}

export function capabilityOrder(capability: ToolCapability): number {
  return CAPABILITY_ORDER[capability] ?? 99
}

/** Classify a tool call for batch planning. */
export function classifyTool(call: ToolCallSpec): ClassifiedCall {
  const seed = SEED[call.name] ?? SEED[call.name.toLowerCase()]
  if (!seed) {
    return {
      ...call,
      capability: "unknown",
      risk: "critical",
      readSet: [],
      writeSet: [],
    }
  }
  const sets = seed.paths?.(call.input) ?? { readSet: [], writeSet: [] }
  return {
    ...call,
    capability: seed.capability,
    risk: seed.risk,
    readSet: sets.readSet,
    writeSet: sets.writeSet,
  }
}

export function classifyMany(calls: ToolCallSpec[]): ClassifiedCall[] {
  return calls.map(classifyTool)
}

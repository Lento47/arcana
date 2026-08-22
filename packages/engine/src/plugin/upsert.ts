/**
 * Write or update a local tool plugin. Same id overwrites; never a second copy.
 * Rejects sources that spawn processes, talk to the network, or eval.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import type { ConfigPluginV1 } from "@arcana/core/v1/config/plugin"

const DENY = [
  /\bchild_process\b/,
  /\bBun\.spawn\b/,
  /\bprocess\.exec\b/,
  /\beval\s*\(/,
  /\bFunction\s*\(/,
  /\bfetch\s*\(/,
  /\bWebSocket\b/,
  /\bnet\.connect\b/,
  /\bdns\./,
  /\bfs\.promises\b/,
  /\bcreateWriteStream\b/,
]

export function pluginIdFromName(id: string): string {
  return id.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "") || "plugin"
}

export type PluginUpsertInput = {
  id: string
  description: string
  source: string
  pluginsRoot?: string
}

export type PluginUpsertResult =
  | { ok: true; id: string; path: string; created: boolean }
  | { ok: false; reason: "denied"; detail: string }

export function pluginDenylistHit(source: string): string | undefined {
  for (const rule of DENY) {
    if (rule.test(source)) return rule.source
  }
  return undefined
}

export function pluginSpecifier(plugin: ConfigPluginV1.Spec): string {
  return Array.isArray(plugin) ? plugin[0] : plugin
}

/** Add a file-url spec if missing. Same url is a no-op (never duplicates). */
export function mergePluginSpec(
  existing: ReadonlyArray<ConfigPluginV1.Spec> | undefined,
  fileUrl: string,
): { next: ConfigPluginV1.Spec[]; added: boolean } {
  const current: ConfigPluginV1.Spec[] = existing ? [...existing] : []
  if (current.some((item) => pluginSpecifier(item) === fileUrl)) {
    return { next: current, added: false }
  }
  current.push(fileUrl)
  return { next: current, added: true }
}

export function upsertPlugin(input: PluginUpsertInput): PluginUpsertResult {
  const hit = pluginDenylistHit(input.source)
  if (hit) {
    return { ok: false, reason: "denied", detail: `Plugin source matches denylist: ${hit}` }
  }
  const id = pluginIdFromName(input.id)
  const root = input.pluginsRoot ?? join(process.env.ARCANA_HOME?.trim() || join(homedir(), ".arcana"), "plugins")
  const dir = join(root, id)
  mkdirSync(dir, { recursive: true })
  const path = join(dir, "index.ts")
  const created = !existsSync(path)
  const header = `// arcana-plugin-id: ${id}\n// description: ${input.description.replace(/\r?\n/g, " ")}\n`
  writeFileSync(path, header + input.source.trim() + "\n", "utf8")
  return { ok: true, id, path, created }
}

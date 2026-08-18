/**
 * Minimal opencode.json editing for the `/prompt` command.
 *
 * The engine reads the project `opencode.json` (merged over the global one)
 * with a 5s file-cache TTL, so writes here take effect within seconds —
 * no engine restart needed. We preserve the document shape (including
 * `$schema`) and only touch `agent.<name>.prompt`.
 */

export type ProjectConfig = {
  $schema?: string
  [key: string]: unknown
}

/** Read the project config file; missing/unreadable → undefined. */
export async function readProjectConfig(configPath: string): Promise<ProjectConfig | undefined> {
  try {
    const file = Bun.file(configPath)
    if (!(await file.exists())) return undefined
    return (await file.json()) as ProjectConfig
  } catch {
    return undefined
  }
}

/**
 * Merge an agent prompt into the config document. Returns the updated config
 * plus whether anything changed. An empty prompt removes the key (back to the
 * agent's built-in prompt).
 */
export function setAgentPrompt(config: ProjectConfig | undefined, agent: string, prompt: string): {
  updated: ProjectConfig
  changed: boolean
} {
  const updated: ProjectConfig = { ...(config ?? {}) }
  const agents = { ...((updated.agent as Record<string, unknown> | undefined) ?? {}) }
  const agentConfig = { ...((agents[agent] as Record<string, unknown> | undefined) ?? {}) }
  const trimmed = prompt.trim()

  if (trimmed.length === 0) {
    if (agentConfig.prompt === undefined) return { updated, changed: false }
    delete agentConfig.prompt
  } else if (agentConfig.prompt === trimmed) {
    return { updated, changed: false }
  } else {
    agentConfig.prompt = trimmed
  }

  agents[agent] = agentConfig
  updated.agent = agents
  return { updated, changed: true }
}

/** Path of the global personal-instructions file the engine appends every turn. */
export function soulFilePath(configDir: string): string {
  return `${configDir.replace(/[\\/]+$/, "")}/SOUL.md`
}

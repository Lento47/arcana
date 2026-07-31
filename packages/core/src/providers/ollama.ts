/**
 * Local Ollama detection — single source of truth shared by the engine
 * `arcana doctor` check and the TUI provider discovery.
 *
 * "Detected" means the local daemon answered the `/api/tags` probe. The
 * caller decides what a detection means for its surface: the doctor reports
 * health, the TUI injects the provider only when the daemon also reports
 * models (an empty catalog has nothing to switch to).
 */

export type LocalOllama = {
  port: string
  models: string[]
}

export function detectLocalOllama(opts?: {
  port?: string
  fetch?: typeof fetch
}): Promise<LocalOllama | null> {
  const env = typeof process !== "undefined" ? process.env : undefined
  const port = opts?.port ?? env?.OLLAMA_PORT ?? "11434"
  const fetcher = opts?.fetch ?? fetch

  return fetcher(`http://localhost:${port}/api/tags`)
    .then((r) => {
      if (!r.ok) return null
      return r.json()
    })
    .then((data: unknown) => {
      if (!data || typeof data !== "object") return null
      const models = (data as { models?: unknown[] }).models
      if (!Array.isArray(models)) return null
      return {
        port,
        models: models
          .map((m) => (m && typeof m === "object" ? (m as { name?: unknown }).name : undefined))
          .filter((name): name is string => typeof name === "string"),
      }
    })
    .catch(() => null)
}

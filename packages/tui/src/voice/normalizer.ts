import { detectLocalOllama } from "@arcana/core/providers/ollama"

export type NormalizerConfig = {
  provider: "ollama"
  host: string
  model: string
  prompt: string
}

function expandPrompt(template: string, text: string): string {
  return template.replaceAll("{text}", text)
}

/**
 * Clean up a raw ASR transcript through a local Ollama model.
 *
 * The default model is `superwhisper/s1-mini`. The prompt template may contain
 * `{text}` which is replaced with the raw transcript.
 */
export async function normalize(
  rawText: string,
  config: NormalizerConfig,
  signal?: AbortSignal,
): Promise<string> {
  if (!rawText.trim()) return ""

  const host = config.host.replace(/\/$/, "")
  const url = `${host}/api/generate`

  const abortController = new AbortController()
  if (signal) {
    signal.addEventListener("abort", () => abortController.abort(), { once: true })
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.model,
      prompt: expandPrompt(config.prompt, rawText),
      stream: false,
      options: {
        temperature: 0.1,
        stop: ["\n\n"],
      },
    }),
    signal: abortController.signal,
  })

  if (!response.ok) {
    const body = await response.text().catch(() => "")
    if (response.status === 404 && body.includes("not found")) {
      throw new Error(
        `Ollama model "${config.model}" is not pulled. Run \`ollama pull ${config.model}\` and try again.`,
      )
    }
    throw new Error(`Ollama normalizer failed (${response.status}): ${body.slice(0, 240)}`)
  }

  const data = (await response.json()) as { response?: string }
  const cleaned = typeof data.response === "string" ? data.response.trim() : ""
  if (!cleaned) {
    throw new Error("Normalizer returned empty text.")
  }
  return cleaned
}

/**
 * Check whether the configured Ollama host is reachable and has the model.
 */
export async function normalizerStatus(config: NormalizerConfig): Promise<{
  reachable: boolean
  modelAvailable: boolean
  models: string[]
}> {
  const port = config.host.replace(/^.*:(\d+).*$/, "$1") || undefined
  const ollama = await detectLocalOllama({ port })
  if (!ollama) {
    return { reachable: false, modelAvailable: false, models: [] }
  }
  return {
    reachable: true,
    models: ollama.models,
    modelAvailable: ollama.models.some((name) => name === config.model || name.startsWith(`${config.model}:`)),
  }
}

import { createSignal, onMount, For, Show } from "solid-js"

interface Model {
  id: string
  name?: string
  provider?: string
  maxTokens?: number
  contextWindow?: number
}

interface Provider {
  id: string
  name?: string
  models?: string[]
  status?: string
}

export default function ModelsPage() {
  const [models, setModels] = createSignal<Model[]>([])
  const [providers, setProviders] = createSignal<Provider[]>([])
  const [loading, setLoading] = createSignal(true)
  const [error, setError] = createSignal<string | null>(null)
  const [tab, setTab] = createSignal<"models" | "providers">("models")

  onMount(async () => {
    setLoading(true)
    try {
      const [modelsRes, providersRes] = await Promise.allSettled([
        fetch("/api/enterprise/models"),
        fetch("/api/enterprise/providers"),
      ])
      if (modelsRes.status === "fulfilled" && modelsRes.value.ok) {
        const data: any = await modelsRes.value.json()
        setModels(Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [])
      }
      if (providersRes.status === "fulfilled" && providersRes.value.ok) {
        const data: any = await providersRes.value.json()
        setProviders(Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  })

  return (
    <div style={{ padding: "2rem", "max-width": "1100px" }}>
      <head><title>Models & Providers — Arcana</title></head>

      <header style={{ "margin-bottom": "1.5rem" }}>
        <h1 style={{ "font-size": "1.5rem", "font-weight": "600", color: "var(--arcana-gold)", margin: "0 0 0.25rem 0" }}>
          Models & Providers
        </h1>
        <p style={{ color: "var(--arcana-text-weak)", "font-size": "0.85rem", margin: 0 }}>
          Available model providers and registered models
        </p>
      </header>

      {/* Tab switcher */}
      <div style={{ display: "flex", gap: "0.25rem", "margin-bottom": "1.5rem", background: "var(--arcana-surface)", "border-radius": "8px", padding: "0.25rem", width: "fit-content" }}>
        <For each={[["models", "Models"], ["providers", "Providers"]] as const}>
          {([key, label]) => (
            <button
              onClick={() => setTab(key)}
              style={{
                padding: "0.35rem 1rem",
                "border-radius": "6px",
                border: "none",
                "font-size": "0.8125rem",
                "font-weight": tab() === key ? "500" : "400",
                cursor: "pointer",
                background: tab() === key ? "var(--arcana-surface-raised)" : "transparent",
                color: tab() === key ? "var(--arcana-gold)" : "var(--arcana-text-weak)",
                transition: "all 0.15s ease",
              }}
            >
              {label}
            </button>
          )}
        </For>
      </div>

      <Show when={error()}>
        <div style={{ background: "var(--v2-state-bg-danger)", border: "1px solid var(--v2-state-border-danger)", color: "var(--v2-state-fg-danger)", padding: "0.75rem 1rem", "border-radius": "8px", "font-size": "0.85rem", "margin-bottom": "1rem" }}>
          {error()}
        </div>
      </Show>

      {/* Models tab */}
      <Show when={tab() === "models"}>
        <Show
          when={!loading() && models().length > 0}
          fallback={
            <div style={{ color: "var(--arcana-text-faint)", "font-size": "0.85rem", padding: "2rem", "text-align": "center", border: "1px dashed var(--arcana-border)", "border-radius": "8px" }}>
              {loading() ? "Loading models…" : "No models registered"}
            </div>
          }
        >
          <div style={{ display: "grid", "grid-template-columns": "repeat(auto-fill, minmax(280px, 1fr))", gap: "0.75rem" }}>
            <For each={models()}>
              {(model) => (
                <div
                  style={{
                    background: "var(--arcana-surface)",
                    border: "1px solid var(--arcana-border)",
                    "border-radius": "8px",
                    padding: "1rem",
                    display: "flex",
                    "flex-direction": "column",
                    gap: "0.375rem",
                  }}
                >
                  <span style={{ "font-size": "0.85rem", "font-weight": "500", color: "var(--arcana-text)" }}>
                    {model.name || model.id}
                  </span>
                  <span style={{ "font-size": "0.75rem", color: "var(--arcana-text-faint)", "font-family": "var(--font-family-mono)" }}>
                    {model.id}
                  </span>
                  <Show when={model.provider}>
                    <span style={{ "font-size": "0.7rem", color: "var(--arcana-violet)" }}>
                      {model.provider}
                    </span>
                  </Show>
                  <Show when={model.contextWindow}>
                    <span style={{ "font-size": "0.7rem", color: "var(--arcana-text-faint)" }}>
                      context: {(model.contextWindow! / 1000).toFixed(0)}k
                    </span>
                  </Show>
                </div>
              )}
            </For>
          </div>
        </Show>
      </Show>

      {/* Providers tab */}
      <Show when={tab() === "providers"}>
        <Show
          when={!loading() && providers().length > 0}
          fallback={
            <div style={{ color: "var(--arcana-text-faint)", "font-size": "0.85rem", padding: "2rem", "text-align": "center", border: "1px dashed var(--arcana-border)", "border-radius": "8px" }}>
              {loading() ? "Loading providers…" : "No providers registered"}
            </div>
          }
        >
          <div style={{ display: "flex", "flex-direction": "column", gap: "0.5rem" }}>
            <For each={providers()}>
              {(provider) => (
                <div
                  style={{
                    display: "flex",
                    "align-items": "center",
                    "justify-content": "space-between",
                    padding: "0.75rem 1rem",
                    background: "var(--arcana-surface)",
                    border: "1px solid var(--arcana-border)",
                    "border-radius": "8px",
                  }}
                >
                  <div style={{ display: "flex", "flex-direction": "column", gap: "0.125rem" }}>
                    <span style={{ "font-size": "0.85rem", color: "var(--arcana-text)" }}>
                      {provider.name || provider.id}
                    </span>
                    <span style={{ "font-size": "0.75rem", color: "var(--arcana-text-faint)", "font-family": "var(--font-family-mono)" }}>
                      {provider.id}
                    </span>
                  </div>
                  <div style={{ display: "flex", "align-items": "center", gap: "0.75rem" }}>
                    <Show when={provider.models?.length}>
                      <span style={{ "font-size": "0.7rem", color: "var(--arcana-text-faint)" }}>
                        {provider.models!.length} models
                      </span>
                    </Show>
                    <span
                      style={{
                        "font-size": "0.65rem",
                        padding: "0.125rem 0.5rem",
                        "border-radius": "9999px",
                        background: provider.status === "active" ? "var(--v2-state-bg-success)" : "var(--arcana-surface-raised)",
                        color: provider.status === "active" ? "var(--v2-state-fg-success)" : "var(--arcana-text-weak)",
                        "text-transform": "uppercase",
                        "letter-spacing": "0.05em",
                      }}
                    >
                      {provider.status || "unknown"}
                    </span>
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>
      </Show>
    </div>
  )
}

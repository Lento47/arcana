import { createSignal, onMount, For, Show, createMemo } from "solid-js"

interface Skill {
  id: string
  name?: string
  description?: string
  version?: string
  enabled?: boolean
  tags?: string[]
}

export default function SkillsPage() {
  const [skills, setSkills] = createSignal<Skill[]>([])
  const [loading, setLoading] = createSignal(true)
  const [error, setError] = createSignal<string | null>(null)
  const [search, setSearch] = createSignal("")

  const filtered = createMemo(() => {
    const q = search().toLowerCase()
    if (!q) return skills()
    return skills().filter(
      (s) =>
        s.id.toLowerCase().includes(q) ||
        (s.name ?? "").toLowerCase().includes(q) ||
        (s.description ?? "").toLowerCase().includes(q) ||
        s.tags?.some((t) => t.toLowerCase().includes(q))
    )
  })

  onMount(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/enterprise/skills")
      if (!res.ok) {
        const body: any = await res.json().catch(() => ({}))
        throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`)
      }
      const data: any = await res.json()
      setSkills(Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  })

  return (
    <div style={{ padding: "2rem", "max-width": "1100px" }}>
      <head><title>Skills — Arcana</title></head>

      <header style={{ "margin-bottom": "1.5rem" }}>
        <h1 style={{ "font-size": "1.5rem", "font-weight": "600", color: "var(--arcana-gold)", margin: "0 0 0.25rem 0" }}>
          Skills
        </h1>
        <p style={{ color: "var(--arcana-text-weak)", "font-size": "0.85rem", margin: 0 }}>
          Registered skill catalog and capabilities
        </p>
      </header>

      <section style={{ display: "flex", gap: "0.75rem", "align-items": "center", "margin-bottom": "1.5rem" }}>
        <input
          type="text"
          value={search()}
          onInput={(e) => setSearch(e.currentTarget.value)}
          placeholder="Search skills…"
          style={{
            flex: 1,
            background: "var(--arcana-surface-raised)",
            border: "1px solid var(--arcana-border)",
            color: "var(--arcana-text)",
            padding: "0.4rem 0.75rem",
            "border-radius": "6px",
            "font-size": "0.8125rem",
            outline: "none",
            "max-width": "320px",
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = "var(--arcana-violet)" }}
          onBlur={(e) => { e.currentTarget.style.borderColor = "var(--arcana-border)" }}
        />
        <span style={{ "font-size": "0.75rem", color: "var(--arcana-text-faint)" }}>
          {filtered().length} skills
        </span>
      </section>

      <Show when={error()}>
        <div style={{ background: "var(--v2-state-bg-danger)", border: "1px solid var(--v2-state-border-danger)", color: "var(--v2-state-fg-danger)", padding: "0.75rem 1rem", "border-radius": "8px", "font-size": "0.85rem", "margin-bottom": "1rem" }}>
          {error()}
        </div>
      </Show>

      <Show
        when={!loading() && filtered().length > 0}
        fallback={
          <div style={{ color: "var(--arcana-text-faint)", "font-size": "0.85rem", padding: "2rem", "text-align": "center", border: "1px dashed var(--arcana-border)", "border-radius": "8px" }}>
            {loading() ? "Loading skills…" : "No skills found"}
          </div>
        }
      >
        <div style={{ display: "grid", "grid-template-columns": "repeat(auto-fill, minmax(300px, 1fr))", gap: "0.75rem" }}>
          <For each={filtered()}>
            {(skill) => (
              <div
                style={{
                  background: "var(--arcana-surface)",
                  border: "1px solid var(--arcana-border)",
                  "border-radius": "8px",
                  padding: "1rem",
                  display: "flex",
                  "flex-direction": "column",
                  gap: "0.375rem",
                  transition: "border-color 0.15s ease",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--arcana-violet-dim)" }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--arcana-border)" }}
              >
                <div style={{ display: "flex", "justify-content": "space-between", "align-items": "flex-start" }}>
                  <span style={{ "font-size": "0.85rem", "font-weight": "500", color: "var(--arcana-text)" }}>
                    {skill.name || skill.id}
                  </span>
                  <Show when={skill.version}>
                    <span style={{ "font-size": "0.65rem", color: "var(--arcana-text-faint)", "font-family": "var(--font-family-mono)" }}>
                      v{skill.version}
                    </span>
                  </Show>
                </div>
                <span style={{ "font-size": "0.75rem", color: "var(--arcana-text-faint)", "font-family": "var(--font-family-mono)" }}>
                  {skill.id}
                </span>
                <Show when={skill.description}>
                  <span style={{ "font-size": "0.8125rem", color: "var(--arcana-text-weak)", "line-height": "1.4" }}>
                    {skill.description}
                  </span>
                </Show>
                <Show when={skill.tags?.length}>
                  <div style={{ display: "flex", gap: "0.375rem", "flex-wrap": "wrap", "margin-top": "0.25rem" }}>
                    <For each={skill.tags!}>
                      {(tag) => (
                        <span
                          style={{
                            "font-size": "0.65rem",
                            padding: "0.0625rem 0.375rem",
                            "border-radius": "9999px",
                            background: "var(--arcana-violet-dim)",
                            color: "var(--arcana-violet)",
                          }}
                        >
                          {tag}
                        </span>
                      )}
                    </For>
                  </div>
                </Show>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}

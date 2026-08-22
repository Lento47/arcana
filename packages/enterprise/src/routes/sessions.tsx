import { createSignal, onMount, For, Show, createMemo } from "solid-js"

interface Session {
  id: string
  title?: string
  status?: string
  agent?: string
  model?: string
  created?: string
  workspace?: string
}

export default function SessionsPage() {
  const [sessions, setSessions] = createSignal<Session[]>([])
  const [loading, setLoading] = createSignal(true)
  const [error, setError] = createSignal<string | null>(null)
  const [search, setSearch] = createSignal("")
  const [cursor, setCursor] = createSignal<{ next?: string; previous?: string }>({})

  const filtered = createMemo(() => {
    const q = search().toLowerCase()
    if (!q) return sessions()
    return sessions().filter(
      (s) =>
        s.id.toLowerCase().includes(q) ||
        (s.title ?? "").toLowerCase().includes(q) ||
        (s.agent ?? "").toLowerCase().includes(q) ||
        (s.model ?? "").toLowerCase().includes(q)
    )
  })

  const fetchSessions = async (cursorVal?: string) => {
    setLoading(true)
    setError(null)
    try {
      const url = cursorVal
        ? `/api/enterprise/sessions?cursor=${encodeURIComponent(cursorVal)}`
        : "/api/enterprise/sessions?limit=50"
      const res = await fetch(url)
      if (!res.ok) {
        const body: any = await res.json().catch(() => ({}))
        throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`)
      }
      const data: any = await res.json()
      setSessions(Array.isArray(data?.data) ? data.data : [])
      setCursor(data?.cursor ?? {})
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  onMount(() => fetchSessions())

  return (
    <div style={{ padding: "2rem", "max-width": "1100px" }}>
      <head><title>Sessions — Arcana</title></head>

      <header style={{ "margin-bottom": "1.5rem" }}>
        <h1 style={{ "font-size": "1.5rem", "font-weight": "600", color: "var(--arcana-gold)", margin: "0 0 0.25rem 0" }}>
          Sessions
        </h1>
        <p style={{ color: "var(--arcana-text-weak)", "font-size": "0.85rem", margin: 0 }}>
          Browse and inspect agent sessions
        </p>
      </header>

      {/* Search + refresh */}
      <section style={{ display: "flex", gap: "0.75rem", "align-items": "center", "margin-bottom": "1.5rem" }}>
        <input
          type="text"
          value={search()}
          onInput={(e) => setSearch(e.currentTarget.value)}
          placeholder="Search sessions…"
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
        <button
          onClick={() => fetchSessions()}
          style={{
            background: "var(--arcana-gold)",
            color: "var(--arcana-void)",
            border: "none",
            padding: "0.4rem 1rem",
            "border-radius": "6px",
            "font-size": "0.8125rem",
            "font-weight": "600",
            cursor: "pointer",
          }}
        >
          Refresh
        </button>
        <Show when={cursor().next}>
          <button
            onClick={() => fetchSessions(cursor().next)}
            style={{
              background: "transparent",
              color: "var(--arcana-text)",
              border: "1px solid var(--arcana-border)",
              padding: "0.4rem 0.75rem",
              "border-radius": "6px",
              "font-size": "0.8125rem",
              cursor: "pointer",
            }}
          >
            Next →
          </button>
        </Show>
      </section>

      <Show when={error()}>
        <div style={{ background: "var(--v2-state-bg-danger)", border: "1px solid var(--v2-state-border-danger)", color: "var(--v2-state-fg-danger)", padding: "0.75rem 1rem", "border-radius": "8px", "font-size": "0.85rem", "margin-bottom": "1rem" }}>
          {error()}
        </div>
      </Show>

      {/* Session list */}
      <Show
        when={!loading() && filtered().length > 0}
        fallback={
          <div style={{ color: "var(--arcana-text-faint)", "font-size": "0.85rem", padding: "2rem", "text-align": "center", border: "1px dashed var(--arcana-border)", "border-radius": "8px" }}>
            {loading() ? "Loading sessions…" : "No sessions found"}
          </div>
        }
      >
        <div style={{ display: "flex", "flex-direction": "column", gap: "0.5rem" }}>
          <For each={filtered()}>
            {(session) => (
              <div
                style={{
                  display: "flex",
                  "align-items": "center",
                  "justify-content": "space-between",
                  padding: "0.75rem 1rem",
                  background: "var(--arcana-surface)",
                  border: "1px solid var(--arcana-border)",
                  "border-radius": "8px",
                  cursor: "pointer",
                  transition: "border-color 0.15s ease",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--arcana-violet-dim)" }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--arcana-border)" }}
              >
                <div style={{ display: "flex", "flex-direction": "column", gap: "0.125rem", "min-width": "0", flex: 1 }}>
                  <span style={{ "font-size": "0.85rem", color: "var(--arcana-text)", "white-space": "nowrap", overflow: "hidden", "text-overflow": "ellipsis" }}>
                    {session.title || session.id}
                  </span>
                  <div style={{ display: "flex", gap: "0.75rem", "font-size": "0.75rem", color: "var(--arcana-text-faint)" }}>
                    <span style={{ "font-family": "var(--font-family-mono)" }}>{session.id.slice(0, 12)}…</span>
                    <Show when={session.agent}><span>agent: {session.agent}</span></Show>
                    <Show when={session.model}><span>model: {session.model}</span></Show>
                  </div>
                </div>
                <div style={{ display: "flex", "align-items": "center", gap: "0.75rem" }}>
                  <Show when={session.created}>
                    <span style={{ "font-size": "0.7rem", color: "var(--arcana-text-faint)" }}>
                      {new Date(session.created!).toLocaleDateString()}
                    </span>
                  </Show>
                  <span
                    style={{
                      "font-size": "0.65rem",
                      padding: "0.125rem 0.5rem",
                      "border-radius": "9999px",
                      background: session.status === "active" ? "var(--v2-state-bg-success)" : "var(--arcana-surface-raised)",
                      color: session.status === "active" ? "var(--v2-state-fg-success)" : "var(--arcana-text-weak)",
                      "text-transform": "uppercase",
                      "letter-spacing": "0.05em",
                    }}
                  >
                    {session.status || "idle"}
                  </span>
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}

import { createSignal, onMount, For, Show, createMemo } from "solid-js"

interface HealthStatus {
  healthy: boolean
  version?: string
  uptime?: number
}

interface SessionSummary {
  id: string
  title?: string
  status?: string
  created?: string
}

export default function Dashboard() {
  const [health, setHealth] = createSignal<HealthStatus | null>(null)
  const [sessions, setSessions] = createSignal<SessionSummary[]>([])
  const [loading, setLoading] = createSignal(true)
  const [error, setError] = createSignal<string | null>(null)

  onMount(async () => {
    setLoading(true)
    try {
      const [healthRes, sessionsRes] = await Promise.allSettled([
        fetch("/api/enterprise/health"),
        fetch("/api/enterprise/sessions?limit=5"),
      ])

      if (healthRes.status === "fulfilled" && healthRes.value.ok) {
        setHealth(await healthRes.value.json())
      } else {
        setHealth({ healthy: false })
      }

      if (sessionsRes.status === "fulfilled" && sessionsRes.value.ok) {
        const data: any = await sessionsRes.value.json()
        setSessions(Array.isArray(data?.data) ? data.data : [])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  })

  const statusColor = createMemo(() => {
    const h = health()
    if (!h) return "var(--arcana-text-faint)"
    return h.healthy ? "var(--arcana-success)" : "var(--arcana-danger)"
  })

  const statusLabel = createMemo(() => {
    const h = health()
    if (!h) return "checking…"
    return h.healthy ? "connected" : "offline"
  })

  return (
    <div style={{ padding: "2rem", "max-width": "960px" }}>
      {/* Header */}
      <header style={{ "margin-bottom": "2rem" }}>
        <h1
          style={{
            "font-size": "1.75rem",
            "font-weight": "600",
            color: "var(--arcana-gold)",
            "letter-spacing": "0.08em",
            margin: "0 0 0.25rem 0",
          }}
        >
          ⛧ ARCANA
        </h1>
        <p style={{ color: "var(--arcana-text-weak)", "font-size": "0.85rem", margin: 0 }}>
          governed autonomy runtime · operator console
        </p>
      </header>

      {/* Status cards */}
      <section
        style={{
          display: "grid",
          "grid-template-columns": "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "1rem",
          "margin-bottom": "2rem",
        }}
      >
        <StatCard label="Engine" value={statusLabel()} color={statusColor()} />
        <StatCard label="Sessions" value={sessions().length.toString()} color="var(--arcana-violet)" />
        <StatCard label="Version" value={health()?.version ?? "—"} color="var(--arcana-text-weak)" />
        <StatCard label="Governance" value="active" color="var(--arcana-gold)" />
      </section>

      {/* Error */}
      <Show when={error()}>
        <div
          style={{
            background: "var(--v2-state-bg-danger)",
            border: "1px solid var(--v2-state-border-danger)",
            color: "var(--v2-state-fg-danger)",
            padding: "0.75rem 1rem",
            "border-radius": "8px",
            "font-size": "0.85rem",
            "margin-bottom": "1.5rem",
          }}
        >
          {error()}
        </div>
      </Show>

      {/* Recent sessions */}
      <section>
        <h2
          style={{
            "font-size": "1rem",
            "font-weight": "500",
            color: "var(--arcana-violet)",
            margin: "0 0 1rem 0",
          }}
        >
          Recent Sessions
        </h2>
        <Show
          when={sessions().length > 0}
          fallback={
            <div
              style={{
                color: "var(--arcana-text-faint)",
                "font-size": "0.85rem",
                padding: "2rem",
                "text-align": "center",
                border: "1px dashed var(--arcana-border)",
                "border-radius": "8px",
              }}
            >
              <Show when={loading()} fallback="No active sessions">
                Loading sessions…
              </Show>
            </div>
          }
        >
          <div style={{ display: "flex", "flex-direction": "column", gap: "0.5rem" }}>
            <For each={sessions()}>
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
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "var(--arcana-violet-dim)"
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--arcana-border)"
                  }}
                >
                  <div style={{ display: "flex", "flex-direction": "column", gap: "0.125rem" }}>
                    <span style={{ "font-size": "0.85rem", color: "var(--arcana-text)" }}>
                      {session.title || session.id}
                    </span>
                    <span style={{ "font-size": "0.75rem", color: "var(--arcana-text-faint)" }}>
                      {session.id}
                    </span>
                  </div>
                  <span
                    style={{
                      "font-size": "0.7rem",
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
              )}
            </For>
          </div>
        </Show>
      </section>

      {/* Quick links */}
      <section style={{ "margin-top": "2rem" }}>
        <h2
          style={{
            "font-size": "1rem",
            "font-weight": "500",
            color: "var(--arcana-violet)",
            margin: "0 0 1rem 0",
          }}
        >
          Governance
        </h2>
        <div
          style={{
            display: "grid",
            "grid-template-columns": "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "0.75rem",
          }}
        >
          <QuickLink href="/auditor" label="Audit Events" description="Inspect proofs and archives" />
          <QuickLink href="/escalation" label="Escalation Queue" description="Review pending approvals" />
          <QuickLink href="/proofs" label="Proof Search" description="Verify run evidence" />
          <QuickLink href="/sessions" label="All Sessions" description="Browse session history" />
        </div>
      </section>

      {/* Footer */}
      <footer
        style={{
          "margin-top": "3rem",
          "padding-top": "1rem",
          "border-top": "1px solid var(--arcana-border)",
          color: "var(--arcana-text-faint)",
          "font-size": "0.75rem",
        }}
      >
        arcana enterprise · governed autonomy runtime · model proposes · engine decides · proof records
      </footer>
    </div>
  )
}

function StatCard(props: { label: string; value: string; color: string }) {
  return (
    <div
      style={{
        background: "var(--arcana-surface)",
        border: "1px solid var(--arcana-border)",
        "border-radius": "8px",
        padding: "1rem 1.25rem",
        display: "flex",
        "flex-direction": "column",
        gap: "0.25rem",
      }}
    >
      <span
        style={{
          "font-size": "0.7rem",
          color: "var(--arcana-text-faint)",
          "text-transform": "uppercase",
          "letter-spacing": "0.1em",
        }}
      >
        {props.label}
      </span>
      <span
        style={{
          "font-size": "1.25rem",
          "font-weight": "600",
          color: props.color,
        }}
      >
        {props.value}
      </span>
    </div>
  )
}

function QuickLink(props: { href: string; label: string; description: string }) {
  return (
    <a
      href={props.href}
      style={{
        display: "flex",
        "flex-direction": "column",
        gap: "0.25rem",
        padding: "0.75rem 1rem",
        background: "var(--arcana-surface)",
        border: "1px solid var(--arcana-border)",
        "border-radius": "8px",
        "text-decoration": "none",
        cursor: "pointer",
        transition: "border-color 0.15s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--arcana-gold-dim)"
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--arcana-border)"
      }}
    >
      <span style={{ "font-size": "0.85rem", "font-weight": "500", color: "var(--arcana-text)" }}>
        {props.label}
      </span>
      <span style={{ "font-size": "0.75rem", color: "var(--arcana-text-faint)" }}>{props.description}</span>
    </a>
  )
}

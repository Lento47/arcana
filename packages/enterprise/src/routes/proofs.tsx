import { createSignal, For, Show } from "solid-js"

interface ProofResult {
  id: string
  sessionId?: string
  status?: string
  fingerprint?: string
  events?: number
  verified?: boolean
  created?: string
}

export default function ProofsPage() {
  const [query, setQuery] = createSignal("")
  const [results, setResults] = createSignal<ProofResult[]>([])
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  const [searched, setSearched] = createSignal(false)

  const handleSearch = async () => {
    const q = query().trim()
    if (!q) return
    setLoading(true)
    setError(null)
    setSearched(true)
    try {
      const res = await fetch(`/api/enterprise/proofs/search?q=${encodeURIComponent(q)}`)
      if (!res.ok) {
        const body: any = await res.json().catch(() => ({}))
        throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`)
      }
      const data: any = await res.json()
      setResults(Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  const handleVerify = async (proofId: string) => {
    try {
      const res = await fetch(`/api/enterprise/proofs/${encodeURIComponent(proofId)}/verify`, { method: "POST" })
      if (!res.ok) {
        const body: any = await res.json().catch(() => ({}))
        throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`)
      }
      const data: any = await res.json()
      // Update the result in place
      setResults((prev) =>
        prev.map((r) => (r.id === proofId ? { ...r, verified: data?.verified ?? true } : r))
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div style={{ padding: "2rem", "max-width": "1100px" }}>
      <head><title>Proof Search — Arcana</title></head>

      <header style={{ "margin-bottom": "1.5rem" }}>
        <h1 style={{ "font-size": "1.5rem", "font-weight": "600", color: "var(--arcana-gold)", margin: "0 0 0.25rem 0" }}>
          Proof Search
        </h1>
        <p style={{ color: "var(--arcana-text-weak)", "font-size": "0.85rem", margin: 0 }}>
          Search and verify RunProof evidence · model proposes · engine decides · proof records
        </p>
      </header>

      {/* Search bar */}
      <section style={{ display: "flex", gap: "0.75rem", "align-items": "center", "margin-bottom": "1.5rem" }}>
        <input
          type="text"
          value={query()}
          onInput={(e) => setQuery(e.currentTarget.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSearch() }}
          placeholder="Search by proof ID, session ID, or fingerprint…"
          style={{
            flex: 1,
            background: "var(--arcana-surface-raised)",
            border: "1px solid var(--arcana-border)",
            color: "var(--arcana-text)",
            padding: "0.5rem 0.75rem",
            "border-radius": "6px",
            "font-size": "0.8125rem",
            outline: "none",
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = "var(--arcana-violet)" }}
          onBlur={(e) => { e.currentTarget.style.borderColor = "var(--arcana-border)" }}
        />
        <button
          onClick={handleSearch}
          disabled={loading() || !query().trim()}
          style={{
            background: "var(--arcana-gold)",
            color: "var(--arcana-void)",
            border: "none",
            padding: "0.5rem 1.25rem",
            "border-radius": "6px",
            "font-size": "0.8125rem",
            "font-weight": "600",
            cursor: loading() || !query().trim() ? "not-allowed" : "pointer",
            opacity: loading() || !query().trim() ? 0.6 : 1,
          }}
        >
          {loading() ? "Searching…" : "Search"}
        </button>
      </section>

      <Show when={error()}>
        <div style={{ background: "var(--v2-state-bg-danger)", border: "1px solid var(--v2-state-border-danger)", color: "var(--v2-state-fg-danger)", padding: "0.75rem 1rem", "border-radius": "8px", "font-size": "0.85rem", "margin-bottom": "1rem" }}>
          {error()}
        </div>
      </Show>

      {/* Results */}
      <Show
        when={searched() && !loading() && results().length > 0}
        fallback={
          <Show when={searched() && !loading()}>
            <div style={{ color: "var(--arcana-text-faint)", "font-size": "0.85rem", padding: "2rem", "text-align": "center", border: "1px dashed var(--arcana-border)", "border-radius": "8px" }}>
              No proofs found for "{query()}"
            </div>
          </Show>
        }
      >
        <div style={{ display: "flex", "flex-direction": "column", gap: "0.5rem" }}>
          <For each={results()}>
            {(proof) => (
              <div
                style={{
                  display: "flex",
                  "align-items": "center",
                  "justify-content": "space-between",
                  padding: "0.75rem 1rem",
                  background: "var(--arcana-surface)",
                  border: "1px solid var(--arcana-border)",
                  "border-radius": "8px",
                  transition: "border-color 0.15s ease",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--arcana-violet-dim)" }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--arcana-border)" }}
              >
                <div style={{ display: "flex", "flex-direction": "column", gap: "0.125rem", "min-width": "0", flex: 1 }}>
                  <div style={{ display: "flex", gap: "0.75rem", "align-items": "center" }}>
                    <span style={{ "font-size": "0.85rem", color: "var(--arcana-text)", "font-family": "var(--font-family-mono)" }}>
                      {proof.id}
                    </span>
                    <Show when={proof.verified !== undefined}>
                      <span
                        style={{
                          "font-size": "0.65rem",
                          padding: "0.0625rem 0.375rem",
                          "border-radius": "9999px",
                          background: proof.verified ? "var(--v2-state-bg-success)" : "var(--v2-state-bg-danger)",
                          color: proof.verified ? "var(--v2-state-fg-success)" : "var(--v2-state-fg-danger)",
                          "text-transform": "uppercase",
                          "letter-spacing": "0.05em",
                        }}
                      >
                        {proof.verified ? "verified" : "unverified"}
                      </span>
                    </Show>
                  </div>
                  <div style={{ display: "flex", gap: "0.75rem", "font-size": "0.75rem", color: "var(--arcana-text-faint)" }}>
                    <Show when={proof.sessionId}>
                      <span>session: {proof.sessionId!.slice(0, 12)}…</span>
                    </Show>
                    <Show when={proof.fingerprint}>
                      <span>fp: {proof.fingerprint!.slice(0, 16)}…</span>
                    </Show>
                    <Show when={proof.events !== undefined}>
                      <span>{proof.events} events</span>
                    </Show>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <Show when={!proof.verified}>
                    <button
                      onClick={() => handleVerify(proof.id)}
                      style={{
                        background: "var(--arcana-violet)",
                        color: "#fff",
                        border: "none",
                        padding: "0.3rem 0.75rem",
                        "border-radius": "6px",
                        "font-size": "0.75rem",
                        "font-weight": "500",
                        cursor: "pointer",
                      }}
                    >
                      Verify
                    </button>
                  </Show>
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}

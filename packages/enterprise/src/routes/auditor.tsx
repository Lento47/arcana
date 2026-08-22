import { createSignal, createMemo, For, Match, Switch, Show, createEffect, on } from "solid-js"
import { useSearchParams } from "@solidjs/router"
import {
  truncateHash,
  mapAuditEvent,
  formatSweepResult,
  parseRetentionSweepNow,
  readApiError,
  type AuditEvent,
} from "~/core/auditor-console"

const DEFAULT_TENANT = "org-1"

interface ArchiveExport {
  kind: "EXPORTED"
  proofJson: string
  fingerprint: string
  custody: Array<{ who: string; action: string; at: string }>
}

interface ArchiveRejected {
  kind: "REJECTED"
  reason: string
}

interface LegalHoldResponse {
  ok: boolean
  reason?: string
}

interface RetentionSweepResponse {
  deleted: number
  retainedByHold: number
}

export default function AuditorConsole() {
  const [searchParams, setSearchParams] = useSearchParams<{ tenantId?: string }>()
  const tenantId = createMemo(() => searchParams.tenantId || DEFAULT_TENANT)

  const [events, setEvents] = createSignal<AuditEvent[]>([])
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  const [selectedArchive, setSelectedArchive] = createSignal<string>("")
  const [archiveExport, setArchiveExport] = createSignal<ArchiveExport | ArchiveRejected | null>(null)
  const exported = createMemo<ArchiveExport | null>(() => {
    const r = archiveExport()
    return r && r.kind === "EXPORTED" ? r : null
  })
  const rejected = createMemo<ArchiveRejected | null>(() => {
    const r = archiveExport()
    return r && r.kind === "REJECTED" ? r : null
  })
  const [sweepResult, setSweepResult] = createSignal<string | null>(null)
  const [sweepLoading, setSweepLoading] = createSignal(false)
  const [sweepError, setSweepError] = createSignal<string | null>(null)
  const [actionResult, setActionResult] = createSignal<string | null>(null)

  const fetchEvents = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/enterprise/organizations/${encodeURIComponent(tenantId())}/audit`
      )
      if (!res.ok) throw new Error(await readApiError(res))
      const data = await res.json() as AuditEvent[]
      setEvents(Array.isArray(data) ? data : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  createEffect(on(tenantId, () => {
    void fetchEvents()
  }))

  const fetchArchiveExport = async (archiveId: string) => {
    if (!archiveId) return
    setArchiveExport(null)
    try {
      const res = await fetch(
        `/api/enterprise/organizations/${encodeURIComponent(tenantId())}/audit-archive/${encodeURIComponent(archiveId)}/export`
      )
      if (!res.ok) throw new Error(await readApiError(res))
      const data = await res.json()
      setArchiveExport(data as ArchiveExport | ArchiveRejected)
    } catch (e) {
      setArchiveExport({ kind: "REJECTED", reason: e instanceof Error ? e.message : String(e) })
    }
  }

  const postCustody = async (archiveId: string, action: string) => {
    const id = archiveId.trim()
    if (!id) { setActionResult("archive id required"); return { ok: false, reason: "archive id required" } }
    try {
      const res = await fetch(
        `/api/enterprise/organizations/${encodeURIComponent(tenantId())}/audit-archive/${encodeURIComponent(id)}/custody`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) }
      )
      if (!res.ok) throw new Error(await readApiError(res))
      const data = (await res.json()) as LegalHoldResponse
      setActionResult(data.ok === false ? (data.reason ?? "custody failed") : `custody ${action}`)
      return data
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e)
      setActionResult(reason)
      return { ok: false, reason }
    }
  }

  const postLegalHold = async (archiveId: string, action: "PLACE" | "REMOVE") => {
    const id = archiveId.trim()
    if (!id) { setActionResult("archive id required"); return { ok: false, reason: "archive id required" } }
    try {
      const res = await fetch(
        `/api/enterprise/organizations/${encodeURIComponent(tenantId())}/audit-archive/${encodeURIComponent(id)}/legal-hold`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) }
      )
      if (!res.ok) throw new Error(await readApiError(res))
      const data = (await res.json()) as LegalHoldResponse
      setActionResult(data.ok === false ? (data.reason ?? "legal hold failed") : `legal hold ${action}`)
      return data
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e)
      setActionResult(reason)
      return { ok: false, reason }
    }
  }

  const postRetentionSweep = async (rawNow?: string) => {
    setSweepLoading(true); setSweepError(null); setSweepResult(null)
    try {
      const parsed = parseRetentionSweepNow(rawNow)
      if (parsed.error) { setSweepError(parsed.error); return }
      const body: Record<string, string> = {}
      if (parsed.now) body.now = parsed.now
      const res = await fetch(
        `/api/enterprise/organizations/${encodeURIComponent(tenantId())}/audit-archive/retention-sweep`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      )
      if (!res.ok) throw new Error(await readApiError(res))
      const data = (await res.json()) as RetentionSweepResponse
      setSweepResult(formatSweepResult(data))
    } catch (e) {
      setSweepError(e instanceof Error ? e.message : String(e))
    } finally {
      setSweepLoading(false)
    }
  }

  return (
    <div style={{ padding: "2rem", "max-width": "1100px" }}>
      <head><title>Auditor Console — Arcana</title></head>

      {/* Header */}
      <header style={{ "margin-bottom": "1.5rem" }}>
        <h1 style={{ "font-size": "1.5rem", "font-weight": "600", color: "var(--arcana-gold)", margin: "0 0 0.25rem 0" }}>
          Auditor Console
        </h1>
        <p style={{ color: "var(--arcana-text-weak)", "font-size": "0.85rem", margin: 0 }}>
          Inspect events and archive proofs. Mutations go through the enterprise API.
        </p>
      </header>

      {/* Tenant selector */}
      <section style={{ display: "flex", gap: "0.75rem", "align-items": "center", "margin-bottom": "1.5rem", "flex-wrap": "wrap" }}>
        <label style={{ color: "var(--arcana-text-weak)", "font-size": "0.8125rem" }}>Tenant:</label>
        <input
          type="text"
          value={tenantId()}
          onInput={(e) => setSearchParams({ tenantId: e.currentTarget.value })}
          placeholder="org-1"
          style={{
            background: "var(--arcana-surface-raised)",
            border: "1px solid var(--arcana-border)",
            color: "var(--arcana-text)",
            padding: "0.4rem 0.75rem",
            "border-radius": "6px",
            "font-family": "var(--font-family-mono)",
            "font-size": "0.8125rem",
            width: "200px",
            outline: "none",
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = "var(--arcana-violet)" }}
          onBlur={(e) => { e.currentTarget.style.borderColor = "var(--arcana-border)" }}
        />
        <button
          onClick={fetchEvents}
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
          Fetch Events
        </button>
      </section>

      {/* Audit Events */}
      <section style={{ "margin-bottom": "2rem" }}>
        <h2 style={{ "font-size": "1rem", "font-weight": "500", color: "var(--arcana-violet)", margin: "0 0 1rem 0" }}>
          Audit Events
        </h2>
        <Switch>
          <Match when={loading()}>
            <div style={{ color: "var(--arcana-text-faint)", "font-size": "0.85rem" }}>Loading audit events…</div>
          </Match>
          <Match when={error()}>
            <div style={{ color: "var(--v2-state-fg-danger)", "font-size": "0.85rem" }}>Error: {error()}</div>
          </Match>
          <Match when={events().length === 0 && !loading()}>
            <div style={{ color: "var(--arcana-text-faint)", "font-size": "0.85rem" }}>No audit events found for this tenant.</div>
          </Match>
          <Match when={true}>
            <div style={{ overflow: "auto", border: "1px solid var(--arcana-border)", "border-radius": "8px" }}>
              <table style={{ width: "100%", "border-collapse": "collapse", "font-size": "0.8125rem" }}>
                <thead>
                  <tr style={{ "border-bottom": "1px solid var(--arcana-border)", background: "var(--arcana-surface)" }}>
                    <For each={["ID", "Actor", "Action", "Source", "Outcome", "At"]}>
                      {(h) => (
                        <th style={{ padding: "0.6rem 0.75rem", "text-align": "left", color: "var(--arcana-text-faint)", "font-weight": "500", "font-size": "0.75rem", "text-transform": "uppercase", "letter-spacing": "0.05em" }}>
                          {h}
                        </th>
                      )}
                    </For>
                  </tr>
                </thead>
                <tbody>
                  <For each={events().map(mapAuditEvent)}>
                    {(mapped) => (
                      <tr
                        style={{ "border-bottom": "1px solid var(--arcana-border)", cursor: "pointer", transition: "background 0.1s" }}
                        title={mapped.id}
                        onClick={() => setSelectedArchive(mapped.id)}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--arcana-surface)" }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent" }}
                      >
                        <td style={{ padding: "0.5rem 0.75rem", "font-family": "var(--font-family-mono)", "font-size": "0.75rem", color: "var(--arcana-text-weak)" }} title={mapped.id}>{mapped.idShort}</td>
                        <td style={{ padding: "0.5rem 0.75rem", "font-family": "var(--font-family-mono)", "font-size": "0.75rem", color: "var(--arcana-text-weak)" }} title={mapped.actor}>{mapped.actorShort}</td>
                        <td style={{ padding: "0.5rem 0.75rem", color: "var(--arcana-text)" }}>{mapped.action}</td>
                        <td style={{ padding: "0.5rem 0.75rem", "font-family": "var(--font-family-mono)", "font-size": "0.75rem", color: "var(--arcana-text-weak)" }} title={mapped.resource}>{mapped.resourceShort}</td>
                        <td style={{ padding: "0.5rem 0.75rem" }}>
                          <span style={{ color: mapped.outcome === "SUCCESS" ? "var(--v2-state-fg-success)" : "var(--v2-state-fg-danger)", "font-weight": "500", "font-size": "0.75rem" }}>
                            {mapped.outcome}
                          </span>
                        </td>
                        <td style={{ padding: "0.5rem 0.75rem", color: "var(--arcana-text-faint)", "font-size": "0.75rem" }}>{mapped.at}</td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </Match>
        </Switch>
      </section>

      {/* Archive Operations */}
      <section style={{ "margin-bottom": "1.5rem" }}>
        <h2 style={{ "font-size": "1rem", "font-weight": "500", color: "var(--arcana-violet)", margin: "0 0 1rem 0" }}>
          Archive Operations
        </h2>
        <div style={{ display: "flex", gap: "0.75rem", "align-items": "center", "flex-wrap": "wrap", "margin-bottom": "1rem" }}>
          <input
            type="text"
            value={selectedArchive()}
            onInput={(e) => setSelectedArchive(e.currentTarget.value)}
            placeholder="arc-…"
            style={{
              background: "var(--arcana-surface-raised)",
              border: "1px solid var(--arcana-border)",
              color: "var(--arcana-text)",
              padding: "0.4rem 0.75rem",
              "border-radius": "6px",
              "font-family": "var(--font-family-mono)",
              "font-size": "0.8125rem",
              width: "240px",
              outline: "none",
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "var(--arcana-violet)" }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "var(--arcana-border)" }}
          />
          <button onClick={() => fetchArchiveExport(selectedArchive())} style={btnStyle("var(--arcana-gold)", "var(--arcana-void)")}>
            Export
          </button>
          <button onClick={() => postCustody(selectedArchive(), "PLACE")} style={btnStyle("transparent", "var(--arcana-text)")}>
            Place Custody
          </button>
          <button onClick={() => postLegalHold(selectedArchive(), "PLACE")} style={btnStyle("transparent", "var(--arcana-text)")}>
            Place Legal Hold
          </button>
          <button onClick={() => postLegalHold(selectedArchive(), "REMOVE")} style={btnStyle("transparent", "var(--arcana-text)")}>
            Remove Legal Hold
          </button>
        </div>
      </section>

      {/* Export result */}
      <Switch>
        <Match when={exported()}>
          {(data) => {
            const d = data() as ArchiveExport
            return (
              <div style={{ background: "var(--v2-state-bg-success)", border: "1px solid var(--v2-state-border-success)", "border-radius": "8px", padding: "1rem", "margin-bottom": "1rem" }}>
                <div style={{ color: "var(--v2-state-fg-success)", "font-weight": "500", "margin-bottom": "0.5rem", "font-size": "0.85rem" }}>Proof Exported</div>
                <div style={{ color: "var(--arcana-text-weak)", "font-size": "0.8125rem", "margin-bottom": "0.25rem" }}>Fingerprint: {truncateHash(d.fingerprint)}</div>
                <div style={{ color: "var(--arcana-text-weak)", "font-size": "0.8125rem", "margin-bottom": "0.25rem" }}>Custody events: {d.custody.length}</div>
                <For each={d.custody}>
                  {(c) => (
                    <div style={{ color: "var(--arcana-text-faint)", "font-size": "0.75rem", "padding-left": "1rem" }}>
                      {c.who} — {c.action} — {c.at}
                    </div>
                  )}
                </For>
              </div>
            )
          }}
        </Match>
        <Match when={rejected()}>
          {(data) => {
            const d = data() as ArchiveRejected
            return (
              <div style={{ color: "var(--v2-state-fg-danger)", "font-size": "0.85rem", "margin-bottom": "1rem" }}>Export error: {d.reason}</div>
            )
          }}
        </Match>
      </Switch>

      {/* Retention sweep */}
      <section style={{ display: "flex", gap: "0.75rem", "align-items": "flex-end", "flex-wrap": "wrap", "margin-bottom": "1rem" }}>
        <div style={{ display: "flex", "flex-direction": "column", gap: "0.25rem" }}>
          <label style={{ color: "var(--arcana-text-faint)", "font-size": "0.75rem" }}>Retention sweep (optional now ISO):</label>
          <input
            id="sweep-now"
            type="text"
            placeholder="2026-08-17T00:00:00Z"
            style={{
              background: "var(--arcana-surface-raised)",
              border: "1px solid var(--arcana-border)",
              color: "var(--arcana-text)",
              padding: "0.4rem 0.75rem",
              "border-radius": "6px",
              "font-family": "var(--font-family-mono)",
              "font-size": "0.8125rem",
              width: "220px",
              outline: "none",
            }}
          />
        </div>
        <button
          onClick={() => {
            const el = document.getElementById("sweep-now") as HTMLInputElement | null
            postRetentionSweep(el?.value || undefined)
          }}
          style={btnStyle("transparent", "var(--arcana-text)")}
        >
          Run Retention Sweep
        </button>
      </section>

      <Show when={actionResult()}>
        <div style={{ color: "var(--arcana-text-weak)", "font-size": "0.8125rem", "margin-bottom": "0.75rem" }}>{actionResult()}</div>
      </Show>

      <Switch>
        <Match when={sweepLoading()}>
          <div style={{ color: "var(--arcana-text-faint)", "font-size": "0.85rem" }}>Running retention sweep…</div>
        </Match>
        <Match when={sweepError()}>
          <div style={{ color: "var(--v2-state-fg-danger)", "font-size": "0.85rem" }}>Sweep error: {sweepError()}</div>
        </Match>
        <Match when={sweepResult()}>
          <div style={{ color: "var(--v2-state-fg-success)", "font-size": "0.85rem", "margin-bottom": "1rem" }}>Sweep result: {sweepResult()}</div>
        </Match>
      </Switch>

      <footer style={{ color: "var(--arcana-text-faint)", "font-size": "0.7rem", "margin-top": "2rem", "border-top": "1px solid var(--arcana-border)", "padding-top": "0.75rem" }}>
        arcana enterprise · auditor console · GET /audit · POST /audit-archive/:id/custody · POST /audit-archive/:id/legal-hold · POST /audit-archive/retention-sweep
      </footer>
    </div>
  )
}

function btnStyle(bg: string, color: string): Record<string, string> {
  return {
    background: bg,
    color,
    border: bg === "transparent" ? "1px solid var(--arcana-border)" : "none",
    padding: "0.4rem 0.75rem",
    "border-radius": "6px",
    "font-size": "0.8125rem",
    "font-weight": "500",
    cursor: "pointer",
    transition: "all 0.15s ease",
  }
}

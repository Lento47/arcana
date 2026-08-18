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

const GALT = "#d4a853"
const VIOL = "#9d7cd8"
const BG = "#10101a"
const SUPP = "#14111e"
const BORDER = "#2a2535"
const TEXT = "#e0d8c8"
const TEXT_WEAK = "#8880a0"
const DANGER = "#c44"
const SUCCESS = "#4a4"

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
    if (!id) {
      setActionResult("archive id required")
      return { ok: false, reason: "archive id required" }
    }
    try {
      const res = await fetch(
        `/api/enterprise/organizations/${encodeURIComponent(tenantId())}/audit-archive/${encodeURIComponent(id)}/custody`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        }
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
    if (!id) {
      setActionResult("archive id required")
      return { ok: false, reason: "archive id required" }
    }
    try {
      const res = await fetch(
        `/api/enterprise/organizations/${encodeURIComponent(tenantId())}/audit-archive/${encodeURIComponent(id)}/legal-hold`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        }
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
    setSweepLoading(true)
    setSweepError(null)
    setSweepResult(null)
    try {
      const parsed = parseRetentionSweepNow(rawNow)
      if (parsed.error) {
        setSweepError(parsed.error)
        return
      }
      const body: Record<string, string> = {}
      if (parsed.now) body.now = parsed.now
      const res = await fetch(
        `/api/enterprise/organizations/${encodeURIComponent(tenantId())}/audit-archive/retention-sweep`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
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
    <div style={{ "min-height": "100vh", background: BG, color: TEXT, "font-family": "system-ui, monospace", padding: "2rem" }}>
      <head>
        <title>Auditor Console</title>
      </head>
      <p style={{ color: TEXT_WEAK, "font-size": "0.85rem" }}>
        Audit console. Inspect events and archive proofs. Mutations (custody, legal hold, retention sweep) go through the enterprise API.
      </p>

      <section style={{ "margin-bottom": "2rem", display: "flex", gap: "1rem", "align-items": "center", "flex-wrap": "wrap" }}>
        <label style={{ color: TEXT_WEAK, "font-size": "0.85rem" }}>Tenant:</label>
        <input
          type="text"
          value={tenantId()}
          onInput={(e) => setSearchParams({ tenantId: e.currentTarget.value })}
          placeholder="org-1"
          style={{
            background: SUPP,
            border: "1px solid " + BORDER,
            color: TEXT,
            padding: "0.4rem 0.8rem",
            "border-radius": "4rem",
            "font-family": "monospace",
            "font-size": "0.85rem",
            flex: "1",
            "max-width": "300px",
          }}
        />
        <button
          onClick={fetchEvents}
          style={{
            background: GALT,
            color: BG,
            border: "none",
            padding: "0.4rem 1rem",
            "border-radius": "4rem",
            "font-size": "0.85rem",
            "font-weight": "bold",
            cursor: "pointer",
          }}
        >
          Fetch Events
        </button>
      </section>

      <section style={{ "margin-bottom": "2rem" }}>
        <h2 style={{ color: VIOL, "font-size": "1.2rem", margin: "0 0 1rem 0" }}>Audit Events</h2>
        <Switch>
          <Match when={loading()}>
            <div style={{ color: TEXT_WEAK }}>Loading audit events...</div>
          </Match>
          <Match when={error()}>
            <div style={{ color: DANGER }}>Error: {error()}</div>
          </Match>
          <Match when={events().length === 0 && !loading()}>
            <div style={{ color: TEXT_WEAK }}>No audit events found for this tenant.</div>
          </Match>
          <Match when={true}>
            <div style={{ overflow: "auto" }}>
              <table
                style={{ width: "100%", "border-collapse": "collapse", "font-size": "0.85rem" }}
              >
                <thead>
                  <tr style={{ "border-bottom": "2px solid " + BORDER }}>
                    <th style={{ padding: "0.5rem", "text-align": "left", color: TEXT_WEAK }}>ID</th>
                    <th style={{ padding: "0.5rem", "text-align": "left", color: TEXT_WEAK }}>Actor</th>
                    <th style={{ padding: "0.5rem", "text-align": "left", color: TEXT_WEAK }}>Action</th>
                    <th style={{ padding: "0.5rem", "text-align": "left", color: TEXT_WEAK }}>Source</th>
                    <th style={{ padding: "0.5rem", "text-align": "left", color: TEXT_WEAK }}>Outcome</th>
                    <th style={{ padding: "0.5rem", "text-align": "left", color: TEXT_WEAK }}>At</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={events().map(mapAuditEvent)}>
                    {(mapped) => {
                      return (
                        <tr
                          style={{ "border-bottom": "1px solid " + BORDER, cursor: "pointer" }}
                          title={mapped.id}
                          onClick={() => setSelectedArchive(mapped.id)}
                        >
                          <td style={{ padding: "0.4rem", "font-family": "monospace", "font-size": "0.75rem" }} title={mapped.id}>{mapped.idShort}</td>
                          <td style={{ padding: "0.4rem", "font-family": "monospace", "font-size": "0.75rem" }} title={mapped.actor}>{mapped.actorShort}</td>
                          <td style={{ padding: "0.4rem" }}>{mapped.action}</td>
                          <td style={{ padding: "0.4rem", "font-family": "monospace", "font-size": "0.75rem" }} title={mapped.resource}>{mapped.resourceShort}</td>
                          <td>
                            <span
                              style={{
                                color: mapped.outcome === "SUCCESS" ? SUCCESS : DANGER,
                                "font-weight": "bold",
                              }}
                            >
                              {mapped.outcome}
                            </span>
                          </td>
                          <td style={{ padding: "0.4rem", color: TEXT_WEAK, "font-size": "0.75rem" }}>{mapped.at}</td>
                        </tr>
                      )
                    }}
                  </For>
                </tbody>
              </table>
            </div>
          </Match>
        </Switch>
      </section>

      <section style={{ "margin-bottom": "2rem", display: "flex", gap: "1rem", "flex-wrap": "wrap", "align-items": "flex-end" }}>
        <h2 style={{ color: VIOL, "font-size": "1.2rem", margin: "0" }}>Archive Operations</h2>
        <div style={{ display: "flex", gap: "0.5rem", "align-items": "center" }}>
          <label style={{ color: TEXT_WEAK, "font-size": "0.85rem" }}>Archive ID:</label>
          <input
            type="text"
            value={selectedArchive()}
            onInput={(e) => setSelectedArchive(e.currentTarget.value)}
            placeholder="arc-..."
            style={{
              background: SUPP,
              border: "1px solid " + BORDER,
              color: TEXT,
              padding: "0.4rem 0.8rem",
              "border-radius": "4rem",
              "font-family": "monospace",
              "font-size": "0.85rem",
              width: "260px",
            }}
          />
          <button
            onClick={() => fetchArchiveExport(selectedArchive())}
            style={{
              background: GALT,
              color: BG,
              border: "none",
              padding: "0.4rem 0.8rem",
              "border-radius": "4rem",
              "font-size": "0.85rem",
              cursor: "pointer",
            }}
          >
            Export
          </button>
        </div>
      </section>

      <Switch>
        <Match when={exported()}>
          {(data) => {
            const d = data() as ArchiveExport
            return (
              <div style={{ background: SUPP, border: "1px solid " + BORDER, "border-radius": "4rem", padding: "1rem", "margin-bottom": "1rem" }}>
                <div style={{ color: SUCCESS, "font-weight": "bold", "margin-bottom": "0.5rem" }}>Proof Exported</div>
                <div style={{ color: TEXT_WEAK, "font-size": "0.85rem", "margin-bottom": "0.3rem" }}>Fingerprint: {truncateHash(d.fingerprint)}</div>
                <div style={{ color: TEXT_WEAK, "font-size": "0.85rem", "margin-bottom": "0.3rem" }}>Custody events: {d.custody.length}</div>
                <For each={d.custody}>
                  {(c) => (
                    <div style={{ color: TEXT_WEAK, "font-size": "0.75rem", "padding-left": "1rem" }}>
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
              <div style={{ color: DANGER, "margin-bottom": "1rem" }}>Export error: {d.reason}</div>
            )
          }}
        </Match>
      </Switch>

      <section style={{ display: "flex", gap: "1rem", "flex-wrap": "wrap", "margin-bottom": "1rem" }}>
        <button
          onClick={() => postCustody(selectedArchive(), "PLACE")}
          style={{
            background: BG,
            border: "1px solid " + BORDER,
            color: TEXT,
            padding: "0.4rem 0.8rem",
            "border-radius": "4rem",
            "font-size": "0.85rem",
            cursor: "pointer",
          }}
        >
          Place Custody (POST)
        </button>
        <button
          onClick={() => postLegalHold(selectedArchive(), "PLACE")}
          style={{
            background: BG,
            border: "1px solid " + BORDER,
            color: TEXT,
            padding: "0.4rem 0.8rem",
            "border-radius": "4rem",
            "font-size": "0.85rem",
            cursor: "pointer",
          }}
        >
          Place Legal Hold (POST)
        </button>
        <button
          onClick={() => postLegalHold(selectedArchive(), "REMOVE")}
          style={{
            background: BG,
            border: "1px solid " + BORDER,
            color: TEXT,
            padding: "0.4rem 0.8rem",
            "border-radius": "4rem",
            "font-size": "0.85rem",
            cursor: "pointer",
          }}
        >
          Remove Legal Hold (POST)
        </button>
      </section>

      <section style={{ display: "flex", gap: "1rem", "flex-wrap": "wrap", "align-items": "flex-end", "margin-bottom": "1rem" }}>
        <label style={{ color: TEXT_WEAK, "font-size": "0.85rem" }}>Retention sweep (optional now ISO):</label>
        <input
          id="sweep-now"
          type="text"
          placeholder="2026-08-17T00:00:00Z"
          style={{
            background: SUPP,
            border: "1px solid " + BORDER,
            color: TEXT,
            padding: "0.4rem 0.8rem",
            "border-radius": "4rem",
            "font-family": "monospace",
            "font-size": "0.85rem",
            width: "80px",
          }}
        />
        <button
          onClick={() => {
            const el = document.getElementById("sweep-now") as HTMLInputElement | null
            const n = el?.value || undefined
            postRetentionSweep(n)
          }}
          style={{
            background: BG,
            border: "1px solid " + BORDER,
            color: TEXT,
            padding: "0.4rem 0.8rem",
            "border-radius": "4rem",
            "font-size": "0.85rem",
            cursor: "pointer",
          }}
        >
          Run Retention Sweep (POST)
        </button>
      </section>

      <Show when={actionResult()}>
        <div style={{ color: TEXT_WEAK, "font-size": "0.85rem", "margin-bottom": "1rem" }}>{actionResult()}</div>
      </Show>

      <Switch>
        <Match when={sweepLoading()}>
          <div style={{ color: TEXT_WEAK }}>Running retention sweep...</div>
        </Match>
        <Match when={sweepError()}>
          <div style={{ color: DANGER }}>Sweep error: {sweepError()}</div>
        </Match>
        <Match when={sweepResult()}>
          <div style={{ color: SUCCESS, "font-size": "0.85rem", "margin-bottom": "1rem" }}>Sweep result: {sweepResult()}</div>
        </Match>
      </Switch>

      <footer style={{ color: TEXT_WEAK, "font-size": "0.75rem", "margin-top": "2rem", "border-top": "1px solid " + BORDER, "padding-top": "1rem" }}>
        arcana enterprise · auditor console · GET /audit · POST /audit-archive/:id/custody · POST /audit-archive/:id/legal-hold (PLACE|REMOVE) · POST /audit-archive/retention-sweep
      </footer>
    </div>
  )
}
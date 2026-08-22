import { createEffect, createSignal, For, Show } from "solid-js"
import { readApiError } from "~/core/auditor-console"

const STATUS_COLORS: Record<string, string> = {
  PENDING: "var(--arcana-gold)",
  APPROVED: "var(--v2-state-fg-success)",
  DENIED: "var(--v2-state-fg-danger)",
  CLAIMED: "var(--v2-state-fg-info)",
  CONSUMED: "var(--arcana-text-faint)",
  EXPIRED: "var(--v2-state-fg-danger)",
  INVALIDATED: "var(--v2-state-fg-danger)",
}

const STATUS_BG: Record<string, string> = {
  PENDING: "var(--v2-state-bg-warning)",
  APPROVED: "var(--v2-state-bg-success)",
  DENIED: "var(--v2-state-bg-danger)",
  CLAIMED: "var(--v2-state-bg-info)",
  CONSUMED: "var(--arcana-surface-raised)",
  EXPIRED: "var(--v2-state-bg-danger)",
  INVALIDATED: "var(--v2-state-bg-danger)",
}

export default function EscalationConsole() {
  const [tenantId, setTenantId] = createSignal("org-1")
  const [statusFilter, setStatusFilter] = createSignal("PENDING")
  const [approvals, setApprovals] = createSignal<any[]>([])
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  const [actionResult, setActionResult] = createSignal<string | null>(null)

  const fetchApprovals = async () => {
    setLoading(true)
    setError(null)
    setActionResult(null)
    try {
      const res = await fetch(
        `/api/enterprise/organizations/${encodeURIComponent(tenantId())}/approvals?status=${encodeURIComponent(statusFilter())}`,
      )
      if (!res.ok) {
        setError(await readApiError(res))
        setApprovals([])
        return
      }
      const data = (await res.json()) as any
      setApprovals(Array.isArray(data) ? data : [])
    } catch (e) {
      setError(String(e))
      setApprovals([])
    } finally {
      setLoading(false)
    }
  }

  createEffect(() => {
    void tenantId()
    void statusFilter()
    void fetchApprovals()
  })

  const handleEvaluate = async (approvalId: string) => {
    setError(null)
    setActionResult(null)
    try {
      const res = await fetch(
        `/api/enterprise/organizations/${encodeURIComponent(tenantId())}/escalations/check`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ approvalId, now: new Date().toISOString() }),
        },
      )
      if (!res.ok) { setError(await readApiError(res)); return }
      const data = (await res.json()) as any
      setActionResult(data.escalated ? `escalated: ${data.reason}` : `no escalation: ${data.reason}`)
    } catch (e) {
      setError(String(e))
    }
  }

  return (
    <div style={{ padding: "2rem", "max-width": "960px" }}>
      <head><title>Escalation Console — Arcana</title></head>

      {/* Header */}
      <header style={{ "margin-bottom": "1.5rem" }}>
        <h1 style={{ "font-size": "1.5rem", "font-weight": "600", color: "var(--arcana-gold)", margin: "0 0 0.25rem 0" }}>
          Escalation Console
        </h1>
        <p style={{ color: "var(--arcana-text-weak)", "font-size": "0.85rem", margin: 0 }}>
          Central approval operations · F5 governance
        </p>
      </header>

      {/* Filters */}
      <section style={{ display: "flex", gap: "0.75rem", "align-items": "flex-end", "flex-wrap": "wrap", "margin-bottom": "1.5rem" }}>
        <div style={{ display: "flex", "flex-direction": "column", gap: "0.25rem" }}>
          <label style={{ color: "var(--arcana-text-faint)", "font-size": "0.75rem", "text-transform": "uppercase", "letter-spacing": "0.05em" }}>Tenant</label>
          <input
            value={tenantId()}
            onInput={(e) => setTenantId(e.currentTarget.value)}
            style={{
              background: "var(--arcana-surface-raised)",
              border: "1px solid var(--arcana-border)",
              color: "var(--arcana-text)",
              padding: "0.4rem 0.75rem",
              "border-radius": "6px",
              "font-family": "var(--font-family-mono)",
              "font-size": "0.8125rem",
              width: "160px",
              outline: "none",
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "var(--arcana-violet)" }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "var(--arcana-border)" }}
          />
        </div>
        <div style={{ display: "flex", "flex-direction": "column", gap: "0.25rem" }}>
          <label style={{ color: "var(--arcana-text-faint)", "font-size": "0.75rem", "text-transform": "uppercase", "letter-spacing": "0.05em" }}>Status</label>
          <select
            value={statusFilter()}
            onChange={(e) => setStatusFilter(e.currentTarget.value)}
            style={{
              background: "var(--arcana-surface-raised)",
              border: "1px solid var(--arcana-border)",
              color: "var(--arcana-text)",
              padding: "0.4rem 0.75rem",
              "border-radius": "6px",
              "font-size": "0.8125rem",
              outline: "none",
            }}
          >
            <For each={["PENDING", "APPROVED", "DENIED", "CLAIMED", "CONSUMED", "EXPIRED", "INVALIDATED"]}>
              {(s) => <option value={s}>{s}</option>}
            </For>
          </select>
        </div>
        <button
          onClick={fetchApprovals}
          disabled={loading()}
          style={{
            background: "var(--arcana-violet)",
            color: "#fff",
            border: "none",
            padding: "0.4rem 1rem",
            "border-radius": "6px",
            "font-size": "0.8125rem",
            "font-weight": "500",
            cursor: loading() ? "not-allowed" : "pointer",
            opacity: loading() ? 0.6 : 1,
          }}
        >
          {loading() ? "loading…" : "refresh"}
        </button>
      </section>

      {/* Error */}
      <Show when={error()}>
        <div style={{ background: "var(--v2-state-bg-danger)", border: "1px solid var(--v2-state-border-danger)", color: "var(--v2-state-fg-danger)", padding: "0.75rem 1rem", "border-radius": "8px", "font-size": "0.85rem", "margin-bottom": "1rem" }}>
          {error()}
        </div>
      </Show>

      {/* Action result */}
      <Show when={actionResult()}>
        <div style={{ background: "var(--v2-state-bg-info)", border: "1px solid var(--v2-state-border-info)", color: "var(--v2-state-fg-info)", padding: "0.75rem 1rem", "border-radius": "8px", "font-size": "0.85rem", "margin-bottom": "1rem" }}>
          {actionResult()}
        </div>
      </Show>

      {/* Approval cards */}
      <section style={{ display: "flex", "flex-direction": "column", gap: "0.75rem" }}>
        <For each={approvals()}>
          {(a) => <ApprovalCard approval={a} onEvaluate={handleEvaluate} />}
        </For>
        <Show when={approvals().length === 0 && !loading()}>
          <div style={{ color: "var(--arcana-text-faint)", "text-align": "center", padding: "2rem", "font-size": "0.85rem" }}>
            no approvals
          </div>
        </Show>
      </section>
    </div>
  )
}

function ApprovalCard(props: { approval: any; onEvaluate: (id: string) => void }) {
  const a = props.approval
  const statusColor = STATUS_COLORS[a.status] ?? "var(--arcana-text-faint)"
  const statusBg = STATUS_BG[a.status] ?? "var(--arcana-surface-raised)"

  return (
    <div
      style={{
        border: "1px solid var(--arcana-border)",
        "border-radius": "8px",
        padding: "1rem 1.25rem",
        background: "var(--arcana-surface)",
        transition: "border-color 0.15s ease",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--arcana-violet-dim)" }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--arcana-border)" }}
    >
      <div style={{ display: "flex", "justify-content": "space-between", "align-items": "center", "margin-bottom": "0.75rem" }}>
        <span
          style={{
            color: statusColor,
            background: statusBg,
            "font-size": "0.7rem",
            "font-weight": "600",
            "text-transform": "uppercase",
            "letter-spacing": "0.05em",
            padding: "0.125rem 0.5rem",
            "border-radius": "9999px",
          }}
        >
          {a.status}
        </span>
        <span style={{ color: "var(--arcana-text-faint)", "font-size": "0.75rem" }}>
          {formatDate(a.createdAt)}
        </span>
      </div>

      <div style={{ display: "grid", "grid-template-columns": "100px 1fr", gap: "0.375rem 0.75rem", "margin-bottom": "0.75rem" }}>
        <Field label="id" value={a.approvalId} />
        <Field label="requester" value={a.requesterId} />
        <Field label="hash" value={truncate(a.requestHash, 20)} />
        <Field label="request" value={truncate(a.exactRequestJson, 40)} />
        <Field label="expires" value={formatDate(a.expiresAt)} />
        <Show when={a.decidedAt}>
          <Field label="decided" value={formatDate(a.decidedAt)} />
        </Show>
      </div>

      <button
        onClick={() => props.onEvaluate(a.approvalId)}
        style={{
          background: "var(--arcana-violet)",
          color: "#fff",
          border: "none",
          padding: "0.35rem 0.75rem",
          "border-radius": "6px",
          "font-size": "0.8125rem",
          "font-weight": "500",
          cursor: "pointer",
        }}
      >
        evaluate escalation
      </button>
    </div>
  )
}

function Field(props: { label: string; value: string }) {
  return (
    <>
      <span style={{ color: "var(--arcana-text-faint)", "font-size": "0.75rem", "text-transform": "uppercase", "letter-spacing": "0.03em" }}>
        {props.label}
      </span>
      <span style={{ color: "var(--arcana-text)", "font-size": "0.8125rem", "word-break": "break-all", "font-family": "var(--font-family-mono)" }}>
        {props.value}
      </span>
    </>
  )
}

function truncate(str: string, len: number) {
  if (!str) return ""
  return str.length > len ? str.slice(0, len) + "…" : str
}

function formatDate(iso: string) {
  if (!iso) return ""
  try { return new Date(iso).toLocaleString() } catch { return iso }
}

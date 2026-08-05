import { createSignal, onMount } from "solid-js"

const gold = "#d4a853"
const violet = "#9d7cd8"
const bg = "#0d0a14"

const STATUS_COLORS: Record<string, string> = {
  PENDING: gold,
  APPROVED: "#4caf50",
  CLAIMED: "#2196f3",
  CONSUMED: "#9e9e9e",
  EXPIRED: "#f44336",
  REJECTED: "#f44336",
}

export default function EscalationConsole() {
  const [tenantId, setTenantId] = createSignal("tenant-a")
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
        `/api/enterprise/organizations/${tenantId()}/approvals?status=${statusFilter()}`,
      )
      if (!res.ok) {
        setError(`failed to load approvals (${res.status})`)
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

  onMount(fetchApprovals)

  const handleAction = async (approvalId: string, decision: "APPROVE" | "DENY") => {
    setError(null)
    setActionResult(null)
    try {
      const res = await fetch(
        `/api/enterprise/organizations/${tenantId()}/escalations/check`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ approvalId, now: new Date().toISOString() }),
        },
      )
      if (!res.ok) {
        setError(`escalation check failed (${res.status})`)
        return
      }
      const data = (await res.json()) as any
      setActionResult(
        data.escalated
          ? `escalated: ${data.reason}`
          : `no escalation: ${data.reason}`,
      )
    } catch (e) {
      setError(String(e))
    }
  }

  return (
    <div
      style={{
        "min-height": "100vh",
        background: bg,
        color: "#e0d8c8",
        "font-family": "system-ui, monospace",
        padding: "2rem",
      }}
    >
      <header style={{ "text-align": "center", "margin-bottom": "2rem" }}>
        <h1 style={{ color: gold, "font-size": "2rem", margin: 0, "letter-spacing": "0.3em" }}>
          ESCALATION CONSOLE
        </h1>
        <p style={{ color: "#666", "font-size": "0.85rem", "font-style": "italic" }}>
          F5 central approval operations
        </p>
      </header>

      <section
        style={{
          display: "flex",
          gap: "1rem",
          "flex-wrap": "wrap",
          "justify-content": "center",
          "margin-bottom": "2rem",
        }}
      >
        <label style={{ display: "flex", "flex-direction": "column", gap: "0.25rem" }}>
          <span style={{ color: "#666", "font-size": "0.75rem", "text-transform": "uppercase" }}>
            tenant
          </span>
          <input
            value={tenantId()}
            onInput={(e) => setTenantId(e.currentTarget.value)}
            style={{
              background: "#1a1525",
              border: `1px solid ${violet}44`,
              color: "#e0d8c8",
              padding: "0.5rem 0.75rem",
              "border-radius": "6px",
              "font-family": "inherit",
            }}
          />
        </label>
        <label style={{ display: "flex", "flex-direction": "column", gap: "0.25rem" }}>
          <span style={{ color: "#666", "font-size": "0.75rem", "text-transform": "uppercase" }}>
            status
          </span>
          <select
            value={statusFilter()}
            onChange={(e) => setStatusFilter(e.currentTarget.value)}
            style={{
              background: "#1a1525",
              border: `1px solid ${violet}44`,
              color: "#e0d8c8",
              padding: "0.5rem 0.75rem",
              "border-radius": "6px",
              "font-family": "inherit",
            }}
          >
            <option value="PENDING">PENDING</option>
            <option value="APPROVED">APPROVED</option>
            <option value="CLAIMED">CLAIMED</option>
            <option value="CONSUMED">CONSUMED</option>
            <option value="EXPIRED">EXPIRED</option>
            <option value="REJECTED">REJECTED</option>
          </select>
        </label>
        <button
          onClick={fetchApprovals}
          disabled={loading()}
          style={{
            background: violet,
            color: "#fff",
            border: "none",
            padding: "0.5rem 1.25rem",
            "border-radius": "6px",
            "font-family": "inherit",
            cursor: loading() ? "not-allowed" : "pointer",
            opacity: loading() ? 0.6 : 1,
          }}
        >
          {loading() ? "loading..." : "refresh"}
        </button>
      </section>

      {error() && (
        <div
          style={{
            background: "#f443361a",
            border: "1px solid #f4433644",
            color: "#f44336",
            padding: "1rem",
            "border-radius": "6px",
            "margin-bottom": "1.5rem",
          }}
        >
          {error()}
        </div>
      )}

      {actionResult() && (
        <div
          style={{
            background: "#2196f31a",
            border: "1px solid #2196f344",
            color: "#2196f3",
            padding: "1rem",
            "border-radius": "6px",
            "margin-bottom": "1.5rem",
          }}
        >
          {actionResult()}
        </div>
      )}

      <section style={{ display: "flex", "flex-direction": "column", gap: "1rem" }}>
        {approvals().map((a) => (
          <ApprovalCard
            approval={a}
            onAction={handleAction}
          />
        ))}
        {approvals().length === 0 && !loading() && (
          <div style={{ color: "#666", "text-align": "center", padding: "2rem" }}>
            no approvals
          </div>
        )}
      </section>
    </div>
  )
}

function ApprovalCard(props: {
  approval: any
  onAction: (approvalId: string, decision: "APPROVE" | "DENY") => void
}) {
  const a = props.approval
  const statusColor = STATUS_COLORS[a.status] ?? "#666"

  return (
    <div
      style={{
        border: `1px solid ${statusColor}33`,
        "border-radius": "8px",
        padding: "1.25rem",
        background: `${statusColor}08`,
      }}
    >
      <div
        style={{
          display: "flex",
          "justify-content": "space-between",
          "align-items": "center",
          "margin-bottom": "0.75rem",
        }}
      >
        <span
          style={{
            color: statusColor,
            "font-size": "0.85rem",
            "font-weight": "bold",
            "text-transform": "uppercase",
          }}
        >
          {a.status}
        </span>
        <span style={{ color: "#666", "font-size": "0.75rem" }}>
          {formatDate(a.createdAt)}
        </span>
      </div>

      <div style={{ display: "flex", "flex-direction": "column", gap: "0.4rem", "margin-bottom": "0.75rem" }}>
        <Field label="id" value={a.approvalId} />
        <Field label="requester" value={a.requesterId} />
        <Field label="request hash" value={truncate(a.requestHash, 20)} />
        <Field label="request" value={truncate(a.exactRequestJson, 40)} />
        <Field label="expires" value={formatDate(a.expiresAt)} />
        {a.decidedAt && <Field label="decided at" value={formatDate(a.decidedAt)} />}
      </div>

      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button
          onClick={() => props.onAction(a.approvalId, "APPROVE")}
          style={{
            background: "#4caf50",
            color: "#fff",
            border: "none",
            padding: "0.4rem 1rem",
            "border-radius": "4px",
            "font-family": "inherit",
            cursor: "pointer",
          }}
        >
          approve
        </button>
        <button
          onClick={() => props.onAction(a.approvalId, "DENY")}
          style={{
            background: "#f44336",
            color: "#fff",
            border: "none",
            padding: "0.4rem 1rem",
            "border-radius": "4px",
            "font-family": "inherit",
            cursor: "pointer",
          }}
        >
          deny
        </button>
      </div>
    </div>
  )
}

function Field(props: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", gap: "0.5rem" }}>
      <span style={{ color: "#666", "font-size": "0.75rem", "text-transform": "uppercase", "min-width": "80px" }}>
        {props.label}
      </span>
      <span style={{ color: "#e0d8c8", "font-size": "0.85rem", "word-break": "break-all" }}>
        {props.value}
      </span>
    </div>
  )
}

function truncate(str: string, len: number) {
  if (!str) return ""
  return str.length > len ? str.slice(0, len) + "..." : str
}

function formatDate(iso: string) {
  if (!iso) return ""
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}
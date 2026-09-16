# PermissionCard — Arcana as deliberate permission surface

## Scope split

| Concern | Owner |
|---------|--------|
| Policy rules, autonomy, org defaults, audit graph | **arcana-desktop** |
| Human ask for a single gated action + execution receipt | **Arcana** (this UI) |

Arcana does not invent policy. It renders a gate that desktop (or the local policy engine) already required.

## Components (`@arcana/ui`)

- `PermissionCard` — pending → approve / edit / reject → run → receipt
- `ReceiptCard` — observation-only (auto-allowed or completed; no decision bar)
- Types: `GateEvent`, `GateResolution`, `PermissionRequest`, `ActionPayload`

Import:

```ts
import { PermissionCard, ReceiptCard } from "@arcana/ui/permission-card"
import type { GateEvent, GateResolution } from "@arcana/ui/permission-card"
```

## Open policy

| State | Default open |
|-------|----------------|
| `decision === "pending"` | always |
| `execution === "error"` | yes |
| approved / auto + success | no (collapsed receipt) |

## Wire format

```ts
// Desktop / policy → Arcana
type GateEvent = {
  request: PermissionRequest
  action: ActionPayload
}

// Arcana → runtime / desktop
type GateResolution = {
  id: string
  decision: "approved" | "rejected" | "edited"
  preview: string
  remember?: "session" | "project"
}
```

`remember` is a *request* from the user; desktop decides whether to persist.

## Voice

- `voice="quiet"` (default): Approve / Reject / Edit
- `voice="arcane"`: Seal / Refuse / Amend — labels only; structure unchanged

## Keyboard (target for TUI + web)

- `a` approve
- `r` reject
- `e` focus edit
- `enter` approve when not editing
- `esc` reject when pending

## Non-goals

- Global autonomy dial
- Plan cockpit / multi-agent fleet UI
- Policy editor

Those belong in arcana-desktop.

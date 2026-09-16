// @ts-nocheck
import { createSignal } from "solid-js"
import { PermissionCard, ReceiptCard } from "./permission-card"
import type { PermissionDecision } from "./permission-types"

const docs = `### Overview
Arcana permission surface — deliberate human gates for actions.

**arcana-desktop** owns governance (policy, autonomy, audit).
**Arcana** renders the ask + receipt when a gate fires.

### Components
- \`PermissionCard\` — pending approve / edit / reject
- \`ReceiptCard\` — observation-only (auto or completed)

### Defaults
- \`decision="pending"\` → always expanded
- \`execution="error"\` → expanded
- success receipts → collapsed with optional summary
- \`voice="quiet"\` by default (\`arcane\` is label skin only)
`

export default {
  title: "UI/PermissionCard",
  id: "components-permission-card",
  component: PermissionCard,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: docs,
      },
    },
  },
}

export const PendingHighRisk = () => {
  const [decision, setDecision] = createSignal<PermissionDecision>("pending")
  return (
    <PermissionCard
      request={{
        id: "gate-1",
        reason: "Destructive file write outside the allowed path set.",
        risk: "high",
        policyId: "destructive-file-write",
        scope: "src/auth.ts",
      }}
      action={{
        tool: "write",
        title: "src/auth.ts",
        preview: "export function validate(token: string) {\n  return jwt.decode(token) != null\n}\n",
        editable: true,
        meta: { path: "src/auth.ts" },
      }}
      decision={decision()}
      onApprove={(preview) => {
        console.log("approve", preview)
        setDecision("approved")
      }}
      onEdit={(preview) => {
        console.log("edit", preview)
        setDecision("edited")
      }}
      onReject={() => setDecision("rejected")}
      onRemember={(scope) => console.log("remember", scope)}
    />
  )
}

export const RunningAfterApprove = () => (
  <PermissionCard
    request={{
      id: "gate-2",
      reason: "Shell command requires confirmation.",
      risk: "medium",
      policyId: "shell-confirm",
    }}
    action={{
      tool: "bash",
      title: "npm test",
      preview: "npm test -- --runInBand",
      meta: { cwd: "/project" },
    }}
    decision="approved"
    execution="running"
    defaultOpen
  />
)

export const SuccessReceipt = () => (
  <ReceiptCard
    action={{
      tool: "bash",
      title: "npm test",
      preview: "npm test -- --runInBand",
      meta: { durationMs: 2140, exitCode: 0 },
    }}
    decision="approved"
    execution="success"
    summary="42 passed, 0 failed"
    result="Test Suites: 3 passed, 3 total"
  />
)

export const AutoAllowed = () => (
  <ReceiptCard
    action={{
      tool: "read",
      title: "package.json",
      preview: "read package.json",
      meta: { durationMs: 12, path: "package.json" },
    }}
    decision="auto"
    execution="success"
    summary="package.json (1.2kb)"
  />
)

export const ErrorReceipt = () => (
  <ReceiptCard
    action={{
      tool: "apply_patch",
      title: "src/auth.ts",
      preview: "@@ -10,3 +10,5 @@\n-old\n+new",
      meta: { durationMs: 180 },
    }}
    decision="approved"
    execution="error"
    error="Hunk failed at line 42"
  />
)

export const ArcaneVoice = () => (
  <PermissionCard
    voice="arcane"
    request={{
      id: "gate-arcane",
      reason: "Shell invocation crosses the circle.",
      risk: "critical",
      policyId: "shell-critical",
    }}
    action={{
      tool: "bash",
      title: "rm -rf build",
      preview: "rm -rf build",
      editable: true,
    }}
    decision="pending"
    onApprove={() => {}}
    onReject={() => {}}
  />
)

export { CommandSpineShell } from "./command-spine-shell"
export type { SpineKind, SpineLayout, SpineEntry, SpineReceipt, SpineDiffExcerpt } from "./spine-types"
export { getSpineLayout, spineTone, SPINE_GLYPH } from "./spine-types"
export { messagesToSpineEntries } from "./spine-mapper"
export {
  isAssistantSegmentStreaming,
  buildTurnLifecycle,
  isSessionTurnActive,
} from "./turn-lifecycle"
export type { TurnLifecycle, AssistantSegmentKind } from "./turn-lifecycle"

// TUI-2.1A: Production mounting
export { productionInputToSpineEntry } from "./production-spine-input"
export type { ProductionSpineInput, MessageView, GovernanceView } from "./production-spine-input"
export { createOrderingKey, compareOrderingKeys, createDedupeKey, dedupeKeyToString } from "./spine-ordering"
export type { SpineOrderingKey, SpineDedupeKey } from "./spine-ordering"

// TUI-2.1B: Approval shell controller
export { createApprovalShellController } from "./approval-shell-controller"
export type {
  ApprovalCommandResult,
  ApprovalCommandInput,
  ApprovalPanelView,
  ApprovalShellState,
  ApprovalOperatorService,
  SessionContext,
  ApprovalShellController,
} from "./approval-shell-controller"

// TUI-2.1C: HTTP operator service bridge (RB-01 D4 transport)
export { HttpApprovalOperatorService } from "./approval-http-bridge"
export type { HttpApprovalBridgeOptions } from "./approval-http-bridge"

// TUI-2.1A: Production approval integration
export { useApprovalIntegration, mergeSpineEntries } from "./approval-integration"
export type {
  ApprovalIntegrationInput,
  ApprovalIntegrationOutput,
} from "./approval-integration"

// PR6: operator-experience additions
export { resolveApprovalSnapshot, changeForExecuted, shortHash } from "./approval-snapshot"
export type { SpineApprovalSnapshot, SpineProofContinuation, SpineBraidChild, SpineBraidStatus } from "./spine-types"
export { buildTrustStatus, eventGapFromTrace } from "./spine-trust"
export type { SpineTrustStatus, SpineTrustInput, SpineTrustState, SpineTrustConnection } from "./spine-trust"
export { buildSubagentBraid, braidStatusFor } from "./spine-braid.ts"
export type { SpineBraidInput } from "./spine-braid.ts"
export { attachProofContinuations } from "./spine-proof-attach"
export { buildSpineInspection } from "./spine-inspector.ts"
export type { SpineInspectionSection, SpineInspectionInput } from "./spine-inspector.ts"
export { SpineInspector } from "./spine-inspector.tsx"

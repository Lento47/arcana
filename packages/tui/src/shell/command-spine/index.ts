export { CommandSpineShell } from "./command-spine-shell"
export type { SpineKind, SpineLayout, SpineEntry, SpineReceipt, SpineDiffExcerpt, SpineActivity } from "./spine-types"
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
export type { ProductionSpineInput, GovernanceView } from "./production-spine-input"
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
export { useApprovalIntegration } from "./approval-integration"
export type {
  ApprovalIntegrationInput,
  ApprovalIntegrationOutput,
} from "./approval-integration"

// PR6: operator-experience additions
export { resolveApprovalSnapshot, changeForExecuted, shortHash } from "./approval-snapshot"
export type { SpineApprovalSnapshot, SpineProofContinuation } from "./spine-types"
export { buildTrustStatus, eventGapFromTrace } from "./spine-trust"
export { projectSessionCharter, projectGovernedTally, buildHeaderStatusItems, joinHeaderStatus } from "./session-charter"
export type { SessionCharter, SessionCharterChip } from "./session-charter"
export type { SpineTrustStatus, SpineTrustInput, SpineTrustState, SpineTrustConnection } from "./spine-trust"
export { attachProofContinuations } from "./spine-proof-attach"
export { collapseWorkActivities, isWorkActivityEntry, isWorkActivityKind, summarizeWorkActivity } from "./spine-activity"
export { projectInsightCard } from "./spine-insight"
export type { InsightCardModel, InsightMetric } from "./spine-insight"
export {
  toolChipChrome,
  thinkingRowChrome,
  streamTextCue,
  approvalGateFacts,
  approvalFactGroups,
  taskRowChrome,
  chatCardChrome,
  promptBarState,
  codeBlockChrome,
  insightHeaderChrome,
  listingEntryChrome,
  selectionHintChrome,
  selectionActions,
  packChipRows,
  chipCellWidth,
  FACT_LABEL_WIDTH,
} from "./spine-chrome"
export { buildSpineInspection } from "./spine-inspector.ts"
export type { SpineInspectionSection, SpineInspectionInput } from "./spine-inspector.ts"

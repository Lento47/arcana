export { CommandSpineShell } from "./command-spine-shell"
export type { SpineKind, SpineLayout, SpineEntry, SpineReceipt, SpineDiffExcerpt } from "./spine-types"
export { getSpineLayout, spineTone, SPINE_GLYPH } from "./spine-types"
export { SAMPLE_ENTRIES } from "./sample-entries"
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

// TUI-2.1A: Production approval integration
export { useApprovalIntegration, mergeSpineEntries } from "./approval-integration"
export type {
  ApprovalIntegrationInput,
  ApprovalIntegrationOutput,
} from "./approval-integration"

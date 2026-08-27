import type { PromptRef } from "../../component/prompt"
import { Prompt } from "../../component/prompt"
import { PLACEHOLDER } from "../../branding"
import { type SpineLayout } from "./spine-types"

/**
 * S9: composer liveness is signal-driven. `pulseActive` remains the pure
 * lifecycle gate for shared motion consumers; the prompt itself no longer
 * owns an animated rail marker. Waiting is engine-authored for permission /
 * approval gates and remains visually stable while the operator decides.
 */
export type SpinePromptState = "idle" | "working" | "retrying" | "waiting" | "stop"

export function pulseActive(state: SpinePromptState): boolean {
  return state === "working" || state === "retrying"
}

export function SpinePrompt(props: {
  bind: (r: PromptRef | undefined) => void
  disabled: () => boolean
  visible: () => boolean
  sessionID: string
  /** Called after send. May receive the submitted text for optimistic UI. */
  toBottom: (text?: string) => void
  layout: () => SpineLayout
  state: () => SpinePromptState
  /** Width of the session frame after route-level chrome. */
  contentWidth?: number
  /** Session-global gutter width so the composer stays aligned with rows. */
  gutterWidth?: number
}) {
  // Full-width Grok-like composer: the rounded frame owns the left edge.
  // Liveness is shown by SpineComposer's Working… cue, not a separate rail.
  return (
    <box flexDirection="column" flexShrink={0} flexGrow={0} width="100%" paddingTop={0} paddingBottom={0}>
      <Prompt
        ref={props.bind}
        disabled={props.disabled()}
        visible={props.visible()}
        onSubmit={props.toBottom}
        sessionID={props.sessionID}
        variant="command-spine"
        contentWidth={props.contentWidth}
        placeholders={PLACEHOLDER}
      />
    </box>
  )
}

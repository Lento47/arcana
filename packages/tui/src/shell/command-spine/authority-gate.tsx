import { Show } from "solid-js"
import { PermissionPrompt } from "../../routes/session/permission"
import { QuestionPrompt } from "../../routes/session/question"

/**
 * Authority gate: renders the pending permission/question action gates below
 * the spine viewport. The gate owns the decision keys; the spine stays
 * navigable for inspection while a gate is open.
 */
export function AuthorityGate(props: {
  permissions: unknown[]
  questions: unknown[]
}) {
  return (
    <>
      <Show when={props.permissions.length > 0}>
        <PermissionPrompt request={props.permissions[0] as any} />
      </Show>
      <Show when={props.permissions.length === 0 && props.questions.length > 0}>
        <QuestionPrompt request={props.questions[0] as any} />
      </Show>
    </>
  )
}

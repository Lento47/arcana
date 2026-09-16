import { Show, createEffect, createMemo } from "solid-js"
import { PermissionPrompt } from "../../routes/session/permission"
import { QuestionPrompt } from "../../routes/session/question"
import { isLocalPermissionRequest } from "./spine-gates"
import { logPermissionDebug } from "../../util/permission-debug"

/**
 * Authority gate: renders the pending permission/question action gates below
 * the spine viewport. The gate owns the decision keys; the spine stays
 * navigable for inspection while a gate is open.
 */
export function AuthorityGate(props: {
  permissions: unknown[]
  questions: unknown[]
}) {
  const localPermissions = () => props.permissions.filter(isLocalPermissionRequest)
  // Visible docket: when several local gates are queued the operator should
  // know how many remain and what is next (only the head is rendered).
  const permissionQueue = createMemo(() => {
    const list = localPermissions()
    if (list.length <= 1) return undefined
    const next = (list[1] as { permission?: string } | undefined)?.permission
    return { index: 1, total: list.length, next }
  })
  // Gate-flicker probe: logs every head-request change. A `gate.head` line
  // with a NEW id and no preceding prompt.dispose/prompt.create pair means
  // the SAME PermissionPrompt instance silently swapped requests (queued-gate
  // reuse); `gate.clear` marks the overlay fully unmounting.
  createEffect(() => {
    const head = localPermissions()[0] as { id?: string; permission?: string } | undefined
    if (head?.id) {
      logPermissionDebug("gate.head", {
        id: head.id,
        permission: head.permission,
        queueLength: props.permissions.length,
      })
    } else {
      logPermissionDebug("gate.clear", { localCount: localPermissions().length, queueLength: props.permissions.length })
    }
  })
  return (
    <>
      <Show when={localPermissions().length > 0}>
        <PermissionPrompt request={localPermissions()[0] as any} queue={permissionQueue()} />
      </Show>
      <Show when={localPermissions().length === 0 && props.permissions.length === 0 && props.questions.length > 0}>
        <QuestionPrompt request={props.questions[0] as any} />
      </Show>
    </>
  )
}

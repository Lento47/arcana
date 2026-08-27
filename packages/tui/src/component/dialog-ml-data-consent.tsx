import { TextAttributes } from "@opentui/core"
import { Show, createSignal, onMount } from "solid-js"

import { useTheme } from "../context/theme"
import { useBindings } from "../keymap"
import { useDialog } from "../ui/dialog"

export type MlConsentScope = "workspace" | "device"
export type MlConsentDecision = "grant" | "revoke" | "inherit"

export type MlDataCommandOutput = {
  exitCode: number
  stdout: string
  stderr: string
}

export type DialogMlDataConsentProps = {
  workspace: string
  loadStatus: () => Promise<MlDataCommandOutput>
  loadDisclosure: () => Promise<MlDataCommandOutput>
  changeConsent: (decision: MlConsentDecision, scope: MlConsentScope) => Promise<MlDataCommandOutput>
}

type PendingDecision = {
  decision: "grant" | "inherit"
  scope: MlConsentScope
}

function commandMessage(result: MlDataCommandOutput): string {
  return [result.stdout, result.stderr].filter(Boolean).join("\n").trim()
}

export function DialogMlDataConsent(props: DialogMlDataConsentProps) {
  const dialog = useDialog()
  const { theme } = useTheme()
  const [status, setStatus] = createSignal("Loading local learning status…")
  const [disclosure, setDisclosure] = createSignal("")
  const [feedback, setFeedback] = createSignal("")
  const [busy, setBusy] = createSignal(false)
  const [pending, setPending] = createSignal<PendingDecision>()

  const refresh = async () => {
    const result = await props.loadStatus()
    const message = commandMessage(result)
    setStatus(message || (result.exitCode === 0 ? "No learning status was returned." : "Could not load learning status."))
  }

  const runDecision = async (decision: MlConsentDecision, scope: MlConsentScope) => {
    if (busy()) return
    setBusy(true)
    setFeedback("")
    try {
      const result = await props.changeConsent(decision, scope)
      setFeedback(commandMessage(result) || `Consent command exited ${result.exitCode}.`)
      await refresh()
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
      setPending(undefined)
    }
  }

  const requestGrant = (scope: MlConsentScope) => {
    if (busy() || !disclosure()) return
    setFeedback("")
    setPending({ decision: "grant", scope })
  }

  const requestInherit = () => {
    if (busy() || !disclosure()) return
    setFeedback("")
    setPending({ decision: "inherit", scope: "workspace" })
  }

  const confirmPending = () => {
    const value = pending()
    if (value) void runDecision(value.decision, value.scope)
  }

  onMount(() => {
    dialog.setSize("large")
    void Promise.all([props.loadDisclosure(), props.loadStatus()])
      .then(([disclosureResult, statusResult]) => {
        setDisclosure(disclosureResult.stdout.trim())
        setStatus(commandMessage(statusResult) || "No learning status was returned.")
      })
      .catch((error) => {
        setStatus(error instanceof Error ? error.message : String(error))
      })
  })

  useBindings(() => ({
    bindings: [
      {
        key: "g",
        desc: "Grant workspace learning consent",
        group: "ML consent",
        cmd: () => requestGrant("workspace"),
      },
      {
        key: "d",
        desc: "Grant device learning consent",
        group: "ML consent",
        cmd: () => requestGrant("device"),
      },
      {
        key: "r",
        desc: "Revoke workspace learning consent",
        group: "ML consent",
        cmd: () => void runDecision("revoke", "workspace"),
      },
      {
        key: "x",
        desc: "Revoke device learning consent",
        group: "ML consent",
        cmd: () => void runDecision("revoke", "device"),
      },
      {
        key: "i",
        desc: "Inherit device learning consent",
        group: "ML consent",
        cmd: requestInherit,
      },
      {
        key: "return",
        desc: "Confirm learning consent change",
        group: "ML consent",
        enabled: pending() !== undefined,
        cmd: confirmPending,
      },
    ],
  }))

  return (
    <box paddingLeft={2} paddingRight={2} paddingBottom={1} gap={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          Signal Engine learning consent
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          esc
        </text>
      </box>

      <text fg={theme.textMuted} wrapMode="word">
        Workspace: {props.workspace}
      </text>

      <box flexDirection="column" gap={0}>
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          Current local status
        </text>
        <text fg={theme.textMuted} wrapMode="word">
          {status()}
        </text>
      </box>

      <box flexDirection="column" gap={0}>
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          What granting consent means
        </text>
        <Show
          when={disclosure()}
          fallback={<text fg={theme.warning}>Loading policy disclosure. Grant actions are disabled.</text>}
        >
          <text fg={theme.textMuted} wrapMode="word">
            {disclosure()}
          </text>
        </Show>
      </box>

      <Show
        when={pending()}
        fallback={
          <box flexDirection="column" gap={0}>
            <text fg={theme.text} attributes={TextAttributes.BOLD}>
              Workspace consent
            </text>
            <box flexDirection="row" gap={2}>
              <text
                fg={disclosure() && !busy() ? theme.primary : theme.textMuted}
                attributes={TextAttributes.UNDERLINE}
                onMouseUp={() => requestGrant("workspace")}
              >
                [g] grant
              </text>
              <text
                fg={!busy() ? theme.warning : theme.textMuted}
                attributes={TextAttributes.UNDERLINE}
                onMouseUp={() => void runDecision("revoke", "workspace")}
              >
                [r] revoke
              </text>
              <text
                fg={disclosure() && !busy() ? theme.primary : theme.textMuted}
                attributes={TextAttributes.UNDERLINE}
                onMouseUp={requestInherit}
              >
                [i] inherit device
              </text>
            </box>

            <text fg={theme.text} attributes={TextAttributes.BOLD}>
              Device consent
            </text>
            <text fg={theme.textMuted} wrapMode="word">
              Device consent applies only to workspaces configured to inherit it.
            </text>
            <box flexDirection="row" gap={2}>
              <text
                fg={disclosure() && !busy() ? theme.primary : theme.textMuted}
                attributes={TextAttributes.UNDERLINE}
                onMouseUp={() => requestGrant("device")}
              >
                [d] grant device
              </text>
              <text
                fg={!busy() ? theme.warning : theme.textMuted}
                attributes={TextAttributes.UNDERLINE}
                onMouseUp={() => void runDecision("revoke", "device")}
              >
                [x] revoke device
              </text>
            </box>
          </box>
        }
      >
        {(choice) => (
          <box flexDirection="column" gap={1}>
            <text fg={theme.warning} attributes={TextAttributes.BOLD}>
              Confirm {choice().scope} {choice().decision}
            </text>
            <text fg={theme.text} wrapMode="word">
              {choice().decision === "inherit"
                ? "This workspace will follow device consent. If device consent is granted now or later, local learning collection will be enabled here under the disclosure above."
                : choice().scope === "device"
                  ? "This records device consent. Every workspace set to inherit device consent may then retain learning data under the disclosure above."
                  : "This records consent for this workspace under the disclosure above."}
            </text>
            <box flexDirection="row" gap={2}>
              <text
                fg={!busy() ? theme.primary : theme.textMuted}
                attributes={TextAttributes.UNDERLINE}
                onMouseUp={confirmPending}
              >
                [enter] confirm
              </text>
              <text
                fg={theme.textMuted}
                attributes={TextAttributes.UNDERLINE}
                onMouseUp={() => !busy() && setPending(undefined)}
              >
                cancel
              </text>
            </box>
          </box>
        )}
      </Show>

      <Show when={busy()}>
        <text fg={theme.textMuted}>Applying consent decision…</text>
      </Show>
      <Show when={feedback()}>
        <text fg={theme.textMuted} wrapMode="word">
          {feedback()}
        </text>
      </Show>

      <text fg={theme.textMuted} wrapMode="word">
        Revoking consent stops new collection. It does not silently purge already retained data; purge remains a separate explicit command.
      </text>
    </box>
  )
}

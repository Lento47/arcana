import type { ExperimentalWorkspaceAdapterListResponse, Workspace } from "@arcana/sdk/v2"
import { Space } from "../ui/chrome"
import { useDialog } from "../ui/dialog"
import { DialogSelect, type DialogSelectOption } from "../ui/dialog-select"
import { useSync } from "../context/sync"
import { useProject } from "../context/project"
import { useRoute } from "../context/route"
import { createMemo, createSignal, onMount, Show } from "solid-js"
import { errorMessage } from "../util/error"
import { useSDK } from "../context/sdk"
import { useToast } from "../ui/toast"
import { Spinner } from "./spinner"
import { useTheme } from "../context/theme"
import { COPY, Glyph } from "../branding"
import { DialogAlert } from "../ui/dialog-alert"
import { DialogButton, DialogFooter } from "../ui/dialog-chrome"
import { DialogWorkspaceFileChanges } from "./dialog-workspace-file-changes"
import { TextAttributes } from "@opentui/core"
import { useBindings } from "../keymap"

type Adapter = ExperimentalWorkspaceAdapterListResponse[number]

export type WorkspaceSelection =
  | {
      type: "none"
    }
  | {
      type: "new"
      workspaceType: string
      workspaceName: string
    }
  | {
      type: "existing"
      workspaceID: string
      workspaceType: string
      workspaceName: string
    }

type WorkspaceSelectValue = WorkspaceSelection | { type: "existing-list" }
type ExistingWorkspaceSelectValue = { workspace: Workspace }

export function recentConnectedWorkspaces<WorkspaceInfo extends { id: string; timeUsed: number | string }>(input: {
  workspaces: readonly WorkspaceInfo[]
  status: (workspaceID: string) => string | undefined
  limit?: number
  omitWorkspaceID?: string
}) {
  const allWorkspaces = input.workspaces.filter((workspace) => input.status(workspace.id) === "connected")
  const workspaces = allWorkspaces.toSorted((a, b) => Number(b.timeUsed) - Number(a.timeUsed))
  const recent = workspaces.slice(0, input.limit ?? 3)

  return { recent, hasMore: recent.length < workspaces.length }
}

export function warpReminderText(dir: string) {
  return `<system-reminder>The user has changed the current working directory to "${dir}". This is still the same project but at a possibly new location; take this into account when working with any files from now on.</system-reminder>`
}

// Discovery failure is reported twice — a toast while the picker is open and the
// retry card that replaces it. One source so the two surfaces cannot drift.
const WORKSPACE_ADAPTERS_FAILED = "Failed to load workspace adapters"

async function loadWorkspaceAdapters(input: {
  sdk: ReturnType<typeof useSDK>
  sync: ReturnType<typeof useSync>
  toast: ReturnType<typeof useToast>
}) {
  const dir = input.sync.path.directory || input.sdk.directory
  try {
    const response = await input.sdk.client.experimental.workspace.adapter.list({ directory: dir })
    if (response.error) throw response.error
    return response.data
  } catch (err) {
    input.toast.show({
      title: WORKSPACE_ADAPTERS_FAILED,
      message: `${errorMessage(err)} — retry from the workspace dialog.`,
      variant: "error",
    })
    return undefined
  }
}

export async function openWorkspaceSelect(input: {
  dialog: ReturnType<typeof useDialog>
  sdk: ReturnType<typeof useSDK>
  sync: ReturnType<typeof useSync>
  project: ReturnType<typeof useProject>
  toast: ReturnType<typeof useToast>
  onSelect: (selection: WorkspaceSelection) => Promise<void> | void
}) {
  input.dialog.clear()
  // Show loading state during async workspace discovery
  input.dialog.replace(() => <DialogWorkspaceLoading />)
  await input.sdk.client.experimental.workspace.syncList().catch(() => undefined)
  await input.project.workspace.sync().catch(() => undefined)
  const adapters = await loadWorkspaceAdapters(input)
  if (!adapters) {
    input.dialog.replace(() => <DialogWorkspaceError onRetry={() => openWorkspaceSelect(input)} />)
    return
  }
  input.dialog.replace(() => <DialogWorkspaceSelect adapters={adapters} onSelect={input.onSelect} />)
}

export async function warpWorkspaceSession(input: {
  dialog: ReturnType<typeof useDialog>
  sdk: ReturnType<typeof useSDK>
  sync: ReturnType<typeof useSync>
  project: ReturnType<typeof useProject>
  toast: ReturnType<typeof useToast>
  sourceWorkspaceID?: string
  workspaceID: string | null
  sessionID: string
  copyChanges: boolean
  done?: () => void
}): Promise<boolean> {
  let result
  try {
    result = await input.sdk.client.experimental.workspace.warp({
      id: input.workspaceID,
      sessionID: input.sessionID,
      copyChanges: input.copyChanges,
    })
  } catch (err) {
    input.toast.show({
      title: "Failed to warp session",
      message: `${errorMessage(err)} — try again.`,
      variant: "error",
    })
    return false
  }
  if (!result?.data) {
    if (result?.error && "name" in result.error && result.error.name === "VcsApplyError") {
      await DialogAlert.show(
        input.dialog,
        "Unable to Warp Session",
        "Nothing was changed — the workspace has conflicting changes or is based on a different branch. Resolve the conflict in the workspace, then retry.",
      )
      return false
    }

    input.toast.show({
      title: "Failed to warp session",
      message: `${errorMessage(result?.error ?? "no response")} — try again.`,
      variant: "error",
    })
    return false
  }

  input.project.workspace.set(input.workspaceID)

  await input.sync.bootstrap({ fatal: false }).catch(() => undefined)

  const dir = input.project.instance.directory() || input.sync.path.directory
  if (dir) {
    await input.sdk.client.session
      .promptAsync({
        sessionID: input.sessionID,
        workspace: input.workspaceID ?? undefined,
        noReply: true,
        parts: [
          {
            type: "text",
            text: warpReminderText(dir),
            synthetic: true,
          },
        ],
      })
      .catch(() => undefined)
  }

  await Promise.all([input.project.workspace.sync(), input.sync.session.refresh()])

  if (input.done) {
    input.done()
    return true
  }
  input.dialog.clear()
  return true
}

export async function confirmWorkspaceFileChanges(input: {
  dialog: ReturnType<typeof useDialog>
  sdk: ReturnType<typeof useSDK>
  sourceWorkspaceID?: string
}) {
  const status = await input.sdk.client.vcs.status({ workspace: input.sourceWorkspaceID }).catch(() => undefined)
  const fileChangeChoice = status?.data?.length
    ? await DialogWorkspaceFileChanges.show(input.dialog, status.data)
    : "no"
  if (!fileChangeChoice) return
  return fileChangeChoice === "yes"
}

export function DialogWorkspaceSelect(props: {
  adapters?: Adapter[]
  onSelect: (selection: WorkspaceSelection) => Promise<void> | void
}) {
  const dialog = useDialog()
  const project = useProject()
  const route = useRoute()
  const sync = useSync()
  const sdk = useSDK()
  const toast = useToast()
  const [adapters, setAdapters] = createSignal<Adapter[] | undefined>(props.adapters)
  const [loadFailed, setLoadFailed] = createSignal(false)
  const omittedWorkspaceID = createMemo(() => (route.data.type === "session" ? project.workspace.current() : undefined))

  const load = async () => {
    setLoadFailed(false)
    const res = await loadWorkspaceAdapters({ sdk, sync, toast })
    if (!res) {
      setLoadFailed(true)
      return
    }
    setAdapters(res)
  }

  onMount(() => {
    dialog.setSize("medium")
    if (!adapters()) void load()
  })

  const options = createMemo<DialogSelectOption<WorkspaceSelectValue>[]>(() => {
    const list = adapters()
    if (!list) return []
    const { recent, hasMore } = recentConnectedWorkspaces({
      workspaces: project.workspace.list(),
      status: project.workspace.status,
      omitWorkspaceID: omittedWorkspaceID(),
    })
    return [
      ...list.map((adapter) => ({
        title: adapter.name,
        value: { type: "new" as const, workspaceType: adapter.type, workspaceName: adapter.name },
        description: adapter.description,
        category: "New workspace",
      })),
      {
        title: "None",
        value: { type: "none" as const },
        description: "Use the local project",
        category: "Choose workspace",
      },
      ...recent.map((workspace: Workspace) => ({
        title: workspace.name,
        description: `(${workspace.type})`,
        value: {
          type: "existing" as const,
          workspaceID: workspace.id,
          workspaceType: workspace.type,
          workspaceName: workspace.name,
        },
        category: "Choose workspace",
      })),
      ...(hasMore
        ? [
            {
              title: "View all workspaces",
              value: { type: "existing-list" as const },
              description: "Choose from all workspaces",
              category: "Choose workspace",
            },
          ]
        : []),
    ]
  })

  return (
    <Show
      when={adapters()}
      fallback={
        <Show when={loadFailed()} fallback={<DialogWorkspaceLoading />}>
          <DialogWorkspaceError onRetry={() => void load()} />
        </Show>
      }
    >
      <DialogSelect<WorkspaceSelectValue>
        title={`${Glyph.sigil} Warp`}
        skipFilter={true}
        renderFilter={false}
        options={options()}
        onSelect={(option) => {
          if (!option.value) return
          if (option.value.type === "none") {
            void props.onSelect(option.value)
            return
          }
          if (option.value.type === "new") {
            void props.onSelect(option.value)
            return
          }
          if (option.value.type === "existing") {
            void props.onSelect(option.value)
            return
          }

          dialog.replace(() => (
            <DialogExistingWorkspaceSelect omitWorkspaceID={omittedWorkspaceID()} onSelect={props.onSelect} />
          ))
        }}
      />
    </Show>
  )
}

function DialogExistingWorkspaceSelect(props: {
  omitWorkspaceID?: string
  onSelect: (selection: WorkspaceSelection) => Promise<void> | void
}) {
  const project = useProject()
  const { theme } = useTheme()

  const options = createMemo<DialogSelectOption<ExistingWorkspaceSelectValue>[]>(() =>
    project.workspace
      .list()
      .filter((workspace) => project.workspace.status(workspace.id) === "connected")
      .filter((workspace) => workspace.id !== props.omitWorkspaceID)
      .map((workspace: Workspace) => ({
        title: workspace.name,
        description: `(${workspace.type})`,
        value: { workspace },
      })),
  )

  return (
    <DialogSelect<ExistingWorkspaceSelectValue>
      title={`${Glyph.sigil} Existing Workspace`}
      options={options()}
      emptyView={
        <box paddingLeft={Space.insetWide} paddingRight={Space.insetWide} paddingTop={Space.padY}>
          <text fg={theme.textMuted}>No connected workspaces available.</text>
        </box>
      }
      onSelect={(option) => {
        void props.onSelect({
          type: "existing",
          workspaceID: option.value.workspace.id,
          workspaceType: option.value.workspace.type,
          workspaceName: option.value.workspace.name,
        })
      }}
    />
  )
}

// Loading placeholder shown during workspace discovery.
function DialogWorkspaceLoading() {
  const { theme } = useTheme()
  return (
    <box padding={Space.inset} flexDirection="row" gap={Space.gap} alignItems="center">
      <Spinner />
      <text fg={theme.textMuted}>Loading workspace adapters…</text>
    </box>
  )
}

// Error state shown when workspace adapter loading fails.
export function DialogWorkspaceError(props: { onRetry: () => void }) {
  const { theme } = useTheme()
  const dialog = useDialog()
  const [active, setActive] = createSignal<"cancel" | "retry">("retry")

  const confirm = () => {
    if (active() === "cancel") {
      dialog.clear()
      return
    }
    props.onRetry()
  }

  useBindings(() => ({
    bindings: [
      { key: "return", desc: "Confirm workspace adapter action", group: "Dialog", cmd: confirm },
      { key: "left", desc: "Cancel workspace adapter retry", group: "Dialog", cmd: () => setActive("cancel") },
      { key: "right", desc: "Retry workspace adapters", group: "Dialog", cmd: () => setActive("retry") },
    ],
  }))
  return (
    <box padding={Space.inset} gap={Space.gap}>
      <text fg={theme.error} attributes={TextAttributes.BOLD}>
        {WORKSPACE_ADAPTERS_FAILED}
      </text>
      <text fg={theme.textMuted} wrapMode="word">
        Check that the engine is reachable, then press Enter to retry.
      </text>
      <DialogFooter>
        <DialogButton label={COPY.dialog.cancel} active={active() === "cancel"} onPress={() => dialog.clear()} />
        <DialogButton label={COPY.dialog.retry} active={active() === "retry"} onPress={props.onRetry} />
      </DialogFooter>
    </box>
  )
}

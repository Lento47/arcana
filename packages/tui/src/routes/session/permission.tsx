import { createStore } from "solid-js/store"
import { dirname } from "node:path"
import { createMemo, For, Match, onCleanup, Show, Switch } from "solid-js"
import { Portal, useRenderer, type JSX } from "@opentui/solid"
import { useTerminalSize } from "../../util/terminal-size"
import type { RGBA, TextareaRenderable } from "@opentui/core"
import { Glyph } from "../../branding"
import { useTheme, selectedForeground } from "../../context/theme"
import type { PermissionRequest } from "@arcana/sdk/v2"
import { useSDK } from "../../context/sdk"
import { useSync } from "../../context/sync"
import { useProject } from "../../context/project"
import { filetype } from "../../util/filetype"
import { Locale } from "../../util/locale"
import { webSearchProviderLabel } from "../../util/tool-display"
import { getScrollAcceleration } from "../../util/scroll"
import { logPermissionDebug } from "../../util/permission-debug"
import { useTuiConfig } from "../../config"
import { useKV } from "../../context/kv"
import { Space } from "../../ui/chrome"
import { rendererWidth, sessionContentWidth } from "../../util/geometry"
import { isDensity, type Density } from "../../shell/command-spine/spine-types"
import { ARCANA_BASE_MODE, useBindings, useCommandShortcut } from "../../keymap"
import { usePathFormatter } from "../../context/path-format"
import { SpineGutterSpacer, spineLeadMetrics } from "../../shell/command-spine/spine-lead"
import { useSpineLayout } from "../../shell/command-spine/use-spine-layout"
import { SpineRail } from "../../shell/command-spine/spine-rail"
import { SigilSpinner } from "../../component/sigil-spinner"

type PermissionStage = "permission" | "always" | "reject"

export const PERMISSION_DECISION_LAYER_PRIORITY = 10

export function isContractAdmissionRequest(request: PermissionRequest) {
  return request.permission === "contract.accept" && request.metadata?.kind === "contract_admission"
}

export function canRememberPermission(request: PermissionRequest) {
  // The engine strips candidate patterns when policy/risk makes persistence
  // ineligible. Clients must render that authoritative decision verbatim.
  return request.always.length > 0
}

// Shared "unknown request" 404 detector lives in util/api-error.ts; the
// permission-scoped alias below keeps existing call sites and tests working.
import { isUnknownRequestNotFoundError } from "../../util/api-error"
export { isUnknownRequestNotFoundError as isPermissionNotFoundError }

export function permissionDecisionOptions(request: PermissionRequest): Record<string, string> {
  const remember = canRememberPermission(request)
  if (isContractAdmissionRequest(request)) {
    return remember
      ? { always: "Always Activate", once: "Activate Once", reject: "Decline" }
      : { once: "Activate Once", reject: "Decline" }
  }
  return remember
    ? { once: "Allow Once", always: "Allow Always", reject: "Reject" }
    : { once: "Allow Once", reject: "Reject" }
}

export function createPermissionOptionBindings<T extends string>(input: {
  keys: readonly T[]
  selected: () => T
  select: (value: T) => void
  submit: (value: T) => void
}) {
  const move = (offset: number) => {
    const index = input.keys.indexOf(input.selected())
    const next = input.keys[(index + offset + input.keys.length) % input.keys.length]
    input.select(next)
  }
  return [
    { key: "left", desc: "Previous permission option", group: "Permission", cmd: () => move(-1) },
    { key: "h", desc: "Previous permission option", group: "Permission", cmd: () => move(-1) },
    { key: "right", desc: "Next permission option", group: "Permission", cmd: () => move(1) },
    { key: "l", desc: "Next permission option", group: "Permission", cmd: () => move(1) },
    {
      key: "return",
      desc: "Select permission option",
      group: "Permission",
      preventDefault: true,
      cmd: () => input.submit(input.selected()),
    },
  ]
}

export function createPermissionRejectBindings(input: { cancel: () => void; confirm: () => void }) {
  return [
    { key: "escape", desc: "Cancel permission rejection", group: "Permission", cmd: input.cancel },
    {
      key: "return",
      desc: "Confirm permission rejection",
      group: "Permission",
      preventDefault: true,
      cmd: input.confirm,
    },
  ]
}

function EditBody(props: { request: PermissionRequest }) {
  const themeState = useTheme()
  const theme = themeState.theme
  const syntax = themeState.syntax
  const config = useTuiConfig()
  const dimensions = useTerminalSize(useRenderer())

  const filepath = createMemo(() => {
    const value = props.request.metadata?.filepath
    return typeof value === "string" ? value : ""
  })
  const diff = createMemo(() => {
    const value = props.request.metadata?.diff
    return typeof value === "string" ? value : ""
  })

  const view = createMemo(() => {
    const diffStyle = config.diff_style
    if (diffStyle === "stacked") return "unified"
    return dimensions().width > 120 ? "split" : "unified"
  })

  const ft = createMemo(() => filetype(filepath()))
  const scrollAcceleration = createMemo(() => getScrollAcceleration(config))

  return (
    <box flexDirection="column" gap={1} minWidth={0}>
      <Show when={diff()}>
        <scrollbox
          height="100%"
          scrollAcceleration={scrollAcceleration()}
          verticalScrollbarOptions={{
            trackOptions: {
              backgroundColor: theme.background,
              foregroundColor: theme.borderActive,
            },
          }}
        >
          <diff
            diff={diff()}
            view={view()}
            filetype={ft()}
            syntaxStyle={syntax()}
            showLineNumbers={true}
            width="100%"
            wrapMode="word"
            fg={theme.text}
            addedBg={theme.diffAddedBg}
            removedBg={theme.diffRemovedBg}
            contextBg={theme.diffContextBg}
            addedSignColor={theme.diffHighlightAdded}
            removedSignColor={theme.diffHighlightRemoved}
            lineNumberFg={theme.diffLineNumber}
            lineNumberBg={theme.diffContextBg}
            addedLineNumberBg={theme.diffAddedLineNumberBg}
            removedLineNumberBg={theme.diffRemovedLineNumberBg}
          />
        </scrollbox>
      </Show>
      <Show when={!diff()}>
        <box paddingLeft={1}>
          <text fg={theme.textMuted}>No diff provided for this edit — review the request details before deciding.</text>
        </box>
      </Show>
    </box>
  )
}

function inspectFromMetadata(metadata: PermissionRequest["metadata"] | undefined):
  | {
      verdict: string
      risk: string
      lines: string[]
    }
  | undefined {
  const action =
    metadata && typeof metadata === "object"
      ? (metadata as { engine_action?: { inspect?: unknown } }).engine_action
      : undefined
  const inspect = action?.inspect
  if (!inspect || typeof inspect !== "object") return undefined
  const record = inspect as {
    verdict?: unknown
    risk?: unknown
    findings?: unknown
  }
  const findings = Array.isArray(record.findings) ? record.findings : []
  const lines = findings.flatMap((item) => {
    if (!item || typeof item !== "object") return []
    const row = item as { severity?: unknown; title?: unknown; detail?: unknown }
    const title = typeof row.title === "string" ? row.title : ""
    const detail = typeof row.detail === "string" ? row.detail : ""
    const severity = typeof row.severity === "string" ? row.severity : ""
    if (!title) return []
    return [`${severity} ${title}${detail ? ` — ${detail}` : ""}`.trim()]
  })
  if (lines.length === 0 && typeof record.verdict !== "string") return undefined
  return {
    verdict: typeof record.verdict === "string" ? record.verdict : "review",
    risk: typeof record.risk === "string" ? record.risk : "high",
    lines,
  }
}

function InspectBody(props: { request: PermissionRequest }) {
  const { theme } = useTheme()
  const inspect = inspectFromMetadata(props.request.metadata)
  return (
    <Show when={inspect}>
      {(report) => (
        <box paddingLeft={1} paddingTop={1} flexDirection="column" gap={0}>
          <text fg={report().verdict === "block" ? theme.error : theme.warning}>
            {`inspect ${report().verdict} · ${report().risk}`}
          </text>
          <For each={report().lines}>
            {(line) => (
              <text fg={theme.textMuted} wrapMode="word">
                {line}
              </text>
            )}
          </For>
        </box>
      )}
    </Show>
  )
}

function TextBody(props: { title: string; description?: string; icon?: string }) {
  const { theme } = useTheme()
  return (
    <>
      <box flexDirection="row" gap={1} paddingLeft={1} minWidth={0}>
        <Show when={props.icon}>
          <text fg={theme.textMuted} flexShrink={0}>
            {props.icon}
          </text>
        </Show>
        <text fg={theme.textMuted} wrapMode="word">
          {props.title}
        </text>
      </box>
      <Show when={props.description}>
        <box paddingLeft={1}>
          <text fg={theme.text} wrapMode="word">
            {props.description}
          </text>
        </box>
      </Show>
    </>
  )
}

export function PermissionPrompt(props: {
  request: PermissionRequest
  directory?: string
  /** Position in the pending gate docket; only the head is rendered. */
  queue?: { index: number; total: number; next?: string }
}) {
  const sdk = useSDK()
  const project = useProject()
  const sync = useSync()
  const [store, setStore] = createStore({
    stage: "permission" as PermissionStage,
    error: undefined as string | undefined,
    /** A decision reply is in flight; bindings are gated so Enter cannot double-send. */
    busy: false,
  })
  // Gate-flicker probe: a `prompt.create` line means a REAL component
  // instance was constructed. Seeing create/dispose pairs around an approve
  // points at store/reactivity; seeing none while the gate still flashes
  // points at a renderer paint artifact.
  logPermissionDebug("prompt.create", { id: props.request?.id, permission: props.request?.permission })
  onCleanup(() => logPermissionDebug("prompt.dispose", { id: props.request?.id }))
  const pathFormatter = usePathFormatter()

  const session = createMemo(() => sync.data.session.find((s) => s.id === props.request.sessionID))

  /**
   * Single reply path (gate-freeze fix A): failures were previously silent
   * `void`-fires, so a settled request left an unresponsive gate. NotFound
   * drops the phantom locally so the next queued gate can surface; anything
   * else surfaces inline instead of vanishing.
   */
  const sendReply = async (
    reply: "once" | "always" | "reject",
    options?: { message?: string },
  ): Promise<"ok" | "notfound" | "failed"> => {
    const handle = (error: unknown): "notfound" | "failed" => {
      if (isUnknownRequestNotFoundError(error)) {
        logPermissionDebug("reply.notfound", { id: props.request.id, reply })
        sync.permission.dropLocal(props.request.sessionID, props.request.id)
        return "notfound"
      }
      logPermissionDebug("reply.failed", { id: props.request.id, reply, error: String(error) })
      setStore("error", "Decision was not delivered — the request may have changed. Try again.")
      return "failed"
    }
    try {
      const res = await sdk.client.permission.reply({
        reply,
        requestID: props.request.id,
        directory: props.directory,
        workspace: project.workspace.current(),
        ...(options?.message ? { message: options.message } : {}),
      })
      const error = (res as { error?: unknown } | undefined)?.error
      if (!error) {
        setStore("error", undefined)
        return "ok"
      }
      return handle(error)
    } catch (error) {
      return handle(error)
    }
  }

  const input = createMemo(() => {
    const tool = props.request.tool
    if (!tool) return {}
    const parts = sync.data.part[tool.messageID] ?? []
    for (const part of parts) {
      if (part.type === "tool" && part.callID === tool.callID && part.state.status !== "pending") {
        return part.state.input ?? {}
      }
    }
    return {}
  })

  const { theme } = useTheme()
  const contractAdmission = createMemo(() => isContractAdmissionRequest(props.request))

  /** Single decision path: gate re-entry, flag in-flight, surface failures. */
  const decide = (reply: "once" | "always" | "reject", options?: { message?: string }) => {
    if (store.busy) return
    setStore("busy", true)
    void sendReply(reply, options).then((result) => {
      setStore("busy", false)
      if (result !== "failed" || reply !== "always") return
      setStore(
        "error",
        contractAdmission()
          ? "Preference was not saved; choose Activate Once or try again."
          : "Permission was not saved; choose Allow Once or try again.",
      )
    })
  }

  return (
    <Switch>
      <Match when={store.stage === "always"}>
        <Prompt
          title={contractAdmission() ? "Always Activate" : "Always Allow"}
          busy={store.busy}
          body={
            <Switch>
              <Match when={props.request.always.length === 1 && props.request.always[0] === "*"}>
                <TextBody
                  title={
                    contractAdmission()
                      ? "Future completion contracts will activate automatically for this workspace and agent. Tool and action approvals remain separate."
                      : "This will allow " +
                        props.request.permission +
                        " for this workspace and agent across future sessions."
                  }
                />
              </Match>
              <Match when={true}>
                <box paddingLeft={1} gap={1}>
                  <text fg={theme.textMuted}>
                    This will allow the following patterns for this workspace and agent across future sessions.
                  </text>
                  <box>
                    <For each={props.request.always}>
                      {(pattern) => (
                        <text fg={theme.text}>
                          {"- "}
                          {pattern}
                        </text>
                      )}
                    </For>
                  </box>
                </box>
              </Match>
            </Switch>
          }
          options={{ confirm: "Allow Always", cancel: "Cancel" }}
          escapeKey="cancel"
          onSelect={(option) => {
            setStore("stage", "permission")
            if (option === "cancel") return
            decide("always")
          }}
        />
      </Match>
      <Match when={store.stage === "reject"}>
        <RejectPrompt
          busy={store.busy}
          onConfirm={(message) => {
            decide("reject", { message })
          }}
          onCancel={() => {
            setStore("stage", "permission")
          }}
        />
      </Match>
      <Match when={store.stage === "permission"}>
        {(() => {
          const info = () => {
            const permission = props.request.permission
            const data = input()

            if (contractAdmission()) {
              const objective = props.request.metadata?.objective
              return {
                icon: "◇",
                title: typeof objective === "string" ? objective : "Activate completion contract",
                body: (
                  <box paddingLeft={1}>
                    <text fg={theme.textMuted} wrapMode="word">
                      This governs completion evidence only. Consequential actions still require their own authorization.
                    </text>
                  </box>
                ),
              }
            }

            if (permission === "edit") {
              const raw = props.request.metadata?.filepath
              const filepath = typeof raw === "string" ? raw : ""
              return {
                icon: "→",
                title: `Edit ${pathFormatter.format(filepath)}`,
                body: <EditBody request={props.request} />,
              }
            }

            if (permission === "read") {
              const raw = data.filePath
              const filePath = typeof raw === "string" ? raw : ""
              return {
                icon: "→",
                title: `Read ${pathFormatter.format(filePath)}`,
                body: (
                  <Show when={filePath}>
                    <box paddingLeft={1}>
                      <text fg={theme.textMuted}>{"Path: " + pathFormatter.format(filePath)}</text>
                    </box>
                  </Show>
                ),
              }
            }

            if (permission === "glob") {
              const pattern = typeof data.pattern === "string" ? data.pattern : ""
              return {
                icon: "✱",
                title: `Glob "${Locale.truncate(pattern, 60)}"`,
                body: (
                  <Show when={pattern}>
                    <box paddingLeft={1}>
                      <text fg={theme.textMuted}>{"Pattern: " + Locale.truncate(pattern, 120)}</text>
                    </box>
                  </Show>
                ),
              }
            }

            if (permission === "grep") {
              const pattern = typeof data.pattern === "string" ? data.pattern : ""
              return {
                icon: "✱",
                title: `Grep "${Locale.truncate(pattern, 60)}"`,
                body: (
                  <Show when={pattern}>
                    <box paddingLeft={1}>
                      <text fg={theme.textMuted}>{"Pattern: " + Locale.truncate(pattern, 120)}</text>
                    </box>
                  </Show>
                ),
              }
            }

            if (permission === "list") {
              const raw = data.path
              const dir = typeof raw === "string" ? raw : ""
              return {
                icon: "→",
                title: `List ${pathFormatter.format(dir)}`,
                body: (
                  <Show when={dir}>
                    <box paddingLeft={1}>
                      <text fg={theme.textMuted}>{"Path: " + pathFormatter.format(dir)}</text>
                    </box>
                  </Show>
                ),
              }
            }

            if (permission === "bash") {
              const title =
                typeof data.description === "string" && data.description ? data.description : "Shell command"
              const command = typeof data.command === "string" ? data.command : ""
              return {
                icon: "#",
                title,
                body: (
                  <Show when={command}>
                    <box paddingLeft={1}>
                      <text fg={theme.text}>{"$ " + Locale.truncate(command, 120)}</text>
                    </box>
                  </Show>
                ),
              }
            }

            if (permission === "task") {
              const type = typeof data.subagent_type === "string" ? data.subagent_type : "Unknown"
              const desc = typeof data.description === "string" ? data.description : ""
              return {
                icon: "#",
                title: `${Locale.titlecase(type)} Task`,
                body: (
                  <Show when={desc}>
                    <box paddingLeft={1}>
                      <text fg={theme.text}>{"◉ " + desc}</text>
                    </box>
                  </Show>
                ),
              }
            }

            if (permission === "webfetch") {
              const url = typeof data.url === "string" ? data.url : ""
              return {
                icon: "%",
                title: `WebFetch ${Locale.truncate(url, 80)}`,
                body: (
                  <Show when={url}>
                    <box paddingLeft={1}>
                      <text fg={theme.textMuted}>{"URL: " + Locale.truncate(url, 120)}</text>
                    </box>
                  </Show>
                ),
              }
            }

            if (permission === "websearch") {
              const query = typeof data.query === "string" ? data.query : ""
              return {
                icon: "◈",
                title: `${webSearchProviderLabel(data.provider)} "${query}"`,
                body: (
                  <Show when={query}>
                    <box paddingLeft={1}>
                      <text fg={theme.textMuted}>{"Query: " + query}</text>
                    </box>
                  </Show>
                ),
              }
            }

            if (permission === "external_directory") {
              const meta = props.request.metadata ?? {}
              const parent = typeof meta["parentDir"] === "string" ? meta["parentDir"] : undefined
              const filepath = typeof meta["filepath"] === "string" ? meta["filepath"] : undefined
              const pattern = props.request.patterns?.[0]
              const derived =
                typeof pattern === "string" ? (pattern.includes("*") ? dirname(pattern) : pattern) : undefined

              const raw = parent ?? filepath ?? derived
              const dir = pathFormatter.format(raw)
              const patterns = (props.request.patterns ?? []).filter((p): p is string => typeof p === "string")

              return {
                icon: "←",
                title: `External directory ${dir}`,
                body: (
                  <Show when={patterns.length > 0}>
                    <box paddingLeft={1} gap={1}>
                      <text fg={theme.textMuted}>Scope</text>
                      <box>
                        <For each={patterns}>{(p) => <text fg={theme.text}>{"- " + p}</text>}</For>
                      </box>
                    </box>
                  </Show>
                ),
              }
            }

            if (permission === "doom_loop") {
              return {
                icon: "⟳",
                title: "Continue after repeated failures",
                body: (
                  <box paddingLeft={1}>
                    <text fg={theme.textMuted}>This keeps the session running despite repeated failures.</text>
                  </box>
                ),
              }
            }

            return {
              icon: "⚙",
              title: `Call tool ${permission}`,
              body: (
                <box paddingLeft={1}>
                  <text fg={theme.textMuted}>{"Tool: " + permission}</text>
                </box>
              ),
            }
          }

          const current = info()

          const header = () => (
            <box flexDirection="column" gap={0} minWidth={0}>
              {/*
                No mark here. `GateFrame` draws the attention triangle on the
                gate's rail node — a gate's whole reason for being on screen is
                that something is waiting on the operator — and this heading
                carried a second copy of the same character one column over, so
                every gate printed the mark twice before its name, in two inks,
                with a space between them. The rail's is the one that belongs to
                the spine's vocabulary; the heading is its caption.

                The row below is not indented any more either. That two-column
                inset existed to clear this mark so the icon lined up under the
                heading text — with the mark gone it would push the icon two
                columns right of the heading it belongs to.
              */}
              <box flexDirection="row" gap={1} flexShrink={0} minWidth={0}>
                <text fg={theme.text} wrapMode="word">
                  {contractAdmission() ? "COMPLETION CONTRACT" : "ACTION GATE"}
                </text>
              </box>
              <box flexDirection="row" gap={1} flexShrink={0} minWidth={0}>
                <text fg={theme.textMuted} flexShrink={0}>
                  {current.icon}
                </text>
                <text fg={theme.text} wrapMode="word">
                  {current.title}
                </text>
              </box>
              <GateQueueLine queue={props.queue} />
            </box>
          )

          const body = (
            <Prompt
              title="Action gate"
              header={header()}
              busy={store.busy}
              body={
                <box flexDirection="column" minWidth={0}>
                  {current.body}
                  <InspectBody request={props.request} />
                  <Show when={store.error}>{(message) => <text fg={theme.error}>{message()}</text>}</Show>
                </box>
              }
              options={permissionDecisionOptions(props.request)}
              // Esc is intentionally NOT mapped on the gate: an accidental
              // Escape must never reject/decline the request. The operator
              // resolves the gate explicitly with ←/→ + Enter (Reject is a
              // deliberate two-step choice with its own confirmation stage).
              fullscreen
              onSelect={(option) => {
                if (option === "always") {
                  setStore("stage", "always")
                  return
                }
                if (option === "reject") {
                  if (session()?.parentID) {
                    setStore("stage", "reject")
                    return
                  }
                  decide("reject")
                  return
                }
                decide("once")
              }}
            />
          )

          return body
        })()}
      </Match>
    </Switch>
  )
}

/**
 * Pending-gate docket line: how many requests are queued and what comes next.
 * Only the head request renders; this keeps the queue visible to the operator.
 */
export function GateQueueLine(props: { queue?: { index: number; total: number; next?: string } }) {
  const { theme } = useTheme()
  return (
    <Show when={props.queue && props.queue.total > 1}>
      <box flexDirection="row" paddingLeft={2} flexShrink={0} minWidth={0}>
        <text fg={theme.textMuted} wrapMode="none">
          Request {props.queue!.index} of {props.queue!.total}
          {props.queue!.next ? ` · next: ${props.queue!.next}` : ""}
        </text>
      </box>
    </Show>
  )
}

function GateFrame(props: {
  header: JSX.Element
  body: JSX.Element
  footer?: JSX.Element
  expanded?: boolean
  /** Mark on the gate's own rail node. Defaults to the attention triangle: a
   * gate exists because something is waiting on the operator. */
  glyph?: string
  color?: RGBA
}) {
  const { theme } = useTheme()
  const dimensions = useTerminalSize(useRenderer())
  // Hysteresis (audit S4): shared tracked-prev hook — replaces the inline
  // _prevLayoutP holder + `as any` (same dead-zone behavior, typed).
  const layout = useSpineLayout(() => dimensions().width)
  const metrics = createMemo(() => spineLeadMetrics(layout()))
  const glyph = createMemo(() => props.glyph ?? Glyph.attention)
  const color = createMemo(() => props.color ?? theme.spineFix)

  function GateRow(row: { children: JSX.Element; rail?: "node" | "line"; marginTop?: number }) {
    return (
      <box
        flexDirection="row"
        flexShrink={0}
        flexGrow={1}
        minWidth={0}
        alignItems="flex-start"
        width="100%"
        paddingLeft={metrics().pad}
        paddingRight={metrics().pad}
        marginTop={row.marginTop}
      >
        <SpineGutterSpacer layout={layout()} />
        <Show when={row.rail === "node"} fallback={<SpineRail layout={layout()} glyph="│" color={theme.spineRail} />}>
          <SpineRail layout={layout()} glyph={glyph()} color={color()} active />
        </Show>
        <box flexDirection="column" flexGrow={1} minWidth={0} flexShrink={1}>
          {row.children}
        </box>
      </box>
    )
  }

  const shell = () => (
    <box
      flexDirection="column"
      flexShrink={0}
      width="100%"
      paddingTop={1}
      paddingBottom={1}
      {...(props.expanded
        ? { top: 1, bottom: 1, left: 0, right: 0, position: "absolute", zIndex: 20, backgroundColor: theme.background }
        : {})}
    >
      <GateRow rail="node">{props.header}</GateRow>
      <GateRow rail="line" marginTop={1}>
        {props.body}
      </GateRow>
      <Show when={props.footer}>
        {(footer) => (
          <GateRow rail="line" marginTop={1}>
            {footer()}
          </GateRow>
        )}
      </Show>
    </box>
  )

  return (
    <Show when={!props.expanded} fallback={<Portal>{shell()}</Portal>}>
      {shell()}
    </Show>
  )
}
/**
 * Gate chrome: the numbers the gates measure their own rows with.
 *
 * Both gates decide whether a row fits by measuring it, never by a breakpoint.
 * Every segment in those rows is `flexShrink={0}` — a label yoga shrinks is not
 * read, it is decoded — so a row that does not fit overruns the column instead
 * of degrading, and the measurement has to name exactly what the row draws.
 */

/**
 * Columns the lead spends before a row's content begins: the gutter and the
 * rail, two columns each in every layout (`spineGutterWidth`/`spineRailWidth`).
 * The gate adds no padding of its own — `spineOuterPadding` is zero by design,
 * because the session frame already insets the spine.
 */
const GATE_RAIL = 4

/** The decision row's label, named because its row is measured by it. */
const DECISION_LABEL = "Decision"
/** Cells the selection mark holds — `▸ ` selected, and the same two when not. */
const OPTION_MARKER = 2
/** The option box's own inset, one column each side. */
const OPTION_PAD = 1

/** Key hints, named so the fit check measures the row it draws. */
const HINT_SELECT = "←/→ select"
const HINT_CONFIRM = "enter confirm"
const HINT_REJECT = "esc reject"
const REJECT_CONFIRM_KEY = "enter"
const REJECT_CONFIRM_ACTION = "confirm"
const REJECT_CANCEL_KEY = "esc"
const REJECT_CANCEL_ACTION = "cancel"

/** Width of a `key action` hint — the key, one space, the action. */
function hintWidth(key: string, action: string): number {
  return Locale.displayWidth(key) + 1 + Locale.displayWidth(action)
}

/** The rejection input's own inset: one column left, two right. */
const REJECT_BODY_PAD = 3

/**
 * Least the rejection input keeps before its key hints move to their own row.
 * Below this the field shows less than a phrase, and a reason runs to a few —
 * so every clause would wrap while the field is the only thing on the row.
 */
const REJECT_INPUT_MIN = 24

/**
 * The gate's content column, or `undefined` before the renderer has been laid
 * out — an unmeasured renderer is not a narrow one, and `sessionContentWidth`
 * clamps one to a single column, which would read as "narrow" here.
 *
 * `expanded` is the fullscreen gate: it is portaled out of the session frame
 * (`routes/session/index.tsx`), so the frame's own padding no longer applies.
 */
function gateContentWidth(termWidth: number | undefined, density: Density, expanded = false): number | undefined {
  if (termWidth === undefined) return undefined
  return (expanded ? termWidth : sessionContentWidth(termWidth, density)) - GATE_RAIL
}

/**
 * The deny gate: the reason a rejection needs a reason.
 *
 * Exported so it can be rendered on its own. It is reached only through
 * `PermissionPrompt`'s two-step reject, which means a render test would have to
 * drive the gate's keymap to arrive at it — the screen an operator sees when
 * they deny something should not be the one screen the suite cannot reach.
 */
export function RejectPrompt(props: { busy?: boolean; onConfirm: (message: string) => void; onCancel: () => void }) {
  let input: TextareaRenderable
  const { theme } = useTheme()
  const tuiConfig = useTuiConfig()
  const renderer = useRenderer()
  const dimensions = useTerminalSize(renderer)
  const kv = useKV()
  const density = createMemo(() => {
    const stored = kv.get("density")
    return isDensity(stored) ? stored : "cozy"
  })
  /**
   * Whether the input and its key hints stack.
   *
   * The input is `width="100%"`, so beside it the hints are the row's only
   * fixed cost: they fit when what is left over can still show a reason. The
   * gate used to stack on a bare `width < 80`, which put the hints under the
   * field from 60 to 79 columns — two rows for one, on a card the operator is
   * trying to get past.
   */
  const stacks = () => {
    const width = gateContentWidth(rendererWidth({ width: dimensions().width }), density())
    if (width === undefined) return false
    const hints =
      hintWidth(REJECT_CONFIRM_KEY, REJECT_CONFIRM_ACTION) +
      Space.gapWide +
      hintWidth(REJECT_CANCEL_KEY, REJECT_CANCEL_ACTION)
    return width - REJECT_BODY_PAD - Space.gap - hints < REJECT_INPUT_MIN
  }
  useBindings(() => ({
    mode: ARCANA_BASE_MODE,
    // Above command-spine entry toggle (priority 1) so Enter confirms rejection.
    priority: PERMISSION_DECISION_LAYER_PRIORITY,
    // While the reply is in flight the rejection cannot be confirmed again.
    enabled: !props.busy,
    commands: [
      {
        name: "app.exit",
        title: "Cancel permission rejection",
        category: "Permission",
        run() {
          props.onCancel()
        },
      },
    ],
    bindings: [
      createPermissionRejectBindings({
        cancel: props.onCancel,
        confirm: () => props.onConfirm(input.plainText),
      })[0],
      ...tuiConfig.keybinds.get("app.exit"),
      createPermissionRejectBindings({
        cancel: props.onCancel,
        confirm: () => props.onConfirm(input.plainText),
      })[1],
    ],
  }))

  return (
    <GateFrame
      glyph="✗"
      color={theme.spineFail}
      header={
        <box flexDirection="column" gap={0} minWidth={0}>
          {/*
            The rail node draws the deny mark; this heading used to draw its own
            copy beside it (`× × REJECT PERMISSION`). And that copy — like the
            rail's — was a U+00D7 multiplication sign, which is neither of the
            app's marks: the spine denies and fails with `✗` (`spine-report.tsx`,
            `spine-entry.tsx`, the governance rows) and dismisses with `✕`. A
            third sign, re-typed, meant the deny gate was the one surface whose
            mark matched nothing else. The rail now carries `✗`, in `spineFail`.
          */}
          <text fg={theme.spineFail} wrapMode="word">
            REJECT PERMISSION
          </text>
          <text fg={theme.text} wrapMode="word">
            Tell arcana what to do differently
          </text>
        </box>
      }
      body={
        <box
          flexDirection={stacks() ? "column" : "row"}
          flexShrink={0}
          paddingTop={1}
          paddingLeft={1}
          paddingRight={2}
          paddingBottom={1}
          backgroundColor={theme.backgroundElement}
          justifyContent={stacks() ? "flex-start" : "space-between"}
          alignItems={stacks() ? "flex-start" : "center"}
          gap={1}
        >
          <textarea
            width="100%"
            ref={(val: TextareaRenderable) => {
              input = val
              val.traits = { status: "REJECT" }
            }}
            focused
            textColor={theme.text}
            focusedTextColor={theme.text}
            cursorColor={theme.primary}
            onSubmit={() => {
              if (props.busy) return
              props.onConfirm(input.plainText)
            }}
          />
          <box flexDirection={stacks() ? "column" : "row"} gap={stacks() ? 0 : Space.gapWide} flexShrink={0} minWidth={0}>
            <Show
              when={props.busy}
              fallback={
                <>
                  <text fg={theme.text}>
                    {REJECT_CONFIRM_KEY} <span style={{ fg: theme.spineContext }}>{REJECT_CONFIRM_ACTION}</span>
                  </text>
                  <text fg={theme.text}>
                    {REJECT_CANCEL_KEY} <span style={{ fg: theme.spineContext }}>{REJECT_CANCEL_ACTION}</span>
                  </text>
                </>
              }
            >
              <SigilSpinner color={theme.spineContext}>Sending…</SigilSpinner>
            </Show>
          </box>
        </box>
      }
    />
  )
}

function Prompt<const T extends Record<string, string>>(props: {
  title: string
  header?: JSX.Element
  body: JSX.Element
  options: T
  escapeKey?: keyof T
  fullscreen?: boolean
  /** A decision reply is in flight: bindings are gated and the footer reports it. */
  busy?: boolean
  onSelect: (option: keyof T) => void
}) {
  const { theme } = useTheme()
  const tuiConfig = useTuiConfig()
  const renderer = useRenderer()
  const dimensions = useTerminalSize(renderer)
  const kv = useKV()
  const density = createMemo(() => {
    const stored = kv.get("density")
    return isDensity(stored) ? stored : "cozy"
  })
  const keys = Object.keys(props.options) as Extract<keyof T, string>[]
  const [store, setStore] = createStore({
    selected: keys[0],
    expanded: false,
  })
  const fullscreenHint = useCommandShortcut("permission.prompt.fullscreen")

  useBindings(() => ({
    mode: ARCANA_BASE_MODE,
    // Above command-spine entry toggle (priority 1) so Enter confirms Decision,
    // including Always allow → Confirm, instead of expand/collapse on a message.
    priority: PERMISSION_DECISION_LAYER_PRIORITY,
    // In-flight replies cannot be confirmed twice (Enter is inert until settled).
    enabled: !props.busy,
    commands: [
      {
        name: "app.exit",
        title: "Reject permission",
        category: "Permission",
        run() {
          if (!props.escapeKey) return
          props.onSelect(props.escapeKey)
        },
      },
      {
        name: "permission.prompt.fullscreen",
        title: "Toggle permission fullscreen",
        category: "Permission",
        run() {
          if (!props.fullscreen) return
          setStore("expanded", (v) => !v)
        },
      },
    ],
    bindings: [
      ...createPermissionOptionBindings({
        keys,
        selected: () => store.selected,
        select: (next) => setStore("selected", next),
        submit: props.onSelect,
      }),
      ...(props.escapeKey
        ? [
            {
              key: "escape",
              desc: "Reject permission",
              group: "Permission",
              cmd: () => props.onSelect(props.escapeKey!),
            },
          ]
        : []),
      ...(props.escapeKey ? tuiConfig.keybinds.get("app.exit") : []),
      ...(props.fullscreen ? tuiConfig.keybinds.get("permission.prompt.fullscreen") : []),
    ],
  }))

  const hint = createMemo(() => (store.expanded ? "minimize" : "fullscreen"))
  useRenderer()

  /**
   * Whether the footer stacks instead of running its rows across the column.
   *
   * A gate answers one question and then leaves, so the rows it spends are the
   * most expensive whitespace in the app. The stack used to be a bare
   * `width < 80` breakpoint: at 60–79 columns the decision row needs 58 and the
   * hint row 52, and the gate grew five rows tall to hold two rows of content.
   * The rows are measured here instead, against the column the gate actually
   * has, and it stacks only when one of them genuinely does not fit.
   *
   * The hint row is measured whole even while a reply is in flight and it shows
   * a spinner instead: measuring what is on screen would un-stack the gate the
   * moment enter is pressed, which is a layout jump in the middle of a decision.
   */
  const stacks = () => {
    const budget = gateContentWidth(rendererWidth({ width: dimensions().width }), density(), store.expanded)
    if (budget === undefined) return false
    const options =
      keys.reduce(
        (sum, key) => sum + 2 * OPTION_PAD + OPTION_MARKER + Locale.displayWidth(props.options[key]),
        Space.gap * Math.max(0, keys.length - 1),
      )
    const decision = Locale.displayWidth(DECISION_LABEL) + Space.gap + options
    const hints = [
      Locale.displayWidth(HINT_SELECT),
      Locale.displayWidth(HINT_CONFIRM),
      ...(props.escapeKey ? [Locale.displayWidth(HINT_REJECT)] : []),
      ...(props.fullscreen ? [hintWidth(fullscreenHint(), hint())] : []),
    ]
    const hintRow = hints.reduce((sum, width) => sum + width, Space.gapWide * Math.max(0, hints.length - 1))
    return Math.max(decision, hintRow) > budget
  }

  const defaultHeader = (
    <box flexDirection="column" gap={0} minWidth={0}>
      <box flexDirection="row" gap={1} minWidth={0}>
        <text fg={theme.spineFix} flexShrink={0}>
          {Glyph.attention}
        </text>
        <text fg={theme.spineFix} wrapMode="word">
          {props.title.toUpperCase()}
        </text>
      </box>
    </box>
  )

  const footer = (
    <box flexDirection="column" gap={1} minWidth={0}>
      <box flexDirection={stacks() ? "column" : "row"} gap={1} flexShrink={0} minWidth={0}>
        <text fg={theme.spineContext} flexShrink={0}>
          {DECISION_LABEL}
        </text>
        <box flexDirection={stacks() ? "column" : "row"} gap={1} flexShrink={0} minWidth={0}>
          <For each={keys}>
            {(option) => {
              const selected = createMemo(() => option === store.selected)
              const reject = createMemo(
                () => String(option) === "reject" || props.options[option].toLowerCase().includes("reject"),
              )
              const color = createMemo(() => (reject() ? theme.spineFail : theme.spineFix))
              return (
                <box
                  paddingLeft={OPTION_PAD}
                  paddingRight={OPTION_PAD}
                  backgroundColor={selected() ? color() : theme.backgroundMenu}
                  onMouseOver={() => setStore("selected", option)}
                  onMouseUp={() => {
                    setStore("selected", option)
                    props.onSelect(option)
                  }}
                >
                  <text fg={selected() ? selectedForeground(theme, color()) : theme.text} wrapMode="word">
                    {selected() ? "▸ " : "  "}
                    {props.options[option]}
                  </text>
                </box>
              )
            }}
          </For>
        </box>
      </box>
      <box flexDirection={stacks() ? "column" : "row"} gap={stacks() ? 0 : Space.gapWide} flexShrink={0} minWidth={0}>
        <Show
          when={props.busy}
          fallback={
            <>
              <text fg={theme.spineContext}>{HINT_SELECT}</text>
              <text fg={theme.spineContext}>{HINT_CONFIRM}</text>
              <Show when={props.escapeKey}>
                <text fg={theme.spineContext}>{HINT_REJECT}</text>
              </Show>
              <Show when={props.fullscreen}>
                <text fg={theme.spineContext}>
                  {fullscreenHint()} {hint()}
                </text>
              </Show>
            </>
          }
        >
          <SigilSpinner color={theme.spineContext}>Sending…</SigilSpinner>
        </Show>
      </box>
    </box>
  )

  return (
    <GateFrame header={props.header ?? defaultHeader} body={props.body} footer={footer} expanded={store.expanded} />
  )
}

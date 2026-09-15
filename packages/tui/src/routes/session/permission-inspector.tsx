import { createMemo, For, onMount } from "solid-js"
import { TextAttributes } from "@opentui/core"
import type { PermissionRequest } from "@arcana/sdk/v2"
import { useTheme } from "../../context/theme"
import { useDialog } from "../../ui/dialog"

/**
 * Read-only inspector for a permission ACTION GATE entry.
 *
 * The `01◤ approve` spine row is a gate entry (`permission:<id>`), not a
 * durable approval record. `v` opens this inspector so the operator can see
 * the exact request (tool, permission, patterns, session) before deciding in
 * the gate with ←/→ + Enter.
 */
export function PermissionInspector(props: { request: PermissionRequest }) {
  const { theme } = useTheme()
  const dialog = useDialog()
  const request = createMemo(() => props.request)

  onMount(() => {
    dialog.setSize("large")
  })

  const rows = createMemo(() => permissionInspectorRows(request()))

  return (
    <box
      flexGrow={1}
      border={["top", "bottom", "left", "right"]}
      borderColor={theme.borderActive}
      backgroundColor={theme.background}
    >
      <box
        paddingLeft={2}
        paddingRight={2}
        backgroundColor={theme.backgroundPanel}
        border={["bottom"]}
        borderColor={theme.borderSubtle}
        flexDirection="row"
        gap={1}
        height={1}
      >
        <text fg={theme.warning} attributes={TextAttributes.BOLD}>△ PERMISSION INSPECTOR</text>
        <text fg={theme.textMuted}>{request().permission}</text>
        <box flexGrow={1} />
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>[esc] close</text>
      </box>

      <box
        flexDirection="column"
        paddingTop={1}
        paddingBottom={2}
        paddingLeft={2}
        paddingRight={2}
        gap={0}
      >
        <For each={rows()}>
          {([label, value]) => (
            <box flexDirection="row" minWidth={0}>
              <box width={18} flexShrink={0}>
                <text fg={theme.textMuted}>{label}</text>
              </box>
              <text fg={theme.text} wrapMode="word" flexGrow={1}>{value}</text>
            </box>
          )}
        </For>
      </box>
    </box>
  )
}

/** Pure row builder — untruncated exact request fields (F-28). */
export function permissionInspectorRows(request: PermissionRequest): Array<[string, string]> {
  const rows: Array<[string, string]> = [
    ["Request ID", request.id],
    ["Session ID", request.sessionID],
    ["Permission", request.permission],
    ["Patterns", request.patterns.length > 0 ? request.patterns.join(", ") : "*"],
  ]
  if (request.tool) {
    rows.push(["Message ID", request.tool.messageID])
    rows.push(["Call ID", request.tool.callID])
  }
  const description = request.metadata?.description
  if (typeof description === "string" && description) rows.push(["Description", description])
  const filepath = request.metadata?.filepath
  if (typeof filepath === "string" && filepath) rows.push(["File path", filepath])
  return rows
}

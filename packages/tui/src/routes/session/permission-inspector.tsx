import { createMemo, For, onMount } from "solid-js"
import { Space } from "../../ui/chrome"
import type { PermissionRequest } from "@arcana/sdk/v2"
import { Glyph } from "../../branding"
import { useTheme } from "../../context/theme"
import { useDialog } from "../../ui/dialog"
import { DialogPanelHeader } from "../../ui/dialog-chrome"

/** The report's label column — wide enough for the longest request field. */
const LABEL_WIDTH = 18

/**
 * Read-only inspector for a permission ACTION GATE entry.
 *
 * The `01◤ approve` spine row is a gate entry (`permission:<id>`), not a
 * durable approval record. `v` opens this inspector so the operator can see
 * the exact request (tool, permission, patterns, session) before deciding in
 * the gate with ←/→ + Enter.
 *
 * The panel draws no private frame: the card in `ui/dialog.tsx` is the one
 * frame, and `DialogPanelHeader` is its hairline (the same anatomy every other
 * dialog uses). A second four-sided border inside the card was the last
 * hand-rolled frame in the family.
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
    <box flexGrow={1} minWidth={0}>
      <DialogPanelHeader
        title="PERMISSION INSPECTOR"
        titleColor={theme.warning}
        mark={Glyph.attention}
        detail={request().permission}
        onClose={() => dialog.clear()}
      />

      <box
        flexDirection="column"
        paddingTop={Space.padY}
        paddingBottom={Space.padX}
        paddingLeft={Space.padX}
        paddingRight={Space.padX}
        gap={0}
      >
        <For each={rows()}>
          {([label, value]) => (
            <box flexDirection="row" minWidth={0}>
              <box width={LABEL_WIDTH} flexShrink={0}>
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

import { createMemo, createSignal, Show } from "solid-js"
import { Space } from "../ui/chrome"
import { useLocal } from "../context/local"
import { useSync } from "../context/sync"
import { map, pipe, entries, sortBy } from "remeda"
import { DialogSelect, type DialogSelectRef, type DialogSelectOption } from "../ui/dialog-select"
import { useTheme } from "../context/theme"
import { TextAttributes } from "@opentui/core"
import { useSDK } from "../context/sdk"
import { useToast } from "../ui/toast"
import { COPY, Glyph } from "../branding"
import type { McpStatus } from "@arcana/sdk/v2"

function Status(props: { enabled: boolean; loading: boolean }) {
  const { theme } = useTheme()
  if (props.loading) {
    return <span style={{ fg: theme.textMuted }}>⋯ Loading…</span>
  }
  if (props.enabled) {
    return <span style={{ fg: theme.success, attributes: TextAttributes.BOLD }}>✓ Enabled</span>
  }
  return <span style={{ fg: theme.textMuted }}>○ Disabled</span>
}

/**
 * One-line status label for an MCP server, plus optional detail lines.
 * Failure states carry their engine error in `details` (truncated by the
 * dialog) so the operator can act without opening the status dialog.
 */
export function mcpStatusLabel(name: string, status: McpStatus): { description: string; details: string[] } {
  switch (status.status) {
    case "connected":
      return { description: "Connected", details: [] }
    case "disabled":
      return { description: "Disabled", details: [] }
    case "failed":
      return { description: "Failed", details: [status.error] }
    case "needs_auth":
      return { description: `Needs authentication — run: arcana mcp auth ${name}`, details: [] }
    case "needs_client_registration":
      return { description: "Needs client registration", details: [status.error] }
    default:
      // Future-proof: a new engine status must not crash the dialog.
      return { description: "Unknown status", details: [] }
  }
}

export function DialogMcp() {
  const local = useLocal()
  const sync = useSync()
  const sdk = useSDK()
  const toast = useToast()
  const { theme } = useTheme()
  const [, setRef] = createSignal<DialogSelectRef<unknown>>()
  const [loading, setLoading] = createSignal<string | null>(null)

  const options = createMemo(() => {
    // Track sync data and loading state to trigger re-render when they change
    const mcpData = sync.data.mcp
    const loadingMcp = loading()

    return pipe(
      mcpData ?? {},
      entries(),
      sortBy(([name]) => name),
      map(([name, status]) => {
        const label = mcpStatusLabel(name, status)
        return {
          value: name,
          title: name,
          description: label.description,
          details: label.details.length > 0 ? label.details : undefined,
          footer: <Status enabled={local.mcp.isEnabled(name)} loading={loadingMcp === name} />,
          category: undefined,
        }
      }),
    )
  })

  const actions = createMemo(() => [
    {
      command: "dialog.mcp.toggle",
      title: "Toggle",
      onTrigger: async (option: DialogSelectOption<string>) => {
        // Prevent toggling while an operation is already in progress
        if (loading() !== null) return

        const name = option.value
        const wasConnected = local.mcp.isEnabled(name)
        setLoading(name)
        try {
          await local.mcp.toggle(name)
          // Refresh MCP status from server. A failed refresh must surface:
          // silently swallowing it leaves the row showing a stale state.
          const status = await sdk.client.mcp.status()
          if (!status.data) {
            toast.show({
              message: "Could not refresh MCP status — reopen this dialog to retry.",
              variant: "error",
            })
            return
          }
          sync.set("mcp", status.data)
          const next = status.data[name]?.status
          if (!wasConnected && next !== "connected") {
            toast.show({
              message: `Could not connect ${name} — check the MCP server configuration, then try again.`,
              variant: "error",
            })
          }
          if (wasConnected && next === "connected") {
            toast.show({
              message: `Could not disconnect ${name} — try again.`,
              variant: "error",
            })
          }
        } catch (error) {
          console.error("Failed to toggle MCP:", error)
          toast.show({
            message: `Could not toggle ${name} — try again.`,
            variant: "error",
          })
        } finally {
          setLoading(null)
        }
      },
    },
  ])

  return (
    <DialogSelect
      ref={setRef}
      title={`${Glyph.sigil} MCPs`}
      options={options()}
      actions={actions()}
      placeholder={COPY.dialog.filterServers}
      emptyView={
        <box paddingLeft={Space.insetWide} paddingRight={Space.insetWide} paddingTop={Space.padY}>
          <Show
            when={options().length === 0}
            fallback={<text fg={theme.textMuted}>{COPY.noEchoesFound}</text>}
          >
            <text fg={theme.textMuted} wrapMode="word">
              No MCP servers configured — add one with `arcana mcp add`, then reopen this dialog.
            </text>
          </Show>
        </box>
      }
      onSelect={(_option) => {
        // Don't close on select, only on escape
      }}
    />
  )
}

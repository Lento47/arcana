import { fileURLToPath } from "bun"
import { useTheme } from "../context/theme"
import { useDialog } from "../ui/dialog"
import { useSync } from "../context/sync"
import { For, Match, Switch, Show, createMemo } from "solid-js"
import { DialogColumn, DialogTitleRow } from "../ui/dialog-chrome"
import { COPY } from "../branding"

export type DialogStatusProps = {}

/** Numerals for counts, with the singular form when there is exactly one. */
function countLabel(count: number, singular: string) {
  return `${count} ${count === 1 ? singular : `${singular}s`}`
}

export function DialogStatus() {
  const sync = useSync()
  const { theme } = useTheme()
  const dialog = useDialog()

  const enabledFormatters = createMemo(() => sync.data.formatter.filter((f) => f.enabled))

  const plugins = createMemo(() => {
    const list = sync.data.config.plugin ?? []
    const result = list.map((item) => {
      const value = typeof item === "string" ? item : item[0]
      if (value.startsWith("file://")) {
        const path = fileURLToPath(value)
        const parts = path.split("/")
        const filename = parts.pop() || path
        if (!filename.includes(".")) return { name: filename }
        const basename = filename.split(".")[0]
        if (basename === "index") {
          const dirname = parts.pop()
          const name = dirname || basename
          return { name }
        }
        return { name: basename }
      }
      const index = value.lastIndexOf("@")
      if (index <= 0) return { name: value, version: "latest" }
      const name = value.substring(0, index)
      const version = value.substring(index + 1)
      return { name, version }
    })
    return result.toSorted((a, b) => a.name.localeCompare(b.name))
  })

  return (
    <DialogColumn padBottom>
      <DialogTitleRow title="Status" onClose={() => dialog.clear()} />
      <Show when={Object.keys(sync.data.mcp).length > 0} fallback={<text fg={theme.text}>{COPY.dialog.noMcpServers}</text>}>
        <box>
          <text fg={theme.text}>{countLabel(Object.keys(sync.data.mcp).length, "MCP Server")}</text>
          <For each={Object.entries(sync.data.mcp)}>
            {([key, item]) => (
              <box flexDirection="row" gap={1}>
                <text
                  flexShrink={0}
                  style={{
                    fg: (
                      {
                        connected: theme.success,
                        failed: theme.error,
                        disabled: theme.textMuted,
                        needs_auth: theme.warning,
                        needs_client_registration: theme.error,
                      } as Record<string, typeof theme.success>
                    )[item.status],
                  }}
                >
                  •
                </text>
                <text fg={theme.text} wrapMode="word">
                  <b>{key}</b>{" "}
                  <span style={{ fg: theme.textMuted }}>
                    <Switch fallback={item.status}>
                      <Match when={item.status === "connected"}>Connected</Match>
                      <Match when={item.status === "failed" && item}>{(val) => val().error}</Match>
                      <Match when={item.status === "disabled"}>Disabled in configuration</Match>
                      <Match when={(item.status as string) === "needs_auth"}>
                        Needs authentication (run: arcana mcp auth {key})
                      </Match>
                      <Match when={(item.status as string) === "needs_client_registration" && item}>
                        {(val) => (val() as { error: string }).error}
                      </Match>
                    </Switch>
                  </span>
                </text>
              </box>
            )}
          </For>
        </box>
      </Show>
      <Show
        when={sync.data.lsp.length > 0}
        fallback={<text fg={theme.text}>{COPY.dialog.noLspServers}</text>}
      >
        <box>
          <text fg={theme.text}>{countLabel(sync.data.lsp.length, "LSP Server")}</text>
          <For each={sync.data.lsp}>
            {(item) => (
              <box flexDirection="row" gap={1}>
                <text
                  flexShrink={0}
                  style={{
                    fg: {
                      connected: theme.success,
                      error: theme.error,
                    }[item.status],
                  }}
                >
                  •
                </text>
                <text fg={theme.text} wrapMode="word">
                  <b>{item.id}</b> <span style={{ fg: theme.textMuted }}>{item.root}</span>
                </text>
              </box>
            )}
          </For>
        </box>
      </Show>
      <Show when={enabledFormatters().length > 0} fallback={<text fg={theme.text}>{COPY.dialog.noFormatters}</text>}>
        <box>
          <text fg={theme.text}>{countLabel(enabledFormatters().length, "Formatter")}</text>
          <For each={enabledFormatters()}>
            {(item) => (
              <box flexDirection="row" gap={1}>
                <text
                  flexShrink={0}
                  style={{
                    fg: theme.success,
                  }}
                >
                  •
                </text>
                <text wrapMode="word" fg={theme.text}>
                  <b>{item.name}</b>
                </text>
              </box>
            )}
          </For>
        </box>
      </Show>
      <Show when={plugins().length > 0} fallback={<text fg={theme.text}>{COPY.dialog.noPlugins}</text>}>
        <box>
          <text fg={theme.text}>{countLabel(plugins().length, "Plugin")}</text>
          <For each={plugins()}>
            {(item) => (
              <box flexDirection="row" gap={1}>
                <text
                  flexShrink={0}
                  style={{
                    fg: theme.success,
                  }}
                >
                  •
                </text>
                <text wrapMode="word" fg={theme.text}>
                  <b>{item.name}</b>
                  {item.version && <span style={{ fg: theme.textMuted }}> @{item.version}</span>}
                </text>
              </box>
            )}
          </For>
        </box>
      </Show>
    </DialogColumn>
  )
}

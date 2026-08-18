import { createEffect, createMemo, createSignal, Show } from "solid-js"
import { map, pipe, sortBy } from "remeda"
import { useLocal } from "../context/local"
import { useKV } from "../context/kv"
import { useSDK } from "../context/sdk"
import { useTheme } from "../context/theme"
import { useToast } from "../ui/toast"
import { DialogSelect, type DialogSelectOption } from "../ui/dialog-select"
import { Glyph } from "../branding"
import { disabledToolCount, nextToolState, toolEnabled, toolsOverrideKey } from "../util/tools-override"
import { TextAttributes } from "@opentui/core"

type ToolItem = { id: string; description?: string }

function Status(props: { enabled: boolean }) {
  const { theme } = useTheme()
  if (props.enabled) {
    return <span style={{ fg: theme.success, attributes: TextAttributes.BOLD }}>✓ on</span>
  }
  return <span style={{ fg: theme.textMuted }}>○ off</span>
}

/**
 * Per-session tool toggles. Reads the current model's tool list from the
 * engine, shows each with a footer status, and stores explicit overrides in
 * KV (`tools_override_<sessionID>`). The composer attaches the override map
 * to the next prompt, and the engine persists it as session permissions —
 * so the LLM only sees the tools you keep. Toggling a tool back on restores
 * it even if the agent's default policy denies it (user-initiated, session
 * scope only).
 */
export function DialogTools(props: { sessionID: string }) {
  const local = useLocal()
  const kv = useKV()
  const sdk = useSDK()
  const toast = useToast()
  const [tools, setTools] = createSignal<ToolItem[]>([])
  const [loaded, setLoaded] = createSignal(false)
  const [loadingTool, setLoadingTool] = createSignal<string | null>(null)

  const overrides = createMemo<Record<string, boolean>>(
    () => kv.get(toolsOverrideKey(props.sessionID), {}) as Record<string, boolean>,
  )

  createEffect(() => {
    if (loaded()) return
    const model = local.model.current()
    if (!model) {
      setLoaded(true)
      return
    }
    void (async () => {
      try {
        const res = await sdk.client.tool.list({
          provider: model.providerID,
          model: model.modelID,
        })
        const data = res.data
        setTools(Array.isArray(data) ? data : [])
      } catch (error) {
        toast.show({
          message: error instanceof Error ? error.message : "Failed to load tools",
          variant: "error",
        })
      } finally {
        setLoaded(true)
      }
    })()
  })

  const options = createMemo(() =>
    pipe(
      tools(),
      sortBy((tool) => tool.id),
      map((tool) => ({
        value: tool.id,
        title: tool.id,
        description: tool.description ?? "",
        footer: <Status enabled={toolEnabled(overrides(), tool.id)} />,
        category: undefined,
      })),
    ),
  )

  const actions = createMemo(() => [
    {
      command: "dialog.tools.toggle",
      title: "toggle",
      onTrigger: async (option: DialogSelectOption<string>) => {
        if (loadingTool() !== null) return
        setLoadingTool(option.value)
        const current = overrides()
        const next = nextToolState(current, option.value)
        kv.set(toolsOverrideKey(props.sessionID), { ...current, [option.value]: next })
        setLoadingTool(null)
      },
    },
    {
      command: "dialog.tools.reset",
      title: "reset",
      onTrigger: () => {
        kv.set(toolsOverrideKey(props.sessionID), {})
        toast.show({ message: "Tool overrides cleared for this session", variant: "success" })
      },
    },
  ])

  const disabled = createMemo(() => disabledToolCount(overrides()))

  return (
    <DialogSelect
      title={`${Glyph.sigil} Tools`}
      footer={
        <Show when={loaded()} fallback={<span>Loading tool list…</span>}>
          <span>
            {tools().length} tools · {disabled()} disabled in this session — the LLM only sees enabled tools.
            Toggling a tool on restores it even if the agent policy denies it.
          </span>
        </Show>
      }
      options={options()}
      actions={actions()}
      onSelect={() => {
        // Toggle via action; escape closes.
      }}
    />
  )
}

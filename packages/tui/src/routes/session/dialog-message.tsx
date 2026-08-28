import { createMemo, createSignal, For, onMount } from "solid-js"
import { useSync } from "../../context/sync"
import { useSDK } from "../../context/sdk"
import { useRoute } from "../../context/route"
import { useClipboard } from "../../context/clipboard"
import { useTheme } from "../../context/theme"
import { useDialog } from "../../ui/dialog"
import { useTuiConfig } from "../../config"
import { useBindings } from "../../keymap"
import type { PromptInfo } from "../../component/prompt/history"
import { stripPromptPartIDs as strip } from "../../prompt/part"
import { Glyph } from "../../branding"
import { TextAttributes } from "@opentui/core"
import { promptTextFromPart } from "../../arcana/task"

type Act = {
  key: string
  label: string
  desc: string
  onSelect: () => void
}

export function DialogMessage(props: {
  messageID: string
  sessionID: string
  setPrompt?: (prompt: PromptInfo) => void
}) {
  const sync = useSync()
  const sdk = useSDK()
  const message = createMemo(() => sync.data.message[props.sessionID]?.find((x) => x.id === props.messageID))
  const route = useRoute()
  const clipboard = useClipboard()
  const { theme } = useTheme()
  const dialog = useDialog()
  const tuiConfig = useTuiConfig()
  const [focused, setFocused] = createSignal(0)

  const step = createMemo(() => {
    const msgs = sync.data.message[props.sessionID] ?? []
    const idx = msgs.findIndex((m) => m.id === props.messageID)
    return idx >= 0 ? String(idx).padStart(3, "0") : "000"
  })

  const clear = () => dialog.clear()

  const acts: Act[] = [
    {
      key: "unravel",
      label: "unravel",
      desc: "rewind before this point",
      onSelect() {
        const msg = message()
        if (!msg) return
        void sdk.client.session.revert({ sessionID: props.sessionID, messageID: msg.id })
        if (props.setPrompt) {
          const parts = sync.data.part[msg.id]
          const promptInfo = parts.reduce(
            (agg, part) => {
              if (part.type === "text") agg.input += promptTextFromPart(part)
              if (part.type === "file") agg.parts.push(strip(part))
              return agg
            },
            { input: "", parts: [] as PromptInfo["parts"] },
          )
          props.setPrompt(promptInfo)
        }
        clear()
      },
    },
    {
      key: "scission",
      label: "scission",
      desc: "split into alternate trace",
      async onSelect() {
        const result = await sdk.client.session.fork({ sessionID: props.sessionID, messageID: props.messageID })
        const msg = message()
        const prompt = msg
          ? sync.data.part[msg.id].reduce(
              (agg, part) => {
                if (part.type === "text") agg.input += promptTextFromPart(part)
                if (part.type === "file") agg.parts.push(part)
                return agg
              },
              { input: "", parts: [] as PromptInfo["parts"] },
            )
          : undefined
        route.navigate({ sessionID: result.data!.id, type: "session", prompt })
        clear()
      },
    },
    {
      key: "inscribe",
      label: "inscribe",
      desc: "capture visible output",
      async onSelect() {
        const msg = message()
        if (!msg) return
        const parts = sync.data.part[msg.id]
        const text = parts.reduce((agg, part) => {
          if (part.type === "text") agg += promptTextFromPart(part)
          return agg
        }, "")
        await clipboard.write?.(text)
        clear()
      },
    },
    {
      key: "bind",
      label: "bind",
      desc: "attach context",
      onSelect() {
        const msg = message()
        if (!msg || !props.setPrompt) return
        const parts = sync.data.part[msg.id]
        const promptInfo = parts.reduce(
          (agg, part) => {
            if (part.type === "text") agg.input += promptTextFromPart(part)
            if (part.type === "file") agg.parts.push(strip(part))
            return agg
          },
          { input: "", parts: [] as PromptInfo["parts"] },
        )
        props.setPrompt(promptInfo)
        clear()
      },
    },
    {
      key: "veil",
      label: "veil",
      desc: "redact exposed output",
      onSelect() {
        clear()
      },
    },
  ]

  const active = () => acts[focused()]!

  // Use existing dialog.select command names so default keybindings work (arrows, enter, etc.)
  useBindings(() => ({
    commands: [
      {
        name: "dialog.select.prev",
        title: "Previous act",
        category: "Acts",
        run: () => setFocused((f) => (f - 1 + acts.length) % acts.length),
      },
      {
        name: "dialog.select.next",
        title: "Next act",
        category: "Acts",
        run: () => setFocused((f) => (f + 1) % acts.length),
      },
      {
        name: "dialog.select.submit",
        title: "Seal act",
        category: "Acts",
        run: () => acts[focused()]?.onSelect(),
      },
    ],
    bindings: [
      ...tuiConfig.keybinds.gather("dialog.select", [
        "dialog.select.prev",
        "dialog.select.next",
        "dialog.select.submit",
      ]),
    ],
  }))

  // Ensure enough width for the full rail layout
  onMount(() => {
    dialog.setSize("xlarge")
  })

  return (
    <box
      width="100%"
      minWidth={0}
      minHeight={0}
      flexDirection="column"
      overflow="hidden"
      backgroundColor={theme.background}
    >
      {/* Header — compact single line */}
      <box
        width="100%"
        minWidth={0}
        paddingLeft={2} paddingRight={2}
        backgroundColor={theme.backgroundPanel}
        border={["bottom"]} borderColor={theme.borderSubtle}
        flexDirection="row" gap={1}
        height={1}
      >
        <text fg={theme.primary} attributes={TextAttributes.BOLD} flexShrink={0}>acts</text>
        <text fg={theme.textMuted} flexShrink={0}>scry…_</text>
        <box flexGrow={1} />
        <text fg={theme.textMuted} flexShrink={0} onMouseUp={clear}>[esc] close</text>
      </box>

      {/* Body: compact rail timeline */}
      <box width="100%" minWidth={0} minHeight={0} flexGrow={1} flexShrink={1}>
        <For each={acts}>
          {(act, i) => {
            const isFocused = () => i() === focused()
            const isFirst = () => i() === 0

            return (
              <box
                flexDirection="row"
                paddingLeft={3}
                paddingRight={2}
                minWidth={0}
                onMouseOver={() => setFocused(i())}
              >
                {/* Rail column — compact */}
                <box width={5} flexShrink={0} alignItems="center" justifyContent="center">
                  <text fg={isFirst() ? theme.textMuted : theme.borderSubtle}>
                    {isFirst() ? `[${step()}]` : "│"}
                  </text>
                </box>

                {/* Connector */}
                <box width={2} flexShrink={0} justifyContent="center" alignItems="center">
                  <text fg={isFocused() ? theme.accent : theme.borderSubtle}>
                    {isFocused() ? Glyph.diamond : (isFirst() ? "┬" : "├")}
                  </text>
                </box>

                {/* Action label + desc */}
                <box flexDirection="row" flexGrow={1} flexShrink={1} minWidth={0} gap={1}>
                  <text
                    flexShrink={0}
                    fg={isFocused() ? theme.primary : theme.text}
                    attributes={isFocused() ? TextAttributes.BOLD : undefined}
                  >
                    {isFocused() ? `━ ${act.label}` : `  ${act.label}`}
                  </text>
                  <text fg={theme.textMuted} flexGrow={1} flexShrink={1} wrapMode="word">
                    {act.desc}
                  </text>
                </box>
              </box>
            )
          }}
        </For>
      </box>

      {/* Detail + Footer — compact combined row */}
      <box
        width="100%"
        minWidth={0}
        paddingLeft={3} paddingRight={2} paddingTop={1} paddingBottom={1}
        backgroundColor={theme.backgroundPanel}
        border={["top"]} borderColor={theme.borderSubtle}
      >
        <box flexDirection="row" minWidth={0} gap={1}>
          <text fg={theme.accent} attributes={TextAttributes.BOLD} flexShrink={0}>{active().label.toUpperCase()}</text>
          <text fg={theme.textMuted} flexGrow={1} flexShrink={1} wrapMode="word">
            {active().desc} · message details below.
          </text>
        </box>
        <box flexDirection="row" flexWrap="wrap" gap={1} paddingTop={1}>
          <text fg={theme.primary}>enter</text>
          <text fg={theme.textMuted}>seal</text>
          <text fg={theme.textMuted}>·</text>
          <text fg={theme.primary}>tab/↓↑</text>
          <text fg={theme.textMuted}>navigate</text>
          <text fg={theme.textMuted}>·</text>
          <text fg={theme.primary}>esc</text>
          <text fg={theme.textMuted}>vanish</text>
        </box>
      </box>
    </box>
  )
}

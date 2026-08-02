import { createStore } from "solid-js/store"
import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { useRenderer, useTerminalDimensions, type JSX } from "@opentui/solid"
import type { RGBA, TextareaRenderable } from "@opentui/core"
import { selectedForeground, useTheme } from "../../context/theme"
import type { QuestionAnswer, QuestionRequest } from "@arcana/sdk/v2"
import { useSDK } from "../../context/sdk"
import { useTuiConfig } from "../../config"
import { useBindings, useOpencodeModeStack } from "../../keymap"
import { useToast } from "../../ui/toast"
import { errorMessage } from "../../util/error"
import { SpineGutterSpacer, spineLeadMetrics } from "../../shell/command-spine/spine-lead"
import { useSpineLayout } from "../../shell/command-spine/use-spine-layout"
import { SpineRail } from "../../shell/command-spine/spine-rail"

const QUESTION_MODE = "question"

export function QuestionPrompt(props: { request: QuestionRequest; directory?: string }) {
  const sdk = useSDK()
  const { theme } = useTheme()
  const renderer = useRenderer()
  // Only block clicks during an actual drag-selection (multi-char), not
  // after a simple click that creates a 1x1 selection footprint.
  function hasMeaningfulSelection(): boolean {
    const text = renderer.getSelection()?.getSelectedText()
    return text !== undefined && text.trim().length > 1
  }
  const dimensions = useTerminalDimensions()
  const tuiConfig = useTuiConfig()
  const modeStack = useOpencodeModeStack()
  const toast = useToast()

  const questions = createMemo(() => props.request.questions ?? [])
  const single = createMemo(() => questions().length === 1 && questions()[0]?.multiple !== true)
  const tabs = createMemo(() => (single() ? 1 : questions().length + 1)) // questions + confirm tab
  const [tabHover, setTabHover] = createSignal<number | "confirm" | null>(null)
  const [store, setStore] = createStore({
    tab: 0,
    answers: [] as QuestionAnswer[],
    custom: [] as string[],
    selected: 0,
    editing: false,
    busy: false,
  })

  let textarea: TextareaRenderable | undefined

  const question = createMemo(() => questions()[store.tab])
  const confirm = createMemo(() => !single() && store.tab === questions().length)
  const options = createMemo(() => question()?.options ?? [])
  const custom = createMemo(() => question()?.custom !== false)
  const other = createMemo(() => custom() && store.selected === options().length)
  const input = createMemo(() => store.custom[store.tab] ?? "")
  const multi = createMemo(() => question()?.multiple === true)
  const customPicked = createMemo(() => {
    const value = input()
    if (!value) return false
    return store.answers[store.tab]?.includes(value) ?? false
  })

  // Same lead metrics as SpinePrompt / SpineEntry so columns never drift.
  // Hysteresis (audit S4): shared tracked-prev hook — replaces the inline
  // _prevLayoutQ holder + `as any` (same dead-zone behavior, typed).
  const layout = useSpineLayout(() => dimensions().width)
  const metrics = createMemo(() => spineLeadMetrics(layout()))
  const narrow = createMemo(() => dimensions().width < 88)
  const optionIndexWidth = createMemo(() => Math.max(4, String(options().length + (custom() ? 1 : 0)).length + 3))

  function GateRow(props: { glyph?: string; color?: RGBA; children: JSX.Element; marginTop?: number }) {
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
        marginTop={props.marginTop}
      >
        <SpineGutterSpacer layout={layout()} />
        <SpineRail
          layout={layout()}
          glyph={props.glyph}
          color={props.color}
          kind={props.glyph === "?" ? "inspect" : undefined}
        />
        <box flexDirection="column" flexGrow={1} minWidth={0} flexShrink={1}>
          {props.children}
        </box>
      </box>
    )
  }

  function GateFrame(frame: { header: JSX.Element; body: JSX.Element; footer: JSX.Element }) {
    return (
      <box
        flexDirection="column"
        flexShrink={0}
        width="100%"
        paddingTop={1}
        paddingBottom={1}
      >
        <GateRow glyph="?" color={theme.spineInspect}>
          {frame.header}
        </GateRow>
        <GateRow marginTop={1}>
          {frame.body}
        </GateRow>
        <GateRow marginTop={1}>
          {frame.footer}
        </GateRow>
      </box>
    )
  }

  async function submit() {
    if (store.busy) return
    setStore("busy", true)
    try {
      const answers = questions().map((_, i) => store.answers[i] ?? [])
      await sdk.client.question.reply({
        requestID: props.request.id,
        directory: props.directory,
        answers,
      })
    } catch (error) {
      toast.show({
        title: "Question reply failed",
        message: errorMessage(error),
        variant: "error",
      })
    } finally {
      setStore("busy", false)
    }
  }

  async function reject() {
    if (store.busy) return
    setStore("busy", true)
    try {
      await sdk.client.question.reject({
        requestID: props.request.id,
        directory: props.directory,
      })
    } catch (error) {
      toast.show({
        title: "Question dismiss failed",
        message: errorMessage(error),
        variant: "error",
      })
    } finally {
      setStore("busy", false)
    }
  }

  async function pick(answer: string, isCustom: boolean = false) {
    if (store.busy) return
    const answers = [...store.answers]
    answers[store.tab] = [answer]
    setStore("answers", answers)
    if (isCustom) {
      const inputs = [...store.custom]
      inputs[store.tab] = answer
      setStore("custom", inputs)
    }
    if (single()) {
      setStore("busy", true)
      try {
        await sdk.client.question.reply({
          requestID: props.request.id,
          directory: props.directory,
          answers: [[answer]],
        })
      } catch (error) {
        toast.show({
          title: "Question reply failed",
          message: errorMessage(error),
          variant: "error",
        })
      } finally {
        setStore("busy", false)
      }
      return
    }
    setStore("tab", store.tab + 1)
    setStore("selected", 0)
  }

  function toggle(answer: string) {
    const existing = store.answers[store.tab] ?? []
    const next = [...existing]
    const index = next.indexOf(answer)
    if (index === -1) next.push(answer)
    if (index !== -1) next.splice(index, 1)
    const answers = [...store.answers]
    answers[store.tab] = next
    setStore("answers", answers)
  }

  function moveTo(index: number) {
    setStore("selected", index)
  }

  function selectTab(index: number) {
    setStore("tab", index)
    setStore("selected", 0)
  }

  function selectOption() {
    if (store.busy) return
    if (other()) {
      if (!multi()) {
        setStore("editing", true)
        return
      }
      const value = input()
      if (value && customPicked()) {
        toggle(value)
        return
      }
      setStore("editing", true)
      return
    }
    const opt = options()[store.selected]
    if (!opt) return
    if (multi()) {
      toggle(opt.label)
      return
    }
    void pick(opt.label)
  }

  onMount(() => {
    const popMode = modeStack.push(QUESTION_MODE)
    onCleanup(popMode)
  })

  useBindings(() => ({
    mode: QUESTION_MODE,
    enabled: store.editing && !confirm() && !store.busy,
    commands: [
      {
        name: "prompt.clear",
        title: "Clear answer edit",
        category: "Question",
        run() {
          const text = textarea?.plainText ?? ""
          if (!text) {
            setStore("editing", false)
            return
          }
          textarea?.setText("")
        },
      },
    ],
    bindings: [
      {
        key: "escape",
        desc: "Cancel answer edit",
        group: "Question",
        cmd: () => {
          setStore("editing", false)
        },
      },
      ...tuiConfig.keybinds.get("prompt.clear"),
      {
        key: "return",
        desc: "Submit answer edit",
        group: "Question",
        cmd: () => {
          const text = textarea?.plainText?.trim() ?? ""
          const prev = store.custom[store.tab]

          if (!text) {
            if (prev) {
              const inputs = [...store.custom]
              inputs[store.tab] = ""
              setStore("custom", inputs)

              const answers = [...store.answers]
              answers[store.tab] = (answers[store.tab] ?? []).filter((x) => x !== prev)
              setStore("answers", answers)
            }
            setStore("editing", false)
            return
          }

          if (multi()) {
            const inputs = [...store.custom]
            inputs[store.tab] = text
            setStore("custom", inputs)

            const existing = store.answers[store.tab] ?? []
            const next = [...existing]
            if (prev) {
              const index = next.indexOf(prev)
              if (index !== -1) next.splice(index, 1)
            }
            if (!next.includes(text)) next.push(text)
            const answers = [...store.answers]
            answers[store.tab] = next
            setStore("answers", answers)
            setStore("editing", false)
            return
          }

          void pick(text, true)
          setStore("editing", false)
        },
      },
    ],
  }))

  useBindings(() => {
    const opts = options()
    const total = opts.length + (custom() ? 1 : 0)
    const max = Math.min(total, 9)

    return {
      mode: QUESTION_MODE,
      enabled: !store.editing && !store.busy,
      commands: [
        {
          name: "app.exit",
          title: "Reject question",
          category: "Question",
          run() {
            void reject()
          },
        },
      ],
      bindings: [
        {
          key: "left",
          desc: "Previous question",
          group: "Question",
          cmd: () => selectTab((store.tab - 1 + tabs()) % tabs()),
        },
        {
          key: "h",
          desc: "Previous question",
          group: "Question",
          cmd: () => selectTab((store.tab - 1 + tabs()) % tabs()),
        },
        { key: "right", desc: "Next question", group: "Question", cmd: () => selectTab((store.tab + 1) % tabs()) },
        { key: "l", desc: "Next question", group: "Question", cmd: () => selectTab((store.tab + 1) % tabs()) },
        {
          key: "tab",
          desc: "Next question",
          group: "Question",
          cmd: ({ event }: { event: { shift: boolean } }) => {
            selectTab((store.tab + (event.shift ? -1 : 1) + tabs()) % tabs())
          },
        },
        ...(confirm()
          ? [
              { key: "return", desc: "Submit answer", group: "Question", cmd: () => void submit() },
              { key: "escape", desc: "Reject question", group: "Question", cmd: () => void reject() },
              ...tuiConfig.keybinds.get("app.exit"),
            ]
          : [
              ...Array.from({ length: max }, (_, index) => ({
                key: String(index + 1),
                desc: `Select answer ${index + 1}`,
                group: "Question",
                cmd: () => {
                  moveTo(index)
                  selectOption()
                },
              })),
              {
                key: "up",
                desc: "Previous answer",
                group: "Question",
                cmd: () => moveTo((store.selected - 1 + total) % total),
              },
              {
                key: "k",
                desc: "Previous answer",
                group: "Question",
                cmd: () => moveTo((store.selected - 1 + total) % total),
              },
              { key: "down", desc: "Next answer", group: "Question", cmd: () => moveTo((store.selected + 1) % total) },
              { key: "j", desc: "Next answer", group: "Question", cmd: () => moveTo((store.selected + 1) % total) },
              { key: "return", desc: "Select answer", group: "Question", cmd: () => selectOption() },
              { key: "space", desc: "Select answer", group: "Question", cmd: () => selectOption() },
              { key: "escape", desc: "Reject question", group: "Question", cmd: () => void reject() },
              ...tuiConfig.keybinds.get("app.exit"),
            ]),
      ],
    }
  })

  const header = (
    <box flexDirection="column" minWidth={0}>
      <box flexDirection="row" minWidth={0} alignItems="center">
        <text fg={theme.spineInspect} flexShrink={0}>QUESTION</text>
        <Show when={!single()}>
          <text fg={theme.textMuted} flexShrink={0}>
            {"  "}
            {confirm() ? "review" : `${store.tab + 1}/${questions().length}`}
          </text>
        </Show>
        <Show when={store.busy}>
          <text fg={theme.textMuted} flexShrink={0}>{"  ·  submitting…"}</text>
        </Show>
      </box>
      <Show when={!single()}>
        <box flexDirection={narrow() ? "column" : "row"} marginTop={1} gap={narrow() ? 0 : 1} minWidth={0}>
          <For each={questions()}>
            {(q, index) => {
              const isActive = () => index() === store.tab
              const isAnswered = () => (store.answers[index()]?.length ?? 0) > 0
              return (
                <box
                  paddingLeft={1}
                  paddingRight={1}
                  marginRight={narrow() ? 0 : 1}
                  marginBottom={narrow() ? 1 : 0}
                  minWidth={0}
                  backgroundColor={
                    isActive()
                      ? theme.accent
                      : tabHover() === index()
                        ? theme.backgroundElement
                        : theme.backgroundMenu
                  }
                  onMouseOver={() => setTabHover(index())}
                  onMouseOut={() => setTabHover(null)}
                  onMouseUp={() => {
                    if (hasMeaningfulSelection()) return
                    selectTab(index())
                  }}
                >
                  <text
                    fg={
                      isActive()
                        ? selectedForeground(theme, theme.accent)
                        : isAnswered()
                          ? theme.text
                          : theme.textMuted
                    }
                    wrapMode="word"
                  >
                    {q.header || `Q${index() + 1}`}
                  </text>
                </box>
              )
            }}
          </For>
          <box
            paddingLeft={1}
            paddingRight={1}
            minWidth={0}
            backgroundColor={
              confirm() ? theme.accent : tabHover() === "confirm" ? theme.backgroundElement : theme.backgroundMenu
            }
            onMouseOver={() => setTabHover("confirm")}
            onMouseOut={() => setTabHover(null)}
            onMouseUp={() => {
              if (hasMeaningfulSelection()) return
              selectTab(questions().length)
            }}
          >
            <text fg={confirm() ? selectedForeground(theme, theme.accent) : theme.textMuted}>Review</text>
          </box>
        </box>
      </Show>
    </box>
  )

  const body = (
    <box flexDirection="column" minWidth={0}>
      <Show when={!confirm()}>
        <box flexDirection="column" minWidth={0}>
          <text fg={theme.text} wrapMode="word">
            {question()?.question ?? "Choose an option"}
            {multi() ? " (select all that apply)" : ""}
          </text>
          <box flexDirection="column" marginTop={1} minWidth={0}>
            <For each={options()}>
              {(opt, i) => {
                const active = () => i() === store.selected
                const picked = () => store.answers[store.tab]?.includes(opt.label) ?? false
                return (
                  <box
                    marginBottom={1}
                    minWidth={0}
                    onMouseOver={() => moveTo(i())}
                    onMouseDown={() => moveTo(i())}
                    onMouseUp={() => {
                      if (hasMeaningfulSelection()) return
                      selectOption()
                    }}
                  >
                    <box flexDirection="row" minWidth={0}>
                      <box
                        backgroundColor={active() ? theme.backgroundElement : undefined}
                        paddingRight={1}
                        width={optionIndexWidth()}
                        flexShrink={0}
                      >
                        <text fg={active() ? selectedForeground(theme, theme.backgroundElement) : theme.spineContext}>
                          {`${i() + 1}.`}
                        </text>
                      </box>
                      <box backgroundColor={active() ? theme.backgroundElement : undefined} flexGrow={1} minWidth={0} flexShrink={1}>
                        <text
                          fg={
                            active()
                              ? selectedForeground(theme, theme.backgroundElement)
                              : picked()
                                ? theme.success
                                : theme.text
                          }
                          wrapMode="word"
                        >
                          {multi() ? `[${picked() ? "✓" : " "}] ${opt.label}` : opt.label}
                        </text>
                      </box>
                      <Show when={!multi()}>
                        <text fg={theme.success} flexShrink={0}>{picked() ? " ✓" : ""}</text>
                      </Show>
                    </box>
                    <Show when={opt.description}>
                      <box paddingLeft={optionIndexWidth()} minWidth={0}>
                        <text fg={theme.spineContext} wrapMode="word">
                          {opt.description}
                        </text>
                      </box>
                    </Show>
                  </box>
                )
              }}
            </For>
            <Show when={custom()}>
              <box
                minWidth={0}
                onMouseOver={() => moveTo(options().length)}
                onMouseDown={() => moveTo(options().length)}
                onMouseUp={() => {
                  if (hasMeaningfulSelection()) return
                  selectOption()
                }}
              >
                <box flexDirection="row" minWidth={0}>
                  <box
                    backgroundColor={other() ? theme.backgroundElement : undefined}
                    paddingRight={1}
                    width={optionIndexWidth()}
                    flexShrink={0}
                  >
                    <text fg={other() ? selectedForeground(theme, theme.backgroundElement) : theme.spineContext}>
                      {`${options().length + 1}.`}
                    </text>
                  </box>
                  <box backgroundColor={other() ? theme.backgroundElement : undefined} flexGrow={1} minWidth={0} flexShrink={1}>
                    <text
                      fg={
                        other()
                          ? selectedForeground(theme, theme.backgroundElement)
                          : customPicked()
                            ? theme.success
                            : theme.text
                      }
                    >
                      {multi() ? `[${customPicked() ? "✓" : " "}] Type your own answer` : "Type your own answer"}
                    </text>
                  </box>
                  <Show when={!multi()}>
                    <text fg={theme.success} flexShrink={0}>{customPicked() ? " ✓" : ""}</text>
                  </Show>
                </box>
                <Show when={store.editing}>
                  <box paddingLeft={optionIndexWidth()} marginTop={1} minWidth={0}>
                    <textarea
                      ref={(val: TextareaRenderable) => {
                        textarea = val
                        val.traits = { status: "ANSWER" }
                        queueMicrotask(() => {
                          if (val.isDestroyed) return
                          val.focus()
                          val.gotoLineEnd()
                        })
                      }}
                      initialValue={input()}
                      placeholder="Type your own answer"
                      placeholderColor={theme.spineContext}
                      width="100%"
                      minHeight={1}
                      maxHeight={6}
                      textColor={theme.text}
                      focusedTextColor={theme.text}
                      cursorColor={theme.primary}
                      focusedBackgroundColor={theme.background}
                    />
                  </box>
                </Show>
                <Show when={!store.editing && input()}>
                  <box paddingLeft={optionIndexWidth()} minWidth={0}>
                    <text fg={theme.spineContext} wrapMode="word">{input()}</text>
                  </box>
                </Show>
              </box>
            </Show>
          </box>
        </box>
      </Show>

      <Show when={confirm() && !single()}>
        <box flexDirection="column" minWidth={0}>
          <text fg={theme.text}>Review your answers</text>
          <For each={questions()}>
            {(q, index) => {
              const value = () => store.answers[index()]?.join(", ") ?? ""
              const answered = () => Boolean(value())
              return (
                <box marginTop={1} minWidth={0}>
                  <text wrapMode="word">
                    <span style={{ fg: theme.spineContext }}>{q.header || `Q${index() + 1}`}:</span>{" "}
                    <span style={{ fg: answered() ? theme.text : theme.error }}>
                      {answered() ? value() : "(not answered)"}
                    </span>
                  </text>
                </box>
              )
            }}
          </For>
        </box>
      </Show>
    </box>
  )

  const footer = (
    <box flexDirection={narrow() ? "column" : "row"} flexShrink={0} gap={narrow() ? 0 : 2} minWidth={0}>
      <box flexDirection="row" gap={2} flexShrink={0}>
        <Show when={!single()}>
          <text fg={theme.spineContext}>tab steps</text>
        </Show>
        <Show when={!confirm()}>
          <text fg={theme.spineContext}>↑↓ select</text>
        </Show>
      </box>
      <box flexDirection="row" gap={2} flexShrink={0}>
        <text fg={theme.spineContext}>
          enter {confirm() ? "submit" : multi() ? "toggle" : single() ? "submit" : "next"}
        </text>
        <text fg={theme.spineContext}>esc dismiss</text>
      </box>
    </box>
  )

  return <GateFrame header={header} body={body} footer={footer} />
}

import { type ScrollBoxRenderable, type TextareaRenderable } from "@opentui/core"
import { useRenderer, useTerminalDimensions } from "@opentui/solid"
import type { QuestionAnswer, QuestionRequest } from "@arcana/sdk/v2"
import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js"
import { useTuiConfig } from "../../config"
import { useSDK } from "../../context/sdk"
import { selectedForeground, useTheme } from "../../context/theme"
import { useBindings, useOpencodeModeStack } from "../../keymap"
import { SpineGutterSpacer, spineLeadMetrics } from "../../shell/command-spine/spine-lead"
import { SpineRail } from "../../shell/command-spine/spine-rail"
import { useSpineLayout } from "../../shell/command-spine/use-spine-layout"
import { useToast } from "../../ui/toast"
import { errorMessage } from "../../util/error"

const QUESTION_MODE = "question"

export function QuestionPrompt(props: { request: QuestionRequest; directory?: string }) {
  const sdk = useSDK()
  const { theme } = useTheme()
  const renderer = useRenderer()
  const dimensions = useTerminalDimensions()
  const tuiConfig = useTuiConfig()
  const modeStack = useOpencodeModeStack()
  const toast = useToast()
  const questions = createMemo(() => props.request.questions ?? [])
  const layout = useSpineLayout(() => dimensions().width)
  const metrics = createMemo(() => spineLeadMetrics(layout()))
  const [answers, setAnswers] = createSignal<QuestionAnswer[]>(questions().map(() => []))
  const [customValues, setCustomValues] = createSignal<string[]>(questions().map(() => ""))
  const [questionIndex, setQuestionIndex] = createSignal(0)
  const [optionIndex, setOptionIndex] = createSignal(0)
  const [submitFocused, setSubmitFocused] = createSignal(false)
  const [editingQuestion, setEditingQuestion] = createSignal<number | undefined>()
  const [busy, setBusy] = createSignal(false)
  let textarea: TextareaRenderable | undefined
  let scroller: ScrollBoxRenderable | undefined

  const answered = (index: number) => (answers()[index]?.length ?? 0) > 0
  const unanswered = createMemo(() => questions().flatMap((_, index) => answered(index) ? [] : [index + 1]))
  const complete = createMemo(() => questions().length > 0 && unanswered().length === 0)
  const bodyHeight = createMemo(() => Math.max(6, Math.floor(dimensions().height * 0.6) - 5))

  function hasMeaningfulSelection() {
    return (renderer.getSelection()?.getSelectedText()?.trim().length ?? 0) > 1
  }

  function focusQuestion(index: number, selected = 0) {
    const count = questions().length
    if (count === 0) return
    const next = (index + count) % count
    setQuestionIndex(next)
    setOptionIndex(selected)
    setSubmitFocused(false)
    queueMicrotask(() => scroller?.scrollChildIntoView(`question-${next}`))
  }

  function moveField(direction: 1 | -1) {
    if (questions().length === 0) return
    if (direction > 0) {
      if (submitFocused()) return focusQuestion(0)
      if (questionIndex() === questions().length - 1) {
        setSubmitFocused(true)
        return
      }
      focusQuestion(questionIndex() + 1)
      return
    }
    if (submitFocused()) return focusQuestion(questions().length - 1)
    if (questionIndex() === 0) {
      setSubmitFocused(true)
      return
    }
    focusQuestion(questionIndex() - 1)
  }

  function setQuestionAnswers(index: number, value: QuestionAnswer) {
    setAnswers((current) => {
      const next = [...current]
      next[index] = value
      return next
    })
  }

  function choose(index: number, selected: number) {
    const question = questions()[index]
    if (!question || busy()) return
    const options = question.options ?? []
    if (selected === options.length && question.custom !== false) {
      setEditingQuestion(index)
      queueMicrotask(() => textarea?.focus())
      return
    }
    const option = options[selected]
    if (!option) return
    if (question.multiple === true) {
      const current = answers()[index] ?? []
      setQuestionAnswers(index, current.includes(option.label)
        ? current.filter((value) => value !== option.label)
        : [...current, option.label])
      return
    }
    setQuestionAnswers(index, [option.label])
  }

  function commitCustom() {
    const index = editingQuestion()
    if (index === undefined) return
    const question = questions()[index]
    const value = textarea?.plainText?.trim() ?? ""
    const previous = customValues()[index] ?? ""
    setCustomValues((current) => {
      const next = [...current]
      next[index] = value
      return next
    })
    const current = answers()[index] ?? []
    const withoutPrevious = previous ? current.filter((answer) => answer !== previous) : current
    setQuestionAnswers(index, value
      ? question?.multiple === true ? [...withoutPrevious, value] : [value]
      : withoutPrevious)
    setEditingQuestion(undefined)
  }

  async function submit() {
    if (busy() || !complete()) return
    setBusy(true)
    try {
      await sdk.client.question.reply({
        requestID: props.request.id,
        directory: props.directory,
        answers: questions().map((_, index) => answers()[index] ?? []),
      })
    } catch (error) {
      toast.show({ title: "Question reply failed", message: errorMessage(error), variant: "error" })
    } finally {
      setBusy(false)
    }
  }

  async function reject() {
    if (busy()) return
    setBusy(true)
    try {
      await sdk.client.question.reject({ requestID: props.request.id, directory: props.directory })
    } catch (error) {
      toast.show({ title: "Question dismiss failed", message: errorMessage(error), variant: "error" })
    } finally {
      setBusy(false)
    }
  }

  onMount(() => {
    const popMode = modeStack.push(QUESTION_MODE)
    onCleanup(popMode)
  })

  useBindings(() => ({
    mode: QUESTION_MODE,
    enabled: editingQuestion() !== undefined && !busy(),
    bindings: [
      { key: "escape", desc: "Cancel answer edit", group: "Question", cmd: () => setEditingQuestion(undefined) },
      { key: "return", desc: "Save custom answer", group: "Question", cmd: commitCustom },
      ...tuiConfig.keybinds.get("prompt.clear").map((binding) => ({ ...binding, cmd: () => textarea?.setText("") })),
    ],
  }))

  useBindings(() => {
    const question = questions()[questionIndex()]
    const total = (question?.options?.length ?? 0) + (question?.custom !== false ? 1 : 0)
    return {
      mode: QUESTION_MODE,
      enabled: editingQuestion() === undefined && !busy(),
      commands: [{ name: "app.exit", title: "Dismiss questions", category: "Question", run: () => void reject() }],
      bindings: [
        { key: "escape", desc: "Dismiss questions", group: "Question", cmd: () => void reject() },
        { key: "tab", desc: "Next question", group: "Question", cmd: () => moveField(1) },
        { key: "shift+tab", desc: "Previous question", group: "Question", cmd: () => moveField(-1) },
        { key: "up,k", desc: "Previous answer", group: "Question", cmd: () => {
          if (submitFocused()) return focusQuestion(questions().length - 1)
          if (total > 0) setOptionIndex((optionIndex() - 1 + total) % total)
        } },
        { key: "down,j", desc: "Next answer", group: "Question", cmd: () => {
          if (submitFocused()) return focusQuestion(0)
          if (total > 0) setOptionIndex((optionIndex() + 1) % total)
        } },
        { key: "return", desc: "Select or submit", group: "Question", cmd: () => {
          if (submitFocused()) void submit()
          else choose(questionIndex(), optionIndex())
        } },
        { key: "space", desc: "Select answer", group: "Question", cmd: () => {
          if (!submitFocused()) choose(questionIndex(), optionIndex())
        } },
        ...Array.from({ length: Math.min(total, 9) }, (_, index) => ({
          key: String(index + 1),
          desc: `Select answer ${index + 1}`,
          group: "Question",
          cmd: () => { setOptionIndex(index); choose(questionIndex(), index) },
        })),
        ...tuiConfig.keybinds.get("app.exit"),
      ],
    }
  })

  return (
    <box flexDirection="column" flexShrink={0} width="100%" paddingTop={1} paddingBottom={1}>
      <box flexDirection="row" width="100%" paddingLeft={metrics().pad} paddingRight={metrics().pad}>
        <SpineGutterSpacer layout={layout()} />
        <SpineRail layout={layout()} glyph="?" color={theme.spineInspect} kind="inspect" />
        <box flexDirection="column" flexGrow={1} minWidth={0}>
          <box flexDirection="row" justifyContent="space-between" minWidth={0}>
            <text fg={theme.spineInspect}>QUESTIONS</text>
            <text fg={complete() ? theme.success : theme.textMuted}>
              {questions().length - unanswered().length}/{questions().length} answered{busy() ? " · submitting…" : ""}
            </text>
          </box>
          <Show when={questions().length === 0}>
            <text fg={theme.error}>This request contains no questions. Press Esc to dismiss it.</text>
          </Show>
        </box>
      </box>

      <box flexDirection="row" width="100%" paddingLeft={metrics().pad} paddingRight={metrics().pad} marginTop={1}>
        <SpineGutterSpacer layout={layout()} />
        <SpineRail layout={layout()} />
        <scrollbox
          ref={(value) => { scroller = value as unknown as ScrollBoxRenderable }}
          height={bodyHeight()}
          flexGrow={1}
          minWidth={0}
          viewportOptions={{ paddingRight: 1 }}
          verticalScrollbarOptions={{
            visible: true,
            trackOptions: { backgroundColor: theme.backgroundElement, foregroundColor: theme.border },
          }}
        >
          <For each={questions()}>
            {(question, index) => {
              const options = () => question.options ?? []
              const focused = () => !submitFocused() && questionIndex() === index()
              const selected = (option: number) => answers()[index()]?.includes(options()[option]?.label ?? "") ?? false
              return (
                <box id={`question-${index()}`} flexDirection="column" marginBottom={1} minWidth={0}>
                  <box flexDirection="row" minWidth={0}>
                    <text fg={focused() ? theme.accent : answered(index()) ? theme.success : theme.textMuted}>
                      {answered(index()) ? "✓" : `${index() + 1}.`}
                    </text>
                    <text fg={theme.text} wrapMode="word"> {question.header ? `${question.header} — ` : ""}{question.question}</text>
                  </box>
                  <Show when={question.multiple === true}>
                    <text fg={theme.textMuted}>  Select all that apply</text>
                  </Show>
                  <Show when={options().length === 0 && question.custom === false}>
                    <text fg={theme.error}>  No answer options were supplied.</text>
                  </Show>
                  <For each={options()}>
                    {(option, optionNumber) => {
                      const active = () => focused() && optionIndex() === optionNumber()
                      return (
                        <box
                          flexDirection="column"
                          marginLeft={2}
                          paddingLeft={1}
                          backgroundColor={active() ? theme.backgroundElement : undefined}
                          onMouseOver={() => focusQuestion(index(), optionNumber())}
                          onMouseUp={() => { if (!hasMeaningfulSelection()) choose(index(), optionNumber()) }}
                        >
                          <text fg={active() ? selectedForeground(theme, theme.backgroundElement) : selected(optionNumber()) ? theme.success : theme.text} wrapMode="word">
                            {question.multiple === true ? `[${selected(optionNumber()) ? "✓" : " "}] ` : selected(optionNumber()) ? "● " : "○ "}{option.label}
                          </text>
                          <Show when={option.description}>
                            <text fg={theme.textMuted} wrapMode="word">  {option.description}</text>
                          </Show>
                        </box>
                      )
                    }}
                  </For>
                  <Show when={question.custom !== false}>
                    <box
                      marginLeft={2}
                      paddingLeft={1}
                      backgroundColor={focused() && optionIndex() === options().length ? theme.backgroundElement : undefined}
                      onMouseOver={() => focusQuestion(index(), options().length)}
                      onMouseUp={() => { if (!hasMeaningfulSelection()) choose(index(), options().length) }}
                    >
                      <Show when={editingQuestion() !== index()} fallback={
                        <textarea
                          ref={(value) => { textarea = value as unknown as TextareaRenderable }}
                          height={3}
                          initialValue={customValues()[index()] ?? ""}
                          placeholder="Type a custom answer"
                          focused={true}
                        />
                      }>
                        <text fg={(customValues()[index()] ?? "") ? theme.success : theme.textMuted} wrapMode="word">
                          {(customValues()[index()] ?? "") ? `Custom: ${customValues()[index()]}` : "Custom answer…"}
                        </text>
                      </Show>
                    </box>
                  </Show>
                </box>
              )
            }}
          </For>
        </scrollbox>
      </box>

      <box flexDirection="row" width="100%" paddingLeft={metrics().pad} paddingRight={metrics().pad} marginTop={1}>
        <SpineGutterSpacer layout={layout()} />
        <SpineRail layout={layout()} />
        <box flexDirection="row" flexGrow={1} justifyContent="space-between" minWidth={0}>
          <text fg={unanswered().length > 0 ? theme.warning : theme.textMuted} wrapMode="word">
            {unanswered().length > 0 ? `Required: answer ${unanswered().join(", ")}` : "tab/shift+tab navigate · esc dismiss"}
          </text>
          <box
            paddingLeft={1}
            paddingRight={1}
            backgroundColor={submitFocused() ? theme.accent : complete() ? theme.backgroundElement : theme.backgroundMenu}
            onMouseUp={() => { if (!hasMeaningfulSelection()) void submit() }}
          >
            <text fg={submitFocused() ? selectedForeground(theme, theme.accent) : complete() ? theme.text : theme.textMuted}>
              {busy() ? "Submitting…" : complete() ? "Submit" : "Submit (incomplete)"}
            </text>
          </box>
        </box>
      </box>
    </box>
  )
}

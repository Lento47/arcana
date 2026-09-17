import { type ScrollBoxRenderable, type TextareaRenderable } from "@opentui/core"
import { useRenderer } from "@opentui/solid"
import { useTerminalSize } from "../../util/terminal-size"
import type { QuestionAnswer, QuestionRequest } from "@arcana/sdk/v2"
import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js"
import { useTuiConfig } from "../../config"
import { COPY } from "../../branding"
import { useSync } from "../../context/sync"
import { useSDK } from "../../context/sdk"
import { selectedForeground, useTheme } from "../../context/theme"
import { useBindings, useOpencodeModeStack } from "../../keymap"
import { SpineGutterSpacer, spineLeadMetrics } from "../../shell/command-spine/spine-lead"
import { SpineRail } from "../../shell/command-spine/spine-rail"
import { useSpineLayout } from "../../shell/command-spine/use-spine-layout"
import { useToast } from "../../ui/toast"
import { isUnknownRequestNotFoundError } from "../../util/api-error"
import { errorMessage } from "../../util/error"
import { Locale } from "../../util/locale"
import { Space } from "../../ui/chrome"
import { useKV } from "../../context/kv"
import { rendererWidth, sessionContentWidth } from "../../util/geometry"
import { isDensity, type Density } from "../../shell/command-spine/spine-types"

const QUESTION_MODE = "question"
const ESC_ARM_MS = 2_000

/**
 * The gate's fixed strings, at module scope, so the row that prints them and the
 * measurement that decides whether they fit cannot drift apart.
 */
const HINT_SUBMIT = "enter submit · tab navigate"
const HINT_ESC_ARMED = "Esc again to discard this form"
const HINT_REQUIRED = (list: string) => `Required: answer ${list} · enter jumps to it`
const SUBMIT_BUSY = "Submitting…"
const SUBMIT_READY = "Submit"
const SUBMIT_INCOMPLETE = "Submit (incomplete)"
/** The button's own horizontal padding, which its label sits inside. */
const SUBMIT_PAD = 2
/**
 * The button measured at its widest label, so its cost is one number the fit
 * check can charge: the label changes with the form's completeness, and a row
 * that restacks as the operator answers is worse than one that holds still.
 */
const SUBMIT_WIDTH =
  SUBMIT_PAD + Math.max(...[SUBMIT_BUSY, SUBMIT_READY, SUBMIT_INCOMPLETE].map((label) => Locale.displayWidth(label)))

/** The gate's own lead — the frame already insets the spine, so `pad` is 0. */
function questionLead(pad: number, gutter: number, rail: number) {
  return pad * 2 + gutter + rail
}

/**
 * The columns this gate's rows actually have, or `undefined` when the renderer
 * has not been laid out yet.
 *
 * Unmeasured is not narrow: an undefined budget must never be read as "no room"
 * and stack a row that would have fit. Same rule as `rendererWidth` states.
 */
function questionContentWidth(
  lead: number,
  termWidth: number | undefined,
  density: Density,
): number | undefined {
  if (termWidth === undefined) return undefined
  return sessionContentWidth(termWidth, density) - lead
}

export function QuestionPrompt(props: { request: QuestionRequest; directory?: string }) {
  const sdk = useSDK()
  const sync = useSync()
  const { theme } = useTheme()
  const renderer = useRenderer()
  const dimensions = useTerminalSize(useRenderer())
  const tuiConfig = useTuiConfig()
  const modeStack = useOpencodeModeStack()
  const toast = useToast()
  const questions = createMemo(() => props.request.questions ?? [])
  const layout = useSpineLayout(() => dimensions().width)
  const metrics = createMemo(() => spineLeadMetrics(layout()))
  const kv = useKV()
  const density = createMemo(() => {
    const stored = kv.get("density")
    return isDensity(stored) ? stored : "cozy"
  })
  const [answers, setAnswers] = createSignal<QuestionAnswer[]>(questions().map(() => []))
  /** Drafts survive edit-cancel; only submit/reject consumes them. */
  const [customValues, setCustomValues] = createSignal<string[]>(questions().map(() => ""))
  const [questionIndex, setQuestionIndex] = createSignal(0)
  const [optionIndex, setOptionIndex] = createSignal(0)
  const [submitFocused, setSubmitFocused] = createSignal(false)
  const [editingQuestion, setEditingQuestion] = createSignal<number | undefined>()
  const [hover, setHover] = createSignal<{ q: number; o: number } | undefined>()
  const [busy, setBusy] = createSignal(false)
  const [escArmed, setEscArmed] = createSignal(false)
  const [flashIndex, setFlashIndex] = createSignal<number | undefined>()
  let textarea: TextareaRenderable | undefined
  let scroller: ScrollBoxRenderable | undefined
  let escTimer: ReturnType<typeof setTimeout> | undefined
  let flashTimer: ReturnType<typeof setTimeout> | undefined

  const answered = (index: number) => (answers()[index]?.length ?? 0) > 0
  const unanswered = createMemo(() => questions().flatMap((_, index) => answered(index) ? [] : [index + 1]))
  const complete = createMemo(() => questions().length > 0 && unanswered().length === 0)

  /**
   * Content-hug: size the scroll area to the actual question rows (capped at
   * the old 60%-viewport ceiling). The previous fixed height rendered ~2/3 of
   * the terminal for a two-option yes/no gate.
   */
  const contentRows = createMemo(() => {
    let rows = 1
    for (const question of questions()) {
      const optionCount = question.options?.length ?? 0
      rows += 1 + (question.multiple === true ? 1 : 0) + optionCount + (question.custom !== false ? 1 : 0) + 1
    }
    return Math.max(4, rows)
  })
  const boxHeight = createMemo(() => Math.min(Math.max(6, Math.floor(dimensions().height * 0.6) - 5), contentRows()))

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

  /** Jump to the first unanswered question and pulse its row. Never silent. */
  function focusFirstUnanswered(): boolean {
    const first = unanswered()[0]
    if (first === undefined) return false
    focusQuestion(first - 1)
    setFlashIndex(first - 1)
    if (flashTimer) clearTimeout(flashTimer)
    flashTimer = setTimeout(() => setFlashIndex(undefined), 900)
    return true
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
      // The editor must be visible while it owns focus: scroll its question
      // row into view before focusing the textarea.
      queueMicrotask(() => {
        scroller?.scrollChildIntoView(`question-${index}`)
        textarea?.focus()
      })
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
    // Single-select advances to the next open question (or the submit chip
    // when everything is answered) — Enter never feels like a dead key.
    const nextOpen = questions().findIndex((_, i) => i !== index && !answered(i))
    if (nextOpen !== -1) focusQuestion(nextOpen)
    else setSubmitFocused(true)
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

  /** Cancel edit mode but KEEP the typed draft for the next attempt. */
  function cancelEdit() {
    const index = editingQuestion()
    if (index === undefined) return
    const draft = textarea?.plainText ?? ""
    setCustomValues((current) => {
      const next = [...current]
      next[index] = draft.trim()
      return next
    })
    setEditingQuestion(undefined)
  }

  /** Optimistic local dismissal — mirrors the engine's question.replied SSE cleanup. */
  function dismissLocal() {
    sync.question.dropLocal(props.request.sessionID, props.request.id)
  }

  async function submit(): Promise<boolean> {
    if (busy() || !complete()) return false
    setBusy(true)
    try {
      const res = await sdk.client.question.reply({
        requestID: props.request.id,
        directory: props.directory,
        answers: questions().map((_, index) => answers()[index] ?? []),
      })
      const err = (res as { error?: unknown } | undefined)?.error
      // Optimistic dismissal (A8): the form must close even if the SSE
      // question.replied event is missed. An already-answered 404 means the
      // reply DID land — close instead of surfacing a phantom failure.
      if (err && !isUnknownRequestNotFoundError(err)) throw err
      dismissLocal()
      return true
    } catch (error) {
      if (isUnknownRequestNotFoundError(error)) {
        dismissLocal()
        return true
      }
      toast.show({ title: "Question reply failed", message: `${errorMessage(error)} — try again`, variant: "error" })
      return false
    } finally {
      setBusy(false)
    }
  }

  async function reject(): Promise<boolean> {
    if (busy()) return false
    setBusy(true)
    try {
      await sdk.client.question.reject({ requestID: props.request.id, directory: props.directory })
      dismissLocal()
      return true
    } catch (error) {
      if (isUnknownRequestNotFoundError(error)) {
        dismissLocal()
        return true
      }
      toast.show({ title: "Question dismiss failed", message: `${errorMessage(error)} — try again`, variant: "error" })
      return false
    } finally {
      setBusy(false)
    }
  }

  /**
   * Esc is destructive (discards the form) whenever progress exists. First
   * Esc arms with an visible footer cue; second Esc inside the window fires.
   */
  function dismissIntent() {
    if (!escArmed()) {
      setEscArmed(true)
      if (escTimer) clearTimeout(escTimer)
      escTimer = setTimeout(() => setEscArmed(false), ESC_ARM_MS)
      return
    }
    if (escTimer) clearTimeout(escTimer)
    setEscArmed(false)
    void reject()
  }

  onMount(() => {
    const popMode = modeStack.push(QUESTION_MODE)
    onCleanup(popMode)
    onCleanup(() => {
      if (escTimer) clearTimeout(escTimer)
      if (flashTimer) clearTimeout(flashTimer)
    })
  })

  useBindings(() => ({
    mode: QUESTION_MODE,
    enabled: editingQuestion() !== undefined && !busy(),
    bindings: [
      { key: "escape", desc: "Save draft and close editor", group: "Question", cmd: cancelEdit },
      { key: "return", desc: "Save custom answer", group: "Question", cmd: commitCustom },
      ...tuiConfig.keybinds.get("prompt.clear").map((binding) => ({ ...binding, cmd: () => textarea?.setText("") })),
    ],
  }))

  useBindings(() => {
    const question = questions()[questionIndex()]
    // Number shortcuts map ONLY to real options — the custom slot below them
    // is reached with down/Enter, never by a digit that looks like "option 3".
    const optionCount = question?.options?.length ?? 0
    const total = optionCount + (question?.custom !== false ? 1 : 0)
    return {
      mode: QUESTION_MODE,
      enabled: editingQuestion() === undefined && !busy(),
      commands: [{ name: "app.exit", title: "Dismiss questions", category: "Question", run: () => void dismissIntent() }],
      bindings: [
        { key: "escape", desc: escArmed() ? "Esc again to discard" : "Dismiss questions", group: "Question", cmd: dismissIntent },
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
          if (submitFocused()) {
            if (complete()) void submit()
            else focusFirstUnanswered()
            return
          }
          choose(questionIndex(), optionIndex())
        } },
        { key: "space", desc: "Select answer", group: "Question", cmd: () => {
          if (!submitFocused()) choose(questionIndex(), optionIndex())
        } },
        ...Array.from({ length: Math.min(optionCount, 9) }, (_, index) => ({
          key: String(index + 1),
          desc: `Select option ${index + 1}`,
          group: "Question",
          cmd: () => { setOptionIndex(index); choose(questionIndex(), index) },
        })),
        ...tuiConfig.keybinds.get("app.exit"),
      ],
    }
  })

  /**
   * The columns this gate's rows have, or `undefined` when the renderer has not
   * been laid out yet — which is not the same as narrow, and must never stack a
   * row that would have fit.
   */
  const budget = createMemo(() =>
    questionContentWidth(
      questionLead(metrics().pad, metrics().gutter, metrics().rail),
      rendererWidth({ width: dimensions().width }),
      density(),
    ),
  )
  /** How wide the leading marker has to be to hold the largest index printed. */
  const indexWidth = createMemo(() => String(questions().length).length + 1)
  /**
   * The hint above the submit control, by state — the same literal `stacks()`
   * measures, so the row and its measurement cannot disagree.
   */
  const footerHint = createMemo(() => {
    if (escArmed()) return HINT_ESC_ARMED
    if (unanswered().length > 0) return HINT_REQUIRED(unanswered().join(", "))
    return HINT_SUBMIT
  })
  /**
   * Whether the hint and the submit control stack.
   *
   * Both were elastic in a `space-between` row, so a row narrower than the two
   * did not push the control to the far edge — yoga shared the deficit between
   * them and both decoded. At 40 columns the row printed `Required: answer 1 ·
   * Submit (` over `enter jumps to it   incomplete)`, and at 32 the two ran
   * together with no gap between them at all: `Required: answer Submit (` over
   * `1 · enter jumps  incomplete)`. The one control on the gate — the thing the
   * operator is looking for — was the part that came apart.
   *
   * Measured against the longest hint the gate can print, every question
   * unanswered, rather than the hint's current text: answering the last question
   * shortens the hint, and a row that reflows under the operator's cursor is a
   * worse trade than two rows that hold still.
   */
  const stacks = createMemo(() => {
    const width = budget()
    if (width === undefined) return false
    const longest = Math.max(
      Locale.displayWidth(HINT_REQUIRED(questions().map((_, index) => index + 1).join(", "))),
      Locale.displayWidth(HINT_ESC_ARMED),
      Locale.displayWidth(HINT_SUBMIT),
    )
    return longest + Space.gap + SUBMIT_WIDTH > width
  })

  return (
    <box flexDirection="column" flexShrink={0} width="100%" paddingTop={Space.padY} paddingBottom={Space.padY}>
      <box flexDirection="row" width="100%" paddingLeft={metrics().pad} paddingRight={metrics().pad}>
        <SpineGutterSpacer layout={layout()} />
        <SpineRail layout={layout()} glyph="?" color={theme.spineInspect} kind="inspect" />
        <box flexDirection="column" flexGrow={1} minWidth={0}>
          <box flexDirection="row" justifyContent="space-between" minWidth={0}>
            {/* Both halves of this row are fixed vocabulary — the card's name and
                its progress readout — and neither is prose that may reflow. Left
                flexible, Yoga takes the deficit out of both at once and decodes
                them (`QUESTIO`/`NS`, `0/3 answe`/`red`). Reserved, the row
                overhangs its edge instead, and the tail the card clips is the
                readout's — the name stays whole, and the count is the half that
                can afford to lose its `· submitting…` suffix. */}
            <text fg={theme.spineInspect} wrapMode="none" flexShrink={0}>
              QUESTIONS
            </text>
            <text fg={complete() ? theme.success : theme.textMuted} wrapMode="none" flexShrink={0}>
              {questions().length - unanswered().length}/{questions().length} answered{busy() ? " · submitting…" : ""}
            </text>
          </box>
          <Show when={questions().length === 0}>
            <text fg={theme.error}>This request contains no questions. Press Esc to dismiss it.</text>
          </Show>
        </box>
      </box>

      <box flexDirection="row" width="100%" paddingLeft={metrics().pad} paddingRight={metrics().pad} marginTop={Space.gap}>
        <SpineGutterSpacer layout={layout()} />
        <SpineRail layout={layout()} />
        <scrollbox
          ref={(value) => { scroller = value as unknown as ScrollBoxRenderable }}
          height={boxHeight()}
          flexGrow={1}
          minWidth={0}
          viewportOptions={{ paddingRight: 1 }}
          verticalScrollbarOptions={{
            visible: boxHeight() < contentRows(),
            trackOptions: { backgroundColor: theme.backgroundElement, foregroundColor: theme.border },
          }}
        >
          <For each={questions()}>
            {(question, index) => {
              const options = () => question.options ?? []
              const focused = () => !submitFocused() && questionIndex() === index()
              const hovered = (option: number) => hover()?.q === index() && hover()?.o === option
              const active = (option: number) =>
                (focused() && optionIndex() === option) || (hovered(option) && !submitFocused())
              const flashing = () => flashIndex() === index() && !answered(index())
              const selected = (option: number) => answers()[index()]?.includes(options()[option]?.label ?? "") ?? false
              return (
                <box
                  id={`question-${index()}`}
                  flexDirection="column"
                  marginBottom={Space.gap}
                  minWidth={0}
                  backgroundColor={flashing() ? theme.backgroundElement : undefined}
                >
                  <box flexDirection="row" minWidth={0} gap={Space.gap}>
                    {/* The index is the row's address, so it is whole or absent
                        — never shrunk. Sharing the deficit with the question
                        text ate the space that separated them, and from 64
                        columns down every question printed glued to its own
                        number: `1.Deployment target`. The width is reserved at
                        the widest index the form can print, so a ticked
                        question does not shift its own text. */}
                    <text
                      width={indexWidth()}
                      flexShrink={0}
                      fg={flashing() ? theme.warning : focused() ? theme.accent : answered(index()) ? theme.success : theme.textMuted}
                    >
                      {answered(index()) ? "✓" : `${index() + 1}.`}
                    </text>
                    <text fg={theme.text} wrapMode="word">{question.header ? `${question.header} — ` : ""}{question.question}</text>
                  </box>
                  <Show when={question.multiple === true}>
                    <text fg={theme.textMuted}>  Select all that apply</text>
                  </Show>
                  <Show when={options().length === 0 && question.custom === false}>
                    <text fg={theme.error}>  No answer options were supplied.</text>
                  </Show>
                  <For each={options()}>
                    {(option, optionNumber) => {
                      return (
                        <box
                          flexDirection="column"
                          marginLeft={Space.gapWide}
                          paddingLeft={Space.unit}
                          backgroundColor={active(optionNumber()) ? theme.accent : undefined}
                          onMouseOver={() => setHover({ q: index(), o: optionNumber() })}
                          onMouseOut={() => setHover(undefined)}
                          onMouseUp={() => {
                            if (hasMeaningfulSelection()) return
                            setQuestionIndex(index())
                            setOptionIndex(optionNumber())
                            setSubmitFocused(false)
                            choose(index(), optionNumber())
                          }}
                        >
                          <text fg={active(optionNumber()) ? selectedForeground(theme, theme.accent) : selected(optionNumber()) ? theme.success : theme.text} wrapMode="word">
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
                      marginLeft={Space.gapWide}
                      paddingLeft={Space.unit}
                      backgroundColor={focused() && optionIndex() === options().length ? theme.accent : undefined}
                      onMouseOver={() => setHover({ q: index(), o: options().length })}
                      onMouseOut={() => setHover(undefined)}
                      onMouseUp={() => {
                        if (hasMeaningfulSelection()) return
                        setQuestionIndex(index())
                        setOptionIndex(options().length)
                        setSubmitFocused(false)
                        choose(index(), options().length)
                      }}
                    >
                      <Show when={editingQuestion() !== index()} fallback={
                        <textarea
                          ref={(value) => { textarea = value as unknown as TextareaRenderable }}
                          height={3}
                          initialValue={customValues()[index()] ?? ""}
                          placeholder={COPY.dialog.customAnswer}
                          focused={true}
                        />
                      }>
                        <text fg={focused() && optionIndex() === options().length ? selectedForeground(theme, theme.accent) : (customValues()[index()] ?? "") ? theme.success : theme.textMuted} wrapMode="word">
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

      <box flexDirection="row" width="100%" paddingLeft={metrics().pad} paddingRight={metrics().pad} marginTop={Space.gap}>
        <SpineGutterSpacer layout={layout()} />
        <SpineRail layout={layout()} />
        <box
          flexDirection={stacks() ? "column" : "row"}
          flexGrow={1}
          justifyContent="space-between"
          minWidth={0}
          gap={stacks() ? Space.gap : 0}
        >
          <text fg={escArmed() ? theme.error : unanswered().length > 0 ? theme.warning : theme.textMuted} wrapMode="word">
            {footerHint()}
          </text>
          {/* The control is whole or absent: `flexShrink={0}` and a label that
              cannot wrap, so the hint beside it is the row's only elastic part.
              Stacked, it keeps the right edge — the family's action position —
              rather than starting a new left-aligned line. */}
          <box
            alignSelf={stacks() ? "flex-end" : "stretch"}
            flexShrink={0}
            paddingLeft={Space.unit}
            paddingRight={Space.unit}
            backgroundColor={submitFocused() ? theme.accent : complete() ? theme.backgroundElement : theme.backgroundMenu}
            onMouseOver={() => setSubmitFocused(true)}
            onMouseOut={() => setSubmitFocused(false)}
            onMouseUp={() => { if (!hasMeaningfulSelection()) { if (complete()) void submit(); else focusFirstUnanswered() } }}
          >
            <text wrapMode="none" fg={submitFocused() ? selectedForeground(theme, theme.accent) : complete() ? theme.text : theme.textMuted}>
              {busy() ? SUBMIT_BUSY : complete() ? SUBMIT_READY : SUBMIT_INCOMPLETE}
            </text>
          </box>
        </box>
      </box>
    </box>
  )
}

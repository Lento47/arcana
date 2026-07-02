import {
  InputRenderable,
  RGBA,
  ScrollBoxRenderable,
  TextAttributes,
  type KeyEvent,
  type Renderable,
} from "@opentui/core"
import type { Binding } from "@opentui/keymap"
import { useTheme, selectedForeground } from "../context/theme"
import { COPY, Glyph } from "../branding"
import { DoubleBorder } from "./chrome"
import { isDeepEqual } from "remeda"
import { batch, createEffect, createMemo, createSignal, For, Show, type JSX, on } from "solid-js"
import { createStore } from "solid-js/store"
import { useTerminalDimensions } from "@opentui/solid"
import * as fuzzysort from "fuzzysort"
import { useDialog, type DialogContext } from "./dialog"
import { Locale } from "../util/locale"
import { getScrollAcceleration } from "../util/scroll"
import { useTuiConfig } from "../config"
import { formatKeyBindings, useBindings, useKeymapSelector } from "../keymap"

function fastEqual<T>(a: T, b: T): boolean {
  if (a === b) return true
  return isDeepEqual(a, b)
}

export interface DialogSelectProps<T> {
  title: string
  titleView?: JSX.Element
  placeholder?: string
  footer?: JSX.Element
  emptyView?: JSX.Element
  options: DialogSelectOption<T>[]
  flat?: boolean
  ref?: (ref: DialogSelectRef<T>) => void
  onMove?: (option: DialogSelectOption<T>) => void
  onFilter?: (query: string) => void
  onSelect?: (option: DialogSelectOption<T>) => void
  skipFilter?: boolean
  renderFilter?: boolean
  locked?: boolean
  actions?: {
    command: string
    title: string
    side?: "left" | "right"
    hidden?: boolean
    disabled?: boolean | ((option: DialogSelectOption<T> | undefined) => boolean)
    onTrigger: (option: DialogSelectOption<T>) => void
  }[]
  footerHints?: {
    title: string
    label: string
    side?: "left" | "right"
  }[]
  bindings?: readonly Binding<Renderable, KeyEvent>[]
  current?: T
}

export interface DialogSelectOption<T = any> {
  title: string
  titleView?: JSX.Element
  value: T
  description?: string
  details?: string[]
  footer?: JSX.Element | string
  titleWidth?: number
  truncateTitle?: boolean | "left"
  category?: string
  categoryView?: JSX.Element
  disabled?: boolean
  bg?: RGBA
  gutter?: () => JSX.Element
  margin?: JSX.Element
  onSelect?: (ctx: DialogContext) => void
}

export type DialogSelectRef<T> = {
  filter: string
  filtered: DialogSelectOption<T>[]
  moveTo(value: T): void
}

export function DialogSelect<T>(props: DialogSelectProps<T>) {
  type Action = NonNullable<DialogSelectProps<T>["actions"]>[number]
  type FooterHint = NonNullable<DialogSelectProps<T>["footerHints"]>[number]
  type VisibleAction = (Action & { label: string }) | FooterHint

  const dialog = useDialog()
  const { theme } = useTheme()
  const tuiConfig = useTuiConfig()
  const scrollAcceleration = createMemo(() => getScrollAcceleration(tuiConfig))

  // Dialog body may be transparent in system/transparent themes; default inactive
  // rows to an opaque surface so text remains readable over the terminal.
  const inactiveBg = createMemo(() => (theme.background.a < 1 ? theme.backgroundPanel : theme.background))

  const [store, setStore] = createStore({
    selected: 0,
    filter: "",
    input: "keyboard" as "keyboard" | "mouse",
  })
  const [focusedAction, setFocusedAction] = createSignal<number>()
  const actionFocused = createMemo(() => focusedAction() !== undefined)

  createEffect(
    on(
      () => props.current,
      (current) => {
        if (current) {
          const index = currentIndex()
          if (index >= 0) setStore("selected", index)
        }
      },
    ),
  )

  let input: InputRenderable

  const actions = createMemo(() => props.actions ?? [])
  const shownActions = createMemo(() => actions().filter((item) => !item.hidden))
  const actionBindings = useKeymapSelector((keymap) =>
    keymap.getCommandBindings({
      visibility: "registered",
      commands: shownActions().map((item) => item.command),
    }),
  )

  const actionLabels = createMemo(() => {
    const labels = new Map<string, string>()

    for (const action of shownActions()) {
      const label = formatKeyBindings(actionBindings().get(action.command), tuiConfig)
      if (label) labels.set(action.command, label)
    }

    return labels
  })
  const visibleActions = createMemo(() => [
    ...shownActions()
      .map((item) => ({ ...item, label: actionLabels().get(item.command) ?? "" }))
      .filter((item) => item.label),
    ...(props.footerHints ?? []),
  ])
  const actionItems = createMemo(() =>
    visibleActions()
      .filter(isActionItem)
      .filter((item) => !isActionDisabled(item)),
  )

  createEffect(() => {
    const index = focusedAction()
    if (index !== undefined && index >= actionItems().length) setFocusedAction(undefined)
  })

  const filtered = createMemo(() => {
    if (props.skipFilter || props.renderFilter === false) return props.options.filter((x) => x.disabled !== true)
    const needle = store.filter.toLowerCase()
    const options: DialogSelectOption<T>[] = []
    for (const option of props.options) {
      if (option.disabled !== true) options.push(option)
    }
    if (!needle) return options

    // prioritize title matches (weight: 2) over category matches (weight: 1).
    // users typically search by the item name, and not its category.
    const result = fuzzysort
      .go(needle, options, {
        keys: ["title", "category"],
        scoreFn: (r) => r[0].score * 2 + r[1].score,
      })
      .map((x) => x.obj)

    return result
  })

  // When the filter changes due to how TUI works, the mousemove might still be triggered
  // via a synthetic event as the layout moves underneath the cursor. This is a workaround to make sure the input mode remains keyboard
  // that the mouseover event doesn't trigger when filtering.
  createEffect(() => {
    filtered()
    setStore("input", "keyboard")
    setFocusedAction(undefined)
  })

  const flatten = createMemo(() => props.flat && store.filter.length > 0)

  // Native Map/grouping avoids the overhead of remeda's functional helpers on
  // large option lists (model/skill pickers).
  const grouped = createMemo<[string, DialogSelectOption<T>[]][]>(() => {
    if (flatten()) return [["", filtered()]]
    const map = new Map<string, DialogSelectOption<T>[]>()
    for (const option of filtered()) {
      const key = option.category ?? ""
      const existing = map.get(key)
      if (existing) existing.push(option)
      else map.set(key, [option])
    }
    return [...map.entries()]
  })

  const flat = createMemo(() => {
    const result: DialogSelectOption<T>[] = []
    for (const [, options] of grouped()) result.push(...options)
    return result
  })

  const flatIndexByOption = createMemo(() => {
    const map = new Map<DialogSelectOption<T>, number>()
    let i = 0
    for (const option of flat()) map.set(option, i++)
    return map
  })

  const currentIndex = createMemo(() => {
    const value = props.current
    if (value === undefined) return -1
    const list = flat()
    for (let i = 0; i < list.length; i++) {
      if (fastEqual(list[i].value, value)) return i
    }
    return -1
  })

  const rows = createMemo(() => {
    const groups = grouped()
    let headers = 0
    for (let i = 0; i < groups.length; i++) {
      if (groups[i][0]) headers += i > 0 ? 2 : 1
    }
    let rows = headers
    for (const [, options] of groups) {
      for (const option of options) rows += 1 + (option.details?.length ?? 0)
    }
    return rows
  })

  const dimensions = useTerminalDimensions()
  const height = createMemo(() => Math.min(rows(), Math.floor(dimensions().height / 2) - 6))

  const selected = createMemo(() => flat()[store.selected])

  createEffect(
    on([() => store.filter, () => props.current], ([filter, current]) => {
      setTimeout(() => {
        if (filter.length > 0) {
          moveTo(0, true)
        } else if (current) {
          const index = currentIndex()
          if (index >= 0) moveTo(index, true)
        }
      }, 0)
    }),
  )

  function move(direction: number) {
    if (props.locked) return
    if (flat().length === 0) return
    let next = store.selected + direction
    if (next < 0) next = flat().length - 1
    if (next >= flat().length) next = 0
    moveTo(next, true)
  }

  function moveTo(next: number, center = false) {
    setFocusedAction(undefined)
    setStore("selected", next)
    const option = selected()
    if (option) props.onMove?.(option)
    if (!scroll) return
    let remaining = store.selected
    let index = 0
    // Locate the row by position because a unique renderable ID cannot currently be ensured.
    for (const [category, options] of grouped()) {
      if (category) index++
      if (remaining < options.length) {
        index += remaining
        break
      }
      index += options.length
      remaining -= options.length
    }
    const target = scroll.getChildren()[index]
    if (!target) return
    const y = target.y - scroll.y
    if (center) {
      const centerOffset = Math.floor(scroll.height / 2)
      scroll.scrollBy(y - centerOffset)
    } else {
      if (y >= scroll.height) {
        scroll.scrollBy(y - scroll.height + 1)
      }
      if (y < 0) {
        scroll.scrollBy(y)
        if (isDeepEqual(flat()[0].value, selected()?.value)) {
          scroll.scrollTo(0)
        }
      }
    }
  }

  function submit() {
    if (props.locked) return
    setStore("input", "keyboard")
    const index = focusedAction()
    if (index !== undefined) {
      triggerAction(actionItems()[index])
      return
    }
    const option = selected()
    if (!option) return
    option.onSelect?.(dialog)
    props.onSelect?.(option)
  }

  function moveAction(direction: 1 | -1) {
    if (props.locked) return
    const total = actionItems().length
    if (total === 0) return
    setFocusedAction((index) => {
      if (index === undefined) return direction === 1 ? 0 : total - 1
      const next = index + direction
      return next < 0 || next >= total ? undefined : next
    })
  }

  useBindings(() => {
    const visible = shownActions()

    return {
      commands: [
        {
          name: "dialog.select.prev",
          title: "Previous item",
          category: "Dialog",
          run() {
            setStore("input", "keyboard")
            move(-1)
          },
        },
        {
          name: "dialog.select.next",
          title: "Next item",
          category: "Dialog",
          run() {
            setStore("input", "keyboard")
            move(1)
          },
        },
        {
          name: "dialog.select.page_up",
          title: "Page up",
          category: "Dialog",
          run() {
            setStore("input", "keyboard")
            move(-10)
          },
        },
        {
          name: "dialog.select.page_down",
          title: "Page down",
          category: "Dialog",
          run() {
            setStore("input", "keyboard")
            move(10)
          },
        },
        {
          name: "dialog.select.home",
          title: "First item",
          category: "Dialog",
          run() {
            if (props.locked) return
            setStore("input", "keyboard")
            moveTo(0)
          },
        },
        {
          name: "dialog.select.end",
          title: "Last item",
          category: "Dialog",
          run() {
            if (props.locked) return
            setStore("input", "keyboard")
            moveTo(flat().length - 1)
          },
        },
        {
          name: "dialog.select.submit",
          title: "Select item",
          category: "Dialog",
          run: submit,
        },
        ...visible.map((item) => ({
          name: item.command,
          title: item.title,
          category: "Dialog",
          run() {
            if (props.locked) return
            if (isActionDisabled(item)) return
            setStore("input", "keyboard")
            const option = selected()
            if (!option) return
            item.onTrigger(option)
          },
        })),
      ],
      bindings: [
        ...tuiConfig.keybinds.gather("dialog.select", [
          "dialog.select.prev",
          "dialog.select.next",
          "dialog.select.page_up",
          "dialog.select.page_down",
          "dialog.select.home",
          "dialog.select.end",
          "dialog.select.submit",
        ]),
        ...visible.flatMap((item) => tuiConfig.keybinds.get(item.command)),
        ...(visible.length
          ? [
              {
                key: "tab",
                desc: "Next dialog action",
                group: "Dialog",
                cmd: () => moveAction(1),
              },
              {
                key: "shift+tab",
                desc: "Previous dialog action",
                group: "Dialog",
                cmd: () => moveAction(-1),
              },
            ]
          : []),
        ...(props.bindings ?? []).filter((binding) => {
          if (typeof binding.cmd !== "string") return true
          return visible.some((item) => item.command === binding.cmd)
        }),
      ],
    }
  })

  let scroll: ScrollBoxRenderable | undefined
  const ref: DialogSelectRef<T> = {
    get filter() {
      return store.filter
    },
    get filtered() {
      return filtered()
    },
    moveTo(value) {
      const list = flat()
      for (let i = 0; i < list.length; i++) {
        if (fastEqual(list[i].value, value)) {
          moveTo(i, true)
          return
        }
      }
    },
  }
  props.ref?.(ref)

  const left = createMemo(() => visibleActions().filter((item) => item.side !== "right"))
  const right = createMemo(() => visibleActions().filter((item) => item.side === "right"))

  function triggerAction(item: VisibleAction | undefined) {
    if (props.locked) return
    if (!item || !isActionItem(item) || isActionDisabled(item)) return
    setStore("input", "keyboard")
    const option = selected()
    if (!option) return
    item.onTrigger(option)
  }

  function isActionItem(item: VisibleAction): item is Action & { label: string } {
    return "onTrigger" in item
  }

  function isActionDisabled(item: Action) {
    return typeof item.disabled === "function" ? item.disabled(selected()) : item.disabled
  }

  function isActionFocused(item: VisibleAction) {
    if (props.locked) return false
    if (!isActionItem(item)) return false
    return actionItems().indexOf(item) === focusedAction()
  }

  function FooterAction(action: { item: VisibleAction }) {
    if (!isActionItem(action.item))
      return (
        <text>
          <span style={{ fg: theme.text }}>
            <b>{action.item.title}</b>{" "}
          </span>
          <span style={{ fg: theme.textMuted }}>{action.item.label}</span>
        </text>
      )
    const item = action.item
    const active = createMemo(() => isActionFocused(item))
    const disabled = createMemo(() => isActionDisabled(item))
    const fg = selectedForeground(theme)
    return (
      <box
        flexDirection="row"
        backgroundColor={active() ? theme.primary : inactiveBg()}
        onMouseUp={() => triggerAction(item)}
      >
        <text
          fg={disabled() ? theme.textMuted : active() ? fg : theme.text}
          attributes={active() ? TextAttributes.BOLD : undefined}
        >
          {item.title}
        </text>
        <text fg={disabled() ? theme.textMuted : active() ? fg : theme.textMuted}> {item.label}</text>
      </box>
    )
  }

  return (
    <box
      flexGrow={1}
      border={["top", "bottom", "left", "right"]}
      customBorderChars={DoubleBorder}
      borderColor={theme.accent}
      backgroundColor={theme.background}
    >
      {/* Header — background panel, gold title, sigil close */}
      <box
        paddingLeft={3}
        paddingRight={3}
        paddingTop={1}
        paddingBottom={1}
        backgroundColor={theme.backgroundPanel}
        border={["bottom"]}
        borderColor={theme.borderSubtle}
      >
        <box flexDirection="row" justifyContent="space-between">
          {props.titleView ?? (
            <text fg={theme.primary} attributes={TextAttributes.BOLD}>
              {props.title}
            </text>
          )}
          <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
            {Glyph.sigil}
          </text>
        </box>
      </box>

      {/* Filter */}
      <Show when={props.renderFilter !== false}>
        <box paddingLeft={3} paddingRight={3} paddingTop={1} paddingBottom={1}>
          <input
            onInput={(e) => {
              if (props.locked) return
              batch(() => {
                setStore("filter", e)
                props.onFilter?.(e)
              })
            }}
            focusedBackgroundColor={theme.backgroundPanel}
            cursorColor={theme.accent}
            focusedTextColor={theme.textMuted}
            ref={(r) => {
              input = r
              input.traits = { status: "FILTER" }
              setTimeout(() => {
                if (!input) return
                if (input.isDestroyed) return
                input.focus()
              }, 1)
            }}
            placeholder={props.placeholder ?? "Scry…"}
            placeholderColor={theme.textMuted}
          />
        </box>
      </Show>
      <box flexGrow={1} flexShrink={1}>
        <Show
          when={grouped().length > 0}
          fallback={
            props.emptyView ?? (
              <box paddingLeft={4} paddingRight={4} paddingTop={1}>
                <text fg={theme.textMuted}>{COPY.noEchoesFound}</text>
              </box>
            )
          }
        >
          <scrollbox
            paddingLeft={1}
            paddingRight={1}
            scrollbarOptions={{ visible: false }}
            scrollAcceleration={scrollAcceleration()}
            ref={(r: ScrollBoxRenderable) => (scroll = r)}
            maxHeight={height()}
          >
            <For each={grouped()}>
              {([category, options], index) => (
                <>
                  <Show when={category}>
                    <box paddingTop={index() > 0 ? 1 : 0} paddingLeft={3}>
                      <Show
                        when={options[0]?.categoryView}
                        fallback={
                          <text fg={theme.accent} attributes={TextAttributes.BOLD}>
                            {category}
                          </text>
                        }
                      >
                        {options[0]?.categoryView}
                      </Show>
                    </box>
                  </Show>
                  <For each={options}>
                    {(option) => {
                      const active = createMemo(() => !props.locked && fastEqual(option.value, selected()?.value))
                      const current = createMemo(() => fastEqual(option.value, props.current))
                      return (
                        <box
                          flexDirection="column"
                          position="relative"
                          onMouseMove={() => {
                            if (props.locked) return
                            setStore("input", "mouse")
                            setFocusedAction(undefined)
                          }}
                          onMouseUp={() => {
                            if (props.locked) return
                            option.onSelect?.(dialog)
                            props.onSelect?.(option)
                          }}
                          onMouseOver={() => {
                            if (props.locked) return
                            if (store.input !== "mouse") return
                            const index = flatIndexByOption().get(option)
                            if (index === undefined) return
                            moveTo(index)
                          }}
                          onMouseDown={() => {
                            if (props.locked) return
                            const index = flatIndexByOption().get(option)
                            if (index === undefined) return
                            moveTo(index)
                          }}
                        >
                          <box
                            flexDirection="row"
                            paddingLeft={current() || option.gutter ? 1 : 3}
                            paddingRight={3}
                            gap={1}
                            backgroundColor={
                              active()
                                ? actionFocused()
                                  ? theme.backgroundElement
                                  : (option.bg ?? theme.primary)
                                : inactiveBg()
                            }
                          >
                            <Show when={!current() && option.margin}>
                              <box position="absolute" left={1} flexShrink={0}>
                                {option.margin}
                              </box>
                            </Show>
                            <Option
                              title={option.title}
                              titleView={option.titleView}
                              footer={flatten() ? (option.category ?? option.footer) : option.footer}
                              titleWidth={option.titleWidth}
                              truncateTitle={option.truncateTitle}
                              description={option.description !== category ? option.description : undefined}
                              active={active()}
                              current={current()}
                              muted={actionFocused()}
                              gutter={option.gutter}
                            />
                          </box>
                          <For each={option.details}>
                            {(detail) => (
                              <box paddingLeft={3} paddingRight={3}>
                                <text fg={theme.textMuted} wrapMode="none">
                                  {Locale.truncateMiddle(detail, Math.max(1, Math.min(76, dimensions().width - 12)))}
                                </text>
                              </box>
                            )}
                          </For>
                        </box>
                      )
                    }}
                  </For>
                </>
              )}
            </For>
          </scrollbox>
        </Show>
      </box>
      <Show when={props.footer || visibleActions().length} fallback={<box flexShrink={0} />}>
        <box
          paddingRight={3}
          paddingLeft={3}
          paddingTop={1}
          paddingBottom={1}
          flexDirection="row"
          justifyContent="space-between"
          flexShrink={0}
          backgroundColor={theme.backgroundPanel}
          border={["top"]}
          borderColor={theme.borderSubtle}
        >
          <box flexDirection="row" gap={2}>
            {props.footer}
            <For each={left()}>{(item) => <FooterAction item={item} />}</For>
          </box>
          <box flexDirection="row" gap={2}>
            <For each={right()}>{(item) => <FooterAction item={item} />}</For>
          </box>
        </box>
      </Show>
    </box>
  )
}

function Option(props: {
  title: string
  titleView?: JSX.Element
  description?: string
  active?: boolean
  current?: boolean
  muted?: boolean
  footer?: JSX.Element | string
  titleWidth?: number
  truncateTitle?: boolean | "left"
  gutter?: () => JSX.Element
  onMouseOver?: () => void
}) {
  const { theme } = useTheme()
  const fg = selectedForeground(theme)
  const text = createMemo(() => {
    if (props.active && !props.muted) return fg
    if (props.muted && (props.active || props.current)) return theme.textMuted
    if (props.current) return theme.primary
    return theme.text
  })

  return (
    <>
      <Show when={props.current && !props.gutter}>
        <text flexShrink={0} fg={text()} marginRight={0}>
          ●
        </text>
      </Show>
      <Show when={props.gutter}>
        <box flexShrink={0} marginRight={0}>
          {props.gutter?.()}
        </box>
      </Show>
      <text
        flexGrow={1}
        fg={text()}
        attributes={props.active && !props.muted ? TextAttributes.BOLD : undefined}
        overflow="hidden"
        wrapMode="none"
        paddingLeft={3}
      >
        {props.titleView ??
          (props.truncateTitle === false
            ? props.title
            : props.truncateTitle === "left"
              ? Locale.truncateLeft(props.title, props.titleWidth ?? 61)
              : Locale.truncate(props.title, props.titleWidth ?? 61))}
        <Show when={props.description}>
          <span style={{ fg: props.active && !props.muted ? fg : theme.textMuted }}> {props.description}</span>
        </Show>
      </text>
      <Show when={props.footer}>
        <box flexShrink={0}>
          <text fg={props.active && !props.muted ? fg : theme.textMuted}>{props.footer}</text>
        </box>
      </Show>
    </>
  )
}

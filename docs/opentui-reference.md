# OpenTUI Reference (consolidated)

A single reference covering every OpenTUI topic, distilled from the
`anomalyco/opentui` skill docs (`~/.agents/skills/opentui/docs`). Arcana's TUI
(`packages/tui`) is built on **`@opentui/solid`** (Solid.js), so examples favor
the Solid binding; core (`@opentui/core`) factory/imperative forms are noted
where a Solid wrapper does not yet exist.

Conventions:
- `renderer` = `await createCliRenderer({...})`
- Solid components are **snake_case** JSX (`<text>`, `<box>`, `<scrollbox>`); core
  uses factory functions (`Box({...})`) or classes (`new BoxRenderable(...)`).
- Colors accept `"#RRGGBBAA"` strings or `RGBA` instances.

---

## Getting Started

OpenTUI is a native (Zig) terminal UI core with TypeScript bindings. Importing
`@opentui/core` / `@opentui/keymap` works in Node without FFI; creating a native
renderer (`createCliRenderer()`) needs FFI (Node 26.4.0 `--experimental-ffi`, or
Bun).

```ts
import { createCliRenderer, Text } from "@opentui/core"

const renderer = await createCliRenderer({ exitOnCtrlC: true })
renderer.root.add(Text({ content: "Hello, OpenTUI!", fg: "#00FF00" }))
```

Boxes nest via factory children: `Box({ props }, ...children)`.

---

## Core Concepts

### Renderer

Drives terminal output, input, and the render loop.

Key config (`createCliRenderer`):
- `screenMode` — `"alternate-screen"` (default), `"main-screen"`, `"split-footer"`.
- `footerHeight` (12), `targetFps` (30), `maxFps` (60), `useMouse` (true), `autoFocus` (true).
- `consoleMode` — `"console-overlay"` (default) | `"disabled"`.
- `externalOutputMode` — `"capture-stdout"` | `"passthrough"`.
- `backgroundColor`, `onDestroy`, `exitOnCtrlC`, `exitSignals`, `openConsoleOnError`.

Key properties: `root`, `width`, `height`, `console`, `keyInput`, `themeMode`,
`capabilities`, `isRunning`, `isDestroyed`, `currentFocusedRenderable`.

Render loop:
```ts
renderer.start() / renderer.stop()      // continuous mode
renderer.requestLive() / renderer.dropLive()  // animation hold
renderer.idle()                          // resolves when no render pending
renderer.pause() / resume() / suspend()
```

Events: `resize`, `frame`, `theme_mode`, `palette`, `focus`, `blur`,
`focused_renderable`, `selection`, `capabilities`, `destroy`.

Terminal integration:
```ts
renderer.setTerminalTitle("arcana")
renderer.setBackgroundColor("#0D1117")
renderer.copyToClipboardOSC52("text", ClipboardTarget.Primary)
renderer.triggerNotification("Done", "arcana")
renderer.setCursorStyle({ style: "block", blinking: true })
renderer.addInputHandler((seq) => seq === "\x1b[A")  // consume up-arrow
```

Split-footer scrollback writers (split-footer + capture-stdout):
`renderer.writeToScrollback((ctx) => ({ root, width, height }))` and
`renderer.createScrollbackSurface({...})` for streaming/highlighted output.

Theme detection: `renderer.themeMode`, `renderer.on("theme_mode", ...)`,
`await renderer.waitForThemeMode(1000)`.

### Renderables

Building blocks (`new XRenderable(renderer, props)`). Tree via `add()` / `remove()`
/ `getRenderable(id)` / `findDescendantById(id)`.

Built-ins: `BoxRenderable`, `TextRenderable`, `InputRenderable`,
`TextareaRenderable`, `SelectRenderable`, `TabSelectRenderable`,
`ScrollBoxRenderable`, `ScrollBarRenderable`, `CodeRenderable`,
`LineNumberRenderable`, `DiffRenderable`, `ASCIIFontRenderable`,
`FrameBufferRenderable`, `MarkdownRenderable`, `SliderRenderable`. QR via
`@opentui/qrcode`.

All support Yoga flexbox props (see Layout). Focus: `input.focus()/blur()`,
events `RenderableEvents.FOCUSED/BLURRED`. `hasFocusedDescendant` recolors
ancestor borders. Mouse events: `onMouseDown/Up/Move/Drag/Over/Out/Scroll`.
Visibility: `panel.visible = false` (excludes from layout, like `display:none`).
`opacity`, `zIndex`, `translateX/Y`, `buffered`, `renderBefore/After(buffer)`,
`destroy()` / `destroyRecursively()`.

### Constructs

Declarative `VNode` factory functions (`Box(...)`, `Text(...)`); children are
extra args, **not** a prop. VNodes defer instantiation until added.

```ts
function LabeledInput(props: { label: string; placeholder: string }) {
  return Box({ flexDirection: "row", gap: 1 },
    Text({ content: props.label }),
    Input({ placeholder: props.placeholder, width: 20 }))
}
renderer.root.add(LabeledInput({ label: "Name:", placeholder: "…" }))
```

`delegate({ focus: "id-input", value: "id-input" }, vnode)` routes parent
method/property calls to a descendant by id. VNodes support queued method calls
(`input.focus()` before add).

### Renderables vs Constructs

- **Imperative (Renderables):** need `RenderContext` at creation, direct mutation,
  manual nested navigation, explicit lifecycle — best for low-level/custom/hot
  components.
- **Declarative (Constructs):** no context until instantiation, queued calls,
  `delegate()` routing, React/Solid-like — best for high-level compositional UI.
- They mix freely (`container.add(Text({...}))` inside a `BoxRenderable`).

### Layout System

Yoga-based Flexbox.
- `flexDirection`: `row | column | row-reverse | column-reverse`
- `justifyContent`: `flex-start | flex-end | center | space-between | space-around | space-evenly`
- `alignItems`: `flex-start | flex-end | center | stretch | baseline`
- Sizing: fixed `width/height`, `"NN%"`, `min/max`, `flexGrow/Shrink/Basis`.
- `position: "relative" | "absolute"` + `left/top/right/bottom`.
- `padding`/`margin` (uniform, `X/Y`, per-side).
- Responsive: `renderer.on("resize", (w,h) => { ... })`.

### Keyboard Input

`renderer.keyInput.on("keypress", (key: KeyEvent) => {...})`.
`KeyEvent`: `name` (`"a"`, `"space"`, `"return"`, `"escape"`, `"f1"`, arrows),
`sequence`, `raw`, `ctrl/shift/meta/option/super/hyper`, `eventType`, `code`,
`baseCode`. Paste: `keyHandler.on("paste", (e: PasteEvent) => e.bytes)`.
Keybinding aliases map `enter→return`, `esc→escape`, numpad→main keys.

Kitty keyboard: `useKittyKeyboard: { disambiguate, alternateKeys, events, ... }`
(`{}` = defaults, `null` = off). `renderer.keyInput.on("keyrelease", ...)` when
`events: true`.

### Console Overlay

Captures `console.*` into a toggleable overlay (`consoleMode` controls only the
surface; `OTUI_USE_CONSOLE=false` disables global capture).
```ts
createCliRenderer({ consoleOptions: { position: ConsolePosition.BOTTOM, sizePercent: 30 } })
renderer.console.toggle()
```
Env: `OTUI_USE_CONSOLE=false`, `SHOW_CONSOLE=true`, `OTUI_DUMP_CAPTURES=true`.

### Notifications

```ts
if (renderer.capabilities?.notifications)
  renderer.triggerNotification("Build finished", "arcana")
```
tmux/Zellij wrappers handled internally. Env: `OPENTUI_NOTIFICATION_PROTOCOL`
(`osc9|osc777|osc99|none`), `OPENTUI_NOTIFICATIONS=0|off`.

### Colors

`RGBA` carries 8-bit RGBA + **color intent** (`rgb|indexed|default`).
- `RGBA.fromInts/Values/Hex/Index`, `RGBA.defaultForeground([snap])`, `RGBA.defaultBackground([snap])`.
- `parseColor("#hex" | name | "transparent" | RGBA)`.
- `renderer.getPalette({ size })`, `.paletteDetectionStatus`, `.clearPaletteCache()`.
- Alpha blending: `canvas.frameBuffer.setCellWithAlphaBlending(x,y,ch,fg,bg)`.

### Lifecycle and Cleanup

OpenTUI does **not** auto-clean on `process.exit`/errors — you own teardown.
```ts
try { render(() => <App/>, renderer) } finally { renderer.destroy() }
```
Options: `exitSignals`, `exitOnCtrlC`, `onDestroy`. Custom sessions:
`destroy()` before closing the transport; `exitOnCtrlC:false`, `exitSignals:[]`.
Crash recovery: run `reset`; add `uncaughtException`/`unhandledRejection` handlers.

### Native Audio

miniaudio-backed `Audio` engine.
```ts
const audio = Audio.create({ autoStart: false })
const click = await audio.loadSoundFile("click.wav")
audio.start() && audio.play(click, { volume: 0.8 })
```
32 voice slots; groups + master volume; `startMixer()` for headless; `enableTap()`
for FFT in TS.

### Testing

`@opentui/core/testing` — headless renderer.
```ts
const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({ width: 40, height: 10 })
renderer.root.add(<Text>Hello</Text>)
await renderOnce()
console.log(captureCharFrame())
```
Helpers: `flush()`, `waitFor(pred)`, `waitForFrame(t)`, `waitForVisualIdle()`,
`captureSpans()`, `resize(w,h)`, `mockInput`, `mockMouse`.

### Plugin API

Host defines named layout regions; plugins contribute UI via a shared registry.
Framework node types: Core → `BaseRenderable`, React → `ReactNode`, Solid → `JSX.Element`.

- **Core**: `createCoreSlotRegistry<TSlots,Ctx,TData>(renderer, context)`,
  `registerCorePlugin(registry, { id, order?, setup?, dispose?, slots })`,
  `SlotRenderable`, `resolveCoreSlot`. Modes: `append | replace | single_winner`.
- **React**: `createReactSlotRegistry`, `Slot`, `createSlot`, `ReactPlugin`.
- **Solid (arcana's binding)**: `createSolidSlotRegistry`, `Slot`, `createSlot`,
  `SolidPlugin`.
  ```tsx
  const registry = createSolidSlotRegistry<{ statusbar: { user: string } }, { appName: string }>(renderer, { appName: "x" })
  registry.register({ id: "clock", slots: { statusbar: (ctx, p) => <text>{`${ctx.appName}:${p.user}`}</text> } })
  const App = () => <Slot registry={registry} name="statusbar" user="sam" mode="replace"><text>fallback</text></Slot>
  render(() => <App/>, renderer)
  ```
- **Slots overview**: `createSlotRegistry(renderer, key, context)` (renderer-scoped);
  `register({ id, order?, slots })`; ordering = `order` asc → registration → id;
  modes `append/replace/single_winner`; error phases `setup|render|dispose|error_placeholder`.

---

## Components

### Text
Styled text. Props: `content` (`string` or `t\`...\`` rich), `fg`/`bg`,
`attributes` (`BOLD|ITALIC|UNDERLINE|...`), `selectable`.
```tsx
import { Text, t, bold, fg } from "@opentui/solid"
<Text content={t`${bold("Important:")} ${fg("#FF0000")("Warning!")}`} />
```

### Box
Container with border/layout. Props: `width/height` (`"NN%"` ok), `backgroundColor`,
`border`, `borderStyle` (`single|double|rounded|heavy`), `borderColor`, `title`,
`titleColor`, `padding`, `gap`, `margin`, `flexDirection`, `justifyContent`,
`alignItems`, `flexGrow`, `flexWrap`. Events: `onMouseDown/Over/Out`.

### Input
Single-line field. Props: `width`, `value`, `placeholder`, `maxLength`,
`backgroundColor`, `focusedBackgroundColor`, `textColor`, `cursorColor`.
Events: `InputRenderableEvents.INPUT/CHANGE/ENTER`.
```tsx
<Input placeholder="Name…" width={25} onInput={(v) => ...} onChange={(v) => save(v)} />
```

### Textarea
Multi-line editor (core only — no Solid wrapper yet). Props include `initialValue`,
`wrapMode` (`none|char|word`), `keyBindings`, `onSubmit`, `onContentChange`,
`selectionBg/Fg`, `cursorColor/Style`. API: `setCursor`, `selectAll`,
`insertText`, `undo/redo`, `gotoLine*`, `plainText`.

### Select
Vertical list. Props: `width/height`, `options: {name,description?,value?}[]`,
`selectedIndex`, `selectedBackgroundColor`, `showDescription`, `wrapSelection`,
`fastScrollStep`. Event `ITEM_SELECTED(index, option)`. Keys: ↑/↓, Enter.

### TabSelect
Horizontal tabs. Props: `width`, `options`, `tabWidth` (20),
`selectedBackgroundColor`, `showScrollArrows`, `showUnderline`. Event
`ITEM_SELECTED`. Keys: ←/→, Enter.

### ScrollBox
Scrollable container. Props: `scrollX/scrollY`, `stickyScroll`,
`stickyStart` (`top|bottom|left|right`), `viewportCulling`, `scrollbarOptions`,
`vertical/horizontalScrollbarOptions`. Methods: `scrollBy`, `scrollTo`,
`scrollChildIntoView(id)`, `scrollTop/Left`, `scrollWidth/Height`.
```tsx
<ScrollBox width={40} height={20} stickyScroll stickyStart="bottom">
  <Box width="100%"><Text content="Item" /></Box>
</ScrollBox>
```

### ScrollBar
Standalone scrollbar (core only). Props: `orientation`, `showArrows`,
`trackOptions`, `scrollSize`, `viewportSize`, `scrollPosition`, `scrollStep`,
`onChange(position)`.

### Slider
Draggable value (core only). Props: `orientation`, `value`, `min` (0), `max`
(100), `viewPortSize`, `backgroundColor`, `foregroundColor`, `onChange(value)`.

### Code
Tree-sitter syntax highlighting. Props: `content`, `filetype`, `syntaxStyle`
(required; `SyntaxStyle.fromStyles({...})`), `streaming`, `conceal`, `wrapMode`,
`scrollY/X`.
```tsx
const syntaxStyle = SyntaxStyle.fromStyles({ keyword: { fg: RGBA.fromHex("#FF7B72"), bold: true }, default: { fg: RGBA.fromHex("#E6EDF3") } })
<code content={'const x = "hi"'} filetype="javascript" syntaxStyle={syntaxStyle} width={50} height={12} />
```

### Markdown
Rendered markdown with highlighted code blocks. Props: `content`, `syntaxStyle`,
`conceal`, `concealCode`, `streaming`, `tableOptions`, `renderNode`.
Fence normalization: `tsx→typescriptreact`, `Dockerfile→dockerfile`.

### Line numbers
Gutter for a `CodeRenderable` (or `LineInfoProvider`). Props: `target`,
`minWidth` (3), `paddingRight`, `fg`, `bg`, `lineNumberOffset`, `hideLineNumbers`,
`lineNumbers`. Methods: `setLineColor`, `setLineSign`.

### FrameBuffer
Low-level 2D cell surface. Props: `width`+`height` (required), `respectAlpha`.
Draw on `.frameBuffer`: `setCell`, `setCellWithAlphaBlending`, `drawText`,
`fillRect`, `drawFrameBuffer`, `colorMatrix`.

### ASCIIFont
Text as ASCII art. Props: `text`, `font` (`tiny|block|shade|slick|huge|grid|pallet`),
`color`, `backgroundColor`, `selectable`, `x/y`.

### Diff
Unified/split diff viewer. Props: `diff` (unified source), `view`
(`unified|split`), `syncScroll`, `filetype`, `syntaxStyle`, `showLineNumbers`,
`addedBg/removedBg`, `wrapMode`, `conceal`.

### QR Code
Model 2 QR (`@opentui/qrcode`). Register once: `registerQRCode()`.
Props: `content`, `errorCorrectionLevel` (L/M/Q/H), `quietZone` (4), `scale` (1),
`fit` (`contain|none`), `foregroundColor`, `backgroundColor`, `fallbackContent`.

---

## Bindings

### Solid.js (`@opentui/solid`) — arcana's binding

Components (snake_case): `<text>`, `<box>`, `<scrollbox>`, `<ascii_font>`,
`<markdown>`, `<input>`, `<textarea>`, `<select>`, `<tab_select>`, `<code>`,
`<diff>`, `<line_number>`; inline `<span>`, `<strong>`, `<b>`, `<em>`, `<i>`,
`<u>`, `<br>`, `<a>`.

APIs: `render(node, config?)`, `testRender(node, opts?)`, `extend(components)`,
`getComponentCatalogue()`. Scrollback: `writeSolidToScrollback(renderer, node)`,
`createScrollbackWriter(node)`. Hooks: `useRenderer()`, `useKeyboard(handler,
{release})`, `onResize(cb)`, `useTerminalDimensions()` (signal), `usePaste(cb)`,
`useSelectionHandler(cb)`, `useTimeline(opts?)`. `<Portal mount=...>`,
`<Dynamic component=...>`.

```tsx
import { render, useKeyboard, useRenderer, createSignal } from "@opentui/solid"
const App = () => {
  const [count, setCount] = createSignal(0)
  const renderer = useRenderer()
  useKeyboard((key) => {
    if (key.name === "up") setCount((c) => c + 1)
    if (key.name === "escape") renderer.destroy()
  })
  return <box border padding={2}><text>Count: {count()}</text></box>
}
render(App)
```

### React (`@opentui/react`) — reference only

`createRoot(renderer).render(<App/>)`; `jsxImportSource: "@opentui/react"`.
Components (kebab-case); hooks `useRenderer`, `useKeyboard`, `useOnResize`,
`useTerminalDimensions`, `usePaste`, `useFocus/useBlur`, `useSelectionHandler`,
`useTimeline`. DevTools via `DEV=true`.

### Keymap

Host-agnostic binding engine (layers, commands, sequences, conditions).

- **Overview**: `new Keymap(host)`, `createOpenTuiKeymap(renderer)`,
  `createDefaultOpenTuiKeymap(...)`. `registerLayer({ bindings, commands,
  target?, targetMode?, priority, enabled })`. `registerToken`,
  `registerSequencePattern`. Dispatch walks focus/priority/conditions; sequences
  build pending; `intercept("key"|"raw")`; `getActiveKeys()`, `getCommands()`,
  `runCommand()` vs `dispatchCommand()`. Binding `key`: `"ctrl+x"`, `"dd"`,
  `"<leader>s"`, or `{name, ctrl}`; `event: "press"|"release"`; `preventDefault`,
  `fallthrough`.
- **Hosts**: `KeymapHost<TTarget,TEvent>` contract (metadata, focus, key
  events, raw input). `createOpenTuiKeymapHost(renderer)`,
  `createHtmlKeymapHost(root)`. Metadata: `platform`, `primaryModifier`
  (`super` on macOS, `ctrl` elsewhere).
- **Core**: bare engine — `registerLayer`, `setData/getData`, `getPendingSequence`,
  `parseKeySequence`, `formatKey`, `createKeyMatcher`, `getHostMetadata`,
  `RunCommandResult` (`ok|not-found|inactive|disabled|rejected|error`),
  `intercept`, `on("state"|"pendingSequence"|"dispatch"|"warning"|"error")`,
  extension points (`registerToken`, `registerLayer/Binding/CommandFields`,
  parser/expander/transformer hooks, disambiguation).
- **React**: `KeymapProvider`, `useKeymap()`, `useBindings(factory, deps?)`,
  `useActiveKeys(opts?)`, `usePendingSequence()`.
- **Solid (arcana)**: `KeymapProvider`, `useKeymap()`, `useBindings(factory)`
  (reactive `createEffect`, auto re-register), `useKeymapSelector(selector)`,
  `reactiveMatcherFromSignal(accessor, predicate?)`.
  ```tsx
  function App() {
    const [mode, setMode] = createSignal("normal")
    useBindings(() => ({
      enabled: reactiveMatcherFromSignal(mode, (v) => v === "normal"),
      commands: [{ name: "delete-line", run() {} }],
      bindings: [{ key: "x", cmd: "delete-line" }],
    }))
    const pending = useKeymapSelector((k) => k.getPendingSequence())
    return <text>Pending: {pending().length}</text>
  }
  ```
- **Built-in Addons** (`@opentui/keymap/addons`): `registerDefaultKeys()`,
  `registerEnabledFields()`, `registerLeader`, `registerEmacsBindings`,
  `registerNeovimDisambiguation({ timeoutMs: 300 })`, `registerExCommands`,
  `registerDeadBindingWarnings()`, OpenTUI addons `createTextareaBindings()`,
  `registerManagedTextareaLayer()`.
- **Custom Addons**: function `(keymap) => disposer`; use public `register*`
  only; teardown in reverse. Field compilers, binding pipeline
  (`prepend/appendBindingExpander/Parser/Transformer`), dispatch
  (`prepend/appendCommandResolver/Transformer/EventMatchResolver/DisambiguationResolver`),
  `intercept`, `acquireResource`, `createTestKeymap` for tests.

---

## Reference

### Environment Variables
Precedence: env var > config file > built-in default.

| Variable | Effect |
|---|---|
| `OPENTUI_LOG` | Log level/filter |
| `OPENTUI_CONFIG` | Config path/dir override |
| `OPENTUI_THEME` | Force theme name |
| `OPENTUI_NO_COLOR` / `OPENTUI_FORCE_COLOR` | Disable/force color |
| `OPENTUI_TERM` | Override `$TERM` for capability detection |
| `OTUI_USE_CONSOLE` | Global `console.*` capture on/off |
| `SHOW_CONSOLE` | Open console overlay at startup |
| `OTUI_DUMP_CAPTURES` | Dump captured stdout/console on exit |
| `OTUI_ALT_SCREEN` | Force alternate/main screen |
| `OTUI_OVERRIDE_STDOUT` | Force stdout routing |
| `OTUI_NO_NATIVE_RENDER` | Skip Zig/native frame renderer |
| `OPENTUI_MOUSE` | Enable/disable mouse capture |
| `OPENTUI_INPUT_TIMEOUT_MS` | Input poll/timeout |
| `OPENTUI_RENDER_BACKEND` | Backend selection (e.g. `crossterm`) |
| `OPENTUI_CACHE_DIR` | Cache dir override |

### Tree-sitter
Syntax-aware highlighting/structure via Tree-sitter grammars. Map file
extensions/shebangs to a grammar in config; highlighting updates live on
edit; custom `.scm` highlight queries override per-language styles. Unknown
languages fall back to plain text. Used by `<code>` and `<markdown>` code blocks.

### Color Matrix
Visual reference of the 16/256/truecolor palette and theme mapping. Use it to
audit FG/BG contrast and verify theme token output before committing a theme.
In truecolor mode it previews blended/gradient stops.

### Standalone Executables
Build OpenTUI as a self-contained binary (no external runtime/libs). Install the
toolchain, run the standalone build target (`--features standalone`), optionally
bundle assets/themes, copy the single binary to the target host, and run it
(config via env vars or a sidecar config). Static-link for max portability.

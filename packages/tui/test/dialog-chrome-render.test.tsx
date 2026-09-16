/**
 * Dialog family anatomy — rendered contracts.
 *
 * The family's scaffold used to be re-typed per dialog, and it had drifted:
 * body inset 2 with buttons padded 1 in one dialog and 3 in another, and the
 * escape verb spelled cancel / dismiss / close. `ui/dialog-chrome.tsx` is now the
 * one definition. These tests drive the real production entry points
 * (`DialogConfirm.show` / `DialogAlert.show` through a real `DialogProvider`) and
 * read actual rendered colors via `captureSpans`, so a regression in the shared
 * anatomy — or in the destructive fill — fails here rather than silently
 * repainting every dialog.
 *
 * Colors are compared to `fallbackTheme("dark")` because that is literally the
 * palette `ThemeProvider` resolves for the default `arcana` theme, and
 * `tokens.test.ts` pins `fallbackTheme` to `resolveTheme(DEFAULT_THEMES.arcana,
 * "dark")`.
 */
/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { onCleanup, onMount } from "solid-js"
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import { testRender, useRenderer } from "@opentui/solid"
import { ThemeProvider } from "../src/context/theme"
import { ToastProvider } from "../src/ui/toast"
import { TuiConfigProvider } from "../src/config"
import { KVProvider } from "../src/context/kv"
import { DialogProvider, useDialog } from "../src/ui/dialog"
import { OpencodeKeymapProvider, registerOpencodeKeymap } from "../src/keymap"
import { DialogAlert } from "../src/ui/dialog-alert"
import { DialogConfirm } from "../src/ui/dialog-confirm"
import { fallbackTheme, selectedForeground } from "../src/theme"
import { contrastingInk } from "../src/theme/contrast"
import { TestTuiContexts } from "./fixture/tui-environment"
import { createTuiResolvedConfig } from "./fixture/tui-runtime"

type Span = { text: string; fg: unknown; bg: unknown }

/** RGBA spans arrive as an indexed 4-byte buffer, not as floats. */
function ints(color: unknown): number[] | undefined {
  const buffer = (color as { buffer?: Record<number, number> } | undefined)?.buffer
  if (!buffer) return undefined
  return [buffer[0]!, buffer[1]!, buffer[2]!, buffer[3]!]
}

function allSpans(app: Awaited<ReturnType<typeof testRender>>): Span[] {
  return app
    .captureSpans()
    .lines.flatMap((line: { spans: Span[] }) => line.spans)
    .filter((span) => span.text.trim().length > 0)
}

function spanWith(app: Awaited<ReturnType<typeof testRender>>, needle: string): Span | undefined {
  return allSpans(app).find((span) => span.text.includes(needle))
}

/**
 * Exact-text lookup. Button labels are short and appear inside longer strings
 * elsewhere ("Delete" is also the first word of the title), so a `includes`
 * match would silently assert against the wrong element.
 */
function spanExact(app: Awaited<ReturnType<typeof testRender>>, text: string): Span | undefined {
  return allSpans(app).find((span) => span.text.trim() === text)
}

function Opener(props: { kind: "confirm" | "alert" | "destructive" | "plain" }) {
  const dialog = useDialog()
  onMount(() => {
    if (props.kind === "alert") {
      void DialogAlert.show(dialog, "Rite complete", "The export finished.")
      return
    }
    if (props.kind === "destructive") {
      void DialogConfirm.show(dialog, "Delete workspace", "This cannot be undone.", "Keep", true, "Delete")
      return
    }
    void DialogConfirm.show(dialog, "Permissions status", "Nothing waiting for approval.")
  })
  return null
}

function Tree(props: { kind: "confirm" | "alert" | "destructive" | "plain" }) {
  const renderer = useRenderer()
  const keymap = createDefaultOpenTuiKeymap(renderer)
  const resolvedConfig = createTuiResolvedConfig()
  const off = registerOpencodeKeymap(keymap, renderer, resolvedConfig)
  onCleanup(off)

  return (
    <TestTuiContexts>
      <OpencodeKeymapProvider keymap={keymap}>
        <TuiConfigProvider config={resolvedConfig}>
          <KVProvider>
            <ToastProvider>
              <ThemeProvider mode="dark">
                <DialogProvider>
                  <Opener kind={props.kind} />
                </DialogProvider>
              </ThemeProvider>
            </ToastProvider>
          </KVProvider>
        </TuiConfigProvider>
      </OpencodeKeymapProvider>
    </TestTuiContexts>
  )
}

async function renderDialog(kind: "confirm" | "alert" | "destructive" | "plain") {
  const app = await testRender(() => <Tree kind={kind} />, { width: 120, height: 40 })
  for (let attempt = 0; attempt < 50 && app.renderer.root.getChildren().length === 0; attempt++) {
    await Bun.sleep(10)
    await app.renderOnce()
  }
  for (let attempt = 0; attempt < 6; attempt++) {
    await Bun.sleep(30)
    await app.renderOnce()
  }
  return app
}

test("confirm renders the shared anatomy: title, esc hint, both actions", async () => {
  const app = await renderDialog("plain")
  try {
    const theme = fallbackTheme("dark")
    const frame = app.captureCharFrame()
    expect(frame).toContain("Permissions status")
    expect(frame).toContain("Nothing waiting for approval.")

    // Escape verb comes from the shared anatomy and is Title Case.
    expect(spanWith(app, "[esc]")?.text).toBe("[esc] Cancel")

    // The focused action carries the accent fill; the unfocused one is unfilled,
    // which renders as the card's own surface rather than the accent.
    expect(ints(spanExact(app, "Confirm")?.bg)).toEqual(theme.primary.toInts())
    expect(ints(spanExact(app, "Cancel")?.bg)).toEqual(theme.backgroundPanel.toInts())
  } finally {
    app.renderer.destroy()
  }
})

test("alert uses the single-button shape and its own escape verb", async () => {
  const app = await renderDialog("alert")
  try {
    const theme = fallbackTheme("dark")
    expect(app.captureCharFrame()).toContain("Rite complete")
    expect(spanWith(app, "[esc]")?.text).toBe("[esc] Dismiss")
    expect(ints(spanExact(app, "OK")?.bg)).toEqual(theme.primary.toInts())
  } finally {
    app.renderer.destroy()
  }
})

test("a destructive confirm fills with theme.error and stays legible", async () => {
  const app = await renderDialog("destructive")
  try {
    const theme = fallbackTheme("dark")
    const button = spanExact(app, "Delete")
    expect(button).toBeDefined()

    // Distinguishable from an ordinary confirm before it is pressed.
    expect(ints(button!.bg)).toEqual(theme.error.toInts())
    expect(ints(button!.bg)).not.toEqual(theme.primary.toInts())
    // Ink derived for that fill, not a hardcoded color.
    expect(ints(button!.fg)).toEqual(contrastingInk(theme.error).toInts())

    // The non-destructive neighbour is unaffected — `Keep` stays unfilled.
    expect(ints(spanExact(app, "Keep")?.bg)).toEqual(theme.backgroundPanel.toInts())
  } finally {
    app.renderer.destroy()
  }
})

test("an ordinary confirm is not painted as destructive", async () => {
  const app = await renderDialog("confirm")
  try {
    const theme = fallbackTheme("dark")
    const button = spanExact(app, "Confirm")
    expect(ints(button!.bg)).toEqual(theme.primary.toInts())
    expect(ints(button!.fg)).toEqual(selectedForeground(theme).toInts())
  } finally {
    app.renderer.destroy()
  }
})

const SRC = join(import.meta.dir, "../src")
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8")

/**
 * Source with comments stripped. These files *document* the conventions they
 * follow — a prose mention of `[esc]` or a migrated-away literal is not a
 * violation of the rule the prose is describing.
 */
function readCode(rel: string) {
  return read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
}

test("the anatomy consumes the Space scale rather than literals", () => {
  const chrome = read("ui/dialog-chrome.tsx")
  // Every spacing key has a consumer here — a token nobody reads is a token
  // that silently rots while the numbers get re-typed beside it.
  for (const key of ["Space.padX", "Space.padY", "Space.gap", "Space.gapWide"]) {
    expect(chrome).toContain(key)
  }
})

test("migrated dialogs use the shared anatomy instead of re-typing it", () => {
  for (const file of [
    "ui/dialog-confirm.tsx",
    "ui/dialog-alert.tsx",
    "ui/dialog-prompt.tsx",
    "ui/dialog-export-options.tsx",
    "ui/dialog-help.tsx",
    "component/dialog-status.tsx",
    "component/dialog-provider.tsx",
    "component/dialog-permissions.tsx",
    "component/dialog-arcana-oauth.tsx",
    "component/dialog-ml-data-consent.tsx",
    "component/dialog-workspace-unavailable.tsx",
    "component/dialog-session-delete-failed.tsx",
  ]) {
    const source = readCode(file)
    expect(source).toContain("DialogColumn")
    expect(source).toContain("DialogTitleRow")
    // The escape affordance is rendered by the shared hint, never typed here.
    expect(source).not.toContain("[esc]")
    expect(source).not.toContain("paddingLeft={2}")
    expect(source).not.toContain("paddingRight={2}")
  }
})

test("the escape affordance has exactly one definition in the whole source tree", () => {
  // Not just the migrated four: every `[esc] <verb>` in the app is rendered by
  // `DialogCloseHint`. Before this, the verb was spelled three ways across
  // seventeen files and the casing drifted per author.
  const offenders: string[] = []
  for (const rel of readdirSync(SRC, { recursive: true, encoding: "utf8" })) {
    const path = rel.replaceAll("\\", "/")
    if (!path.endsWith(".tsx") || path === "ui/dialog-chrome.tsx") continue
    if (readCode(path).includes("[esc]")) offenders.push(path)
  }
  expect(offenders).toEqual([])
})

test("dialog copy lives in branding, not in the dialog sources", () => {
  expect(read("ui/dialog-alert.tsx")).not.toContain('"OK"')
  expect(read("ui/dialog-prompt.tsx")).not.toContain('"Enter text…"')
  expect(read("ui/dialog-export-options.tsx")).not.toContain('"Export Options"')
  expect(read("ui/dialog-export-options.tsx")).not.toContain('"Enter filename…"')
  // Checkbox glyphs come from the shared pair so the two are always equal width.
  expect(read("ui/dialog-export-options.tsx")).not.toContain("[x]")
})

import { TextAttributes } from "@opentui/core"
import { useRenderer } from "@opentui/solid"
import { createMemo, Show } from "solid-js"
import { useTheme } from "../../context/theme"
import { DialogCloseHint, dialogCloseLabel } from "../../ui/dialog-chrome"
import { Space } from "../../ui/chrome"
import { rendererWidth } from "../../util/geometry"
import { Locale } from "../../util/locale"
import { useTerminalSize } from "../../util/terminal-size"

export type ArtifactDisplay = {
  id: string
  title: string
  content: string
  type: "markdown" | "code" | "svg" | "html" | "diagram"
  version: number
  versions: number
  tags: string[]
}

/** Columns between the header's segments; two, as `Space.gapWide` separates groups. */
const ROW_GAP = Space.gapWide
/** The `◇` mark's cell. Fixed: the artifact is never shown without its own mark. */
const MARK_WIDTH = 1
/**
 * Least the title keeps before the readout beside it is given up — `mesh` and
 * the beginning of the name, the part that tells two artifacts apart. The title
 * is what the header is *for*; the readout is a detail about it.
 */
const TITLE_MIN = 16

export function ArtifactViewer(props: { artifact: ArtifactDisplay; onClose?: () => void }) {
  const { theme, syntax } = useTheme()
  const renderer = useRenderer()
  const size = useTerminalSize(renderer)
  /** `undefined` until the renderer is laid out — zero is "unmeasured", not "narrow". */
  const termWidth = () => rendererWidth({ width: size().width })

  const content = createMemo(() => props.artifact.content)
  const readout = () => `${props.artifact.type} v${props.artifact.version}/${props.artifact.versions}`

  /**
   * Whether `type v3/7` is drawn beside the title.
   *
   * The row is one line of chrome and must stay one line at every width. Yoga
   * shares a deficit among every shrinkable child, so with all five segments
   * flexible the header did not degrade, it decoded: at 60 columns `markdown`
   * and `v3/7` each broke across two rows mid-word (`markdow` / `n`) and the
   * dismissal was cut in half vertically — `✕` on one row and `Close` under it,
   * then `Clos` / `e` at 40, `Clo` / `se` at 32, until at 24 columns the close
   * mark itself was gone and a stray `os` hung in the header.
   *
   * So the row has exactly one elastic child — the title, which truncates — and
   * every other segment is whole or absent. The readout absorbs the squeeze by
   * *being dropped*, the same trade the subagent footer makes for its chips: at
   * this width the terminal is being read for the artifact, not its version,
   * and the version has no other home only because it has no other meaning here.
   * The title then has room to keep its identity, and the dismissal — the one
   * control the row carries — is never the thing that gives way.
   *
   * An unmeasured renderer is not a narrow one, so nothing is dropped on a guess.
   */
  const showsReadout = () => {
    const width = termWidth()
    if (width === undefined) return true
    // Left to right: mark, title, readout, spacer, close — four gaps.
    const needed =
      MARK_WIDTH +
      ROW_GAP +
      TITLE_MIN +
      ROW_GAP +
      Locale.displayWidth(readout()) +
      ROW_GAP +
      ROW_GAP +
      Locale.displayWidth(dialogCloseLabel())
    return width - 2 * Space.padX >= needed
  }

  return (
    <box
      flexDirection="column"
      flexGrow={1}
      minHeight={0}
      backgroundColor={theme.background}
    >
      {/*
        Header — the artifact's mark, title and readout, with its dismissal.

        The dismissal is the family's, not a local `✕ Close` drawn by hand. This
        overlay owns the whole screen and is dismissed with escape
        (`routes/session/index.tsx` binds it), and every dialog in the app
        teaches that as `[esc] Close` — so the one surface that hid the key while
        being the most escape-dependent was the wrong one to spell it
        differently. It stays clickable: the hint carries its own `onMouseUp`.
      */}
      <box
        flexShrink={0}
        minWidth={0}
        paddingLeft={Space.padX}
        paddingRight={Space.padX}
        paddingTop={Space.padY}
        paddingBottom={Space.padY}
        border={["bottom"]}
        borderColor={theme.border}
        backgroundColor={theme.backgroundPanel}
        flexDirection="row"
        alignItems="center"
        gap={ROW_GAP}
      >
        <text fg={theme.accent} flexShrink={0} wrapMode="none">
          ◇
        </text>
        <text
          fg={theme.text}
          attributes={TextAttributes.BOLD}
          wrapMode="none"
          overflow="hidden"
          truncate
          flexShrink={1}
          minWidth={0}
        >
          {props.artifact.title}
        </text>
        {/* One node, not two: two muted nodes side by side can each break
            mid-word and cannot be given up as the single unit they read as. */}
        <Show when={showsReadout()}>
          <text fg={theme.textMuted} flexShrink={0} wrapMode="none">
            {readout()}
          </text>
        </Show>
        <box flexGrow={1} minWidth={0} />
        <Show when={props.onClose}>
          <DialogCloseHint onClose={() => props.onClose?.()} />
        </Show>
      </box>

      {/* Content area */}
      <box
        flexGrow={1}
        minHeight={0}
        paddingLeft={Space.padX}
        paddingRight={Space.padX}
        paddingTop={Space.padY}
      >
        <Show
          when={content().trim()}
          fallback={
            <text fg={theme.textMuted}>No content in this artifact yet — it may not have been written.</text>
          }
        >
          {renderContent(content(), props.artifact.type, theme, syntax())}
        </Show>
      </box>
    </box>
  )
}

function renderContent(content: string, type: string, theme: any, syntaxStyle: any) {
  // For markdown and code, use the code renderer with syntax highlighting
  if (type === "markdown" || type === "code") {
    return (
      <code
        filetype={type === "markdown" ? "markdown" : undefined}
        content={content}
        syntaxStyle={syntaxStyle}
        fg={theme.text}
        drawUnstyledText={false}
      />
    )
  }
  // For other types, show as plain text
  return (
    <text fg={theme.text} wrapMode="word">
      {content}
    </text>
  )
}

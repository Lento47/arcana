/** @jsxImportSource @opentui/solid */
import type { ColorInput, RGBA, ScrollBoxRenderable } from "@opentui/core"
import { COPY } from "../../branding"
import { Locale } from "../../util/locale"
import { dim } from "../../theme/emphasis"
import { createEffect, createMemo, createSignal, For, Match, Switch } from "solid-js"
import { buildFileTree, flattenFileTree, type FileTreeItem, type FileTreeRow } from "./diff-viewer-file-tree-utils"
import { Panel } from "./diff-viewer-ui"

const FILE_TREE_STATUS_WIDTH = 2

export type DiffViewerFileTreeTheme = {
  readonly background: RGBA
  readonly backgroundPanel: ColorInput
  readonly backgroundElement: ColorInput
  readonly primary: ColorInput
  readonly secondary: ColorInput
  readonly selectedListItemText: ColorInput
  readonly text: RGBA
  readonly textMuted: RGBA
  readonly error: ColorInput
}

export type DiffViewerFileTreeProps = {
  readonly width: number
  readonly files: readonly FileTreeItem[]
  readonly loading: boolean
  readonly error: unknown
  readonly theme: DiffViewerFileTreeTheme
  readonly focused?: boolean
  readonly highlightedNode?: number
  readonly selectedFileIndex?: number
  readonly reviewedFileNames?: ReadonlySet<string>
  readonly expandedNodes?: ReadonlySet<number>
  readonly onRowClick?: (row: FileTreeRow) => void
}

export function DiffViewerFileTree(props: DiffViewerFileTreeProps) {
  const tree = createMemo(() => buildFileTree(props.files))
  const rows = createMemo(() => flattenFileTree(tree(), props.expandedNodes))
  let scroll: ScrollBoxRenderable | undefined

  createEffect(() => {
    const node = props.highlightedNode
    if (node === undefined) return
    const selectedIndex = rows().findIndex((row) => row.id === node)
    if (selectedIndex === -1) return
    const scrollSelectedIntoView = () => scrollFileTreeRowIntoView(scroll, selectedIndex)
    scrollSelectedIntoView()
    requestAnimationFrame(scrollSelectedIntoView)
  })

  const fadedColor = () => dim(props.theme, props.theme.text, 0.75)

  return (
    <Panel border="both" width={props.width}>
      <scrollbox
        ref={(element: ScrollBoxRenderable) => (scroll = element)}
        verticalScrollbarOptions={{ visible: false }}
        horizontalScrollbarOptions={{ visible: false }}
      >
        <Switch>
          {/* The tree mounts only beside an existing snapshot, so the viewer's own
              loading/error line is never on screen at the same time as this pane. */}
          <Match when={props.loading}>
            <text fg={props.theme.textMuted}>{COPY.dialog.working}</text>
          </Match>
          <Match when={props.error}>
            <text fg={props.theme.error}>Failed to load files — reopen the viewer to retry</text>
          </Match>
          <Match when={props.files.length === 0}>
            <text fg={props.theme.text}>No files changed</text>
          </Match>
          <Match when={props.files.length > 0}>
            <For each={rows()}>
              {(row, index) => {
                const [hovered, setHovered] = createSignal(false)
                const highlighted = () => props.focused && props.highlightedNode === row.id
                const selected = () => row.fileIndex !== undefined && props.selectedFileIndex === row.fileIndex
                const reviewed = () => {
                  const file = row.fileIndex === undefined ? undefined : props.files[row.fileIndex]?.file
                  return file !== undefined && (props.reviewedFileNames?.has(file) ?? false)
                }
                const prefix = () => fileTreeRowPrefix(rows(), index(), row, props.expandedNodes)
                const status = () => fileTreeRowStatus(row, props.files, reviewed())
                const name = () =>
                  Locale.truncate(row.name, Math.max(1, props.width - FILE_TREE_STATUS_WIDTH - prefix().length))
                return (
                  <box
                    flexDirection="row"
                    width="100%"
                    backgroundColor={highlighted() ? props.theme.primary : hovered() ? props.theme.backgroundElement : undefined}
                    onMouseUp={() => props.onRowClick?.(row)}
                    onMouseOver={() => setHovered(true)}
                    onMouseOut={() => setHovered(false)}
                  >
                    <text fg={highlighted() ? props.theme.background : fadedColor()} wrapMode="none" flexShrink={0}>
                      {prefix()}
                    </text>
                    <box flexGrow={1} minWidth={0}>
                      <text
                        fg={
                          highlighted()
                            ? props.theme.background
                            : selected()
                              ? props.theme.primary
                              : reviewed() || row.kind === "directory"
                                ? props.theme.textMuted
                                : props.theme.text
                        }
                        wrapMode="none"
                      >
                        {name()}
                      </text>
                    </box>
                    <text
                      fg={highlighted() ? props.theme.background : props.theme.textMuted}
                      wrapMode="none"
                      flexShrink={0}
                    >
                      {status()}
                    </text>
                  </box>
                )
              }}
            </For>
          </Match>
        </Switch>
      </scrollbox>
    </Panel>
  )
}

function scrollFileTreeRowIntoView(scroll: ScrollBoxRenderable | undefined, index: number) {
  if (!scroll) return
  if (index < scroll.scrollTop) {
    scroll.scrollTo(index)
    return
  }
  if (index >= scroll.scrollTop + scroll.viewport.height) {
    scroll.scrollTo(index - scroll.viewport.height + 1)
  }
}

interface FileTreeGuides {
  /** Per row: does this row have a later sibling at the same depth? */
  branch: boolean[]
  /** Precomputed indentation cells (one per ancestor depth). */
  indentation: string[]
}

const fileTreeGuidesCache = new WeakMap<readonly FileTreeRow[], FileTreeGuides>()

/**
 * One pass answers "does row i have a later row at depth ≤ d" for every row:
 * a monotonic stack resolves each row's own-depth branch question, and the
 * indentation cells reuse the nearest ancestor's answer. Replaces the old
 * per-cell `rows.slice().find()` scan (O(n²) and one array copy per column).
 */
function fileTreeGuides(rows: readonly FileTreeRow[]): FileTreeGuides {
  const cached = fileTreeGuidesCache.get(rows)
  if (cached) return cached

  const branch = Array.from({ length: rows.length }, () => false)
  const stack: number[] = []
  for (let i = 0; i < rows.length; i++) {
    const depth = rows[i]!.depth
    while (stack.length > 0) {
      const top = stack[stack.length - 1]!
      if (rows[top]!.depth < depth) break
      stack.pop()
      // First later row at depth ≤ top's depth decides the branch glyph.
      branch[top] = rows[top]!.depth === depth
    }
    stack.push(i)
  }

  const indentation = Array.from({ length: rows.length }, () => "")
  const lastAtDepth: number[] = []
  for (let i = 0; i < rows.length; i++) {
    const depth = rows[i]!.depth
    let guides = ""
    for (let d = 0; d < depth; d++) {
      const ancestor = lastAtDepth[d]
      if (ancestor === undefined) {
        guides += "   "
      } else if (d === 0) {
        // Root-level gutter is one column wide (matches the root's own glyph).
        guides += branch[ancestor] ? "│  " : " "
      } else {
        guides += branch[ancestor] ? "│  " : "   "
      }
    }
    indentation[i] = guides
    lastAtDepth[depth] = i
  }

  const guides = { branch, indentation }
  fileTreeGuidesCache.set(rows, guides)
  return guides
}

function fileTreeRowPrefix(
  rows: readonly FileTreeRow[],
  index: number,
  row: FileTreeRow,
  expandedNodes: ReadonlySet<number> | undefined,
) {
  const guides = fileTreeGuides(rows)
  const indentation = guides.indentation[index] ?? ""
  const topRoot = index === 0 && row.depth === 0
  const branch = topRoot ? " " : guides.branch[index] ? "├─ " : "└─ "
  const marker = row.kind === "directory" ? (expandedNodes && !expandedNodes.has(row.id) ? "▸ " : "▾ ") : ""

  return `${indentation}${branch}${marker}`
}

function fileTreeRowStatus(row: FileTreeRow, files: readonly FileTreeItem[], reviewed: boolean) {
  if (row.fileIndex === undefined) return ""
  const status = files[row.fileIndex]?.status
  const marker = status === "modified" ? "M" : status === "added" ? "A" : status === "deleted" ? "D" : "?"
  return `${reviewed ? "✓" : " "}${marker}`.padStart(FILE_TREE_STATUS_WIDTH)
}

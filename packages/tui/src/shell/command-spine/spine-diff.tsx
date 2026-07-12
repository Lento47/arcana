import { For, Show, createMemo } from "solid-js"
import { useTheme } from "../../context/theme"
import type { SpineDiffExcerpt, SpineLayout } from "./spine-types"

type PreviewLine = {
  kind: "add" | "remove"
  text: string
}

type PreviewFile = {
  file: string
  ranges: string[]
  lines: PreviewLine[]
}

function splitFiles(files: string | undefined): string[] {
  return (files ?? "")
    .split(",")
    .map((file) => file.trim())
    .filter(Boolean)
}

function cleanFileName(value: string | undefined): string {
  return (value ?? "")
    .replace(/^[ab]\//, "")
    .replace(/^\+\+\+\s+/, "")
    .replace(/^---\s+/, "")
    .trim()
}

function formatRange(start: number, count: number | undefined) {
  const width = Math.max(1, count ?? 1)
  const end = start + width - 1
  return start === end ? `line ${start}` : `lines ${start}-${end}`
}

function parseDiffPreview(body: string, fallbackFiles: string[]): PreviewFile[] {
  const files: PreviewFile[] = []
  const byName = new Map<string, PreviewFile>()
  let current: PreviewFile | undefined
  let inHunk = false

  const ensure = (file: string | undefined) => {
    const name = cleanFileName(file) || fallbackFiles[0] || "file"
    const existing = byName.get(name)
    if (existing) {
      current = existing
      return existing
    }
    const next = { file: name, ranges: [], lines: [] }
    byName.set(name, next)
    files.push(next)
    current = next
    return next
  }

  const lines = body.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")
  for (const line of lines) {
    const git = line.match(/^diff --git\s+a\/(.*?)\s+b\/(.*)$/)
    if (git?.[2]) {
      ensure(git[2])
      inHunk = false
      continue
    }

    if (line.startsWith("+++ ")) {
      const name = cleanFileName(line.replace(/^\+\+\+\s+/, ""))
      if (name && name !== "/dev/null") ensure(name)
      continue
    }

    const hunk = line.match(/^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s*@@/)
    if (hunk) {
      const target = ensure(current?.file)
      const newStart = Number(hunk[3])
      const oldStart = Number(hunk[1])
      const newCount = hunk[4] !== undefined ? Number(hunk[4]) : undefined
      const oldCount = hunk[2] !== undefined ? Number(hunk[2]) : undefined
      target.ranges.push(formatRange(newCount === 0 ? oldStart : newStart, newCount === 0 ? oldCount : newCount))
      inHunk = true
      continue
    }

    if (!inHunk) continue
    const target = ensure(current?.file)
    if (line.startsWith("+") && !line.startsWith("+++")) {
      target.lines.push({ kind: "add", text: line.slice(1) })
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      target.lines.push({ kind: "remove", text: line.slice(1) })
    }
  }

  if (files.length) return files
  return fallbackFiles.length ? fallbackFiles.map((file) => ({ file, ranges: [], lines: [] })) : []
}

function lineLimit(layout: SpineLayout) {
  if (layout === "wide") return 18
  if (layout === "compact") return 14
  if (layout === "narrow") return 10
  return 0
}

function rangeText(file: PreviewFile) {
  if (!file.ranges.length) return "line range unavailable"
  if (file.ranges.length <= 3) return file.ranges.join(", ")
  return `${file.ranges.slice(0, 3).join(", ")} · ${file.ranges.length} regions`
}

function takePreviewLines(files: PreviewFile[], limit: number) {
  if (limit <= 0) return { lines: [] as Array<PreviewLine & { file: string }>, truncated: false }
  const lines: Array<PreviewLine & { file: string }> = []
  let total = 0
  for (const file of files) {
    for (const line of file.lines) {
      total++
      if (lines.length < limit) lines.push({ ...line, file: file.file })
    }
  }
  return { lines, truncated: total > lines.length }
}

export function SpineDiff(props: {
  diff: SpineDiffExcerpt
  layout: SpineLayout
  expanded?: boolean
}) {
  const { theme } = useTheme()
  const body = createMemo(() => props.diff.body?.trim() ?? "")
  const files = createMemo(() => splitFiles(props.diff.files))
  const preview = createMemo(() => parseDiffPreview(body(), files()))
  const changed = createMemo(() => takePreviewLines(preview(), lineLimit(props.layout)))

  if (props.layout === "minimal") {
    return <text fg={theme.spineDiffMuted as any}>{files()[0] ?? "patch"}</text>
  }

  if (!body()) {
    return (
      <box flexDirection="column" minWidth={0} flexGrow={1} flexShrink={1} width="100%">
        <For each={files().length ? files() : ["file path unavailable"]}>
          {(file) => (
            <text wrapMode="word">
              <span style={{ fg: theme.spineContext as any }}>{file}</span>
              <span style={{ fg: theme.warning as any }}> · line diff unavailable</span>
            </text>
          )}
        </For>
      </box>
    )
  }

  return (
    <box flexDirection="column" minWidth={0} flexGrow={1} flexShrink={1} width="100%">
      <For each={preview()}>
        {(file) => (
          <text wrapMode="word">
            <span style={{ fg: theme.spineContext as any }}>{file.file}</span>
            <span style={{ fg: theme.spineDiffMuted as any }}> · {rangeText(file)}</span>
          </text>
        )}
      </For>
      <Show when={props.expanded !== false}>
        <For each={changed().lines}>
          {(line) => (
            <text fg={(line.kind === "add" ? theme.spineDiffAdd : theme.spineDiffRemove) as any} wrapMode="word">
              {line.kind === "add" ? "+ " : "- "}{line.text || " "}
            </text>
          )}
        </For>
        <Show when={changed().truncated}>
          <text fg={theme.spineDiffMuted as any}>o · open full diff for remaining changes</text>
        </Show>
      </Show>
    </box>
  )
}
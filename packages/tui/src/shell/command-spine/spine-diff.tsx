import { For } from "solid-js"
import { useTheme } from "../../context/theme"
import type { SpineDiffExcerpt, SpineLayout } from "./spine-types"

export function SpineDiff(props: { diff: SpineDiffExcerpt; layout: SpineLayout }) {
  const { theme: themeObj } = useTheme()
  const t = themeObj as Record<string, unknown>

  if (props.layout === "minimal") {
    return null
  }

  if (props.layout === "narrow") {
    return (
      <box paddingLeft={2}>
        <text fg={t.textMuted as any}>
          {props.diff.files}{props.diff.stats ? ` (${props.diff.stats})` : ""}
        </text>
      </box>
    )
  }

  if (props.layout === "compact" && props.diff.body) {
    const lines = props.diff.body.split("\n").slice(0, 6)
    return (
      <box paddingLeft={2} paddingTop={1}>
        <box
          backgroundColor={t.surfaceAlt != null ? (t.surfaceAlt as any) : (t.backgroundPanel as any)}
          paddingLeft={1}
          paddingRight={1}
        >
          <For each={lines}>
            {(line: string) => {
              const isAdd = line.startsWith("+")
              const isRem = line.startsWith("-")
              const isHunk = line.startsWith("@@")
              return (
                <text
                  fg={
                    isAdd
                      ? (t.diffAdded as any)
                      : isRem
                        ? (t.diffRemoved as any)
                        : isHunk
                          ? (t.diffHunkHeader as any)
                          : (t.textMuted as any)
                  }
                  wrapMode="word"
                >
                  {line}
                </text>
              )
            }}
          </For>
        </box>
      </box>
    )
  }

  if (props.layout === "wide" && props.diff.splitBody) {
    const leftLines = props.diff.splitBody.left.split("\n")
    const rightLines = props.diff.splitBody.right.split("\n")
    return (
      <box paddingLeft={2} paddingTop={1}>
        <box flexDirection="row">
          <box
            flexGrow={1}
            backgroundColor={
              t.surfaceAlt != null ? (t.surfaceAlt as any) : (t.backgroundPanel as any)
            }
            paddingLeft={1}
            paddingRight={1}
          >
            <For each={leftLines}>
              {(line: string) => {
                const isAdd = line.startsWith("+")
                const isRem = line.startsWith("-")
                return (
                  <text
                    fg={
                      isAdd
                        ? (t.diffAdded as any)
                        : isRem
                          ? (t.diffRemoved as any)
                          : (t.textMuted as any)
                    }
                    wrapMode="word"
                  >
                    {line}
                  </text>
                )
              }}
            </For>
          </box>
          <box width={1} />
          <box
            flexGrow={1}
            backgroundColor={
              t.surfaceAlt != null ? (t.surfaceAlt as any) : (t.backgroundPanel as any)
            }
            paddingLeft={1}
            paddingRight={1}
          >
            <For each={rightLines}>
              {(line: string) => {
                const isAdd = line.startsWith("+")
                const isRem = line.startsWith("-")
                return (
                  <text
                    fg={
                      isAdd
                        ? (t.diffAdded as any)
                        : isRem
                          ? (t.diffRemoved as any)
                          : (t.textMuted as any)
                    }
                    wrapMode="word"
                  >
                    {line}
                  </text>
                )
              }}
            </For>
          </box>
        </box>
      </box>
    )
  }

  return null
}

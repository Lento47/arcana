import { createMemo, Show } from "solid-js"
import { useTheme } from "../../context/theme"

export type ArtifactDisplay = {
  id: string
  title: string
  content: string
  type: "markdown" | "code" | "svg" | "html" | "diagram"
  version: number
  versions: number
  tags: string[]
}

export function ArtifactViewer(props: { artifact: ArtifactDisplay; onClose?: () => void }) {
  const { theme, syntax } = useTheme()

  const content = createMemo(() => props.artifact.content)

  return (
    <box
      flexDirection="column"
      flexGrow={1}
      minHeight={0}
      backgroundColor={theme.background}
    >
      {/* Header with title, type, version */}
      <box
        flexShrink={0}
        paddingLeft={2}
        paddingRight={2}
        paddingTop={1}
        paddingBottom={1}
        border={["bottom"]}
        borderColor={theme.border}
        backgroundColor={theme.backgroundPanel}
        flexDirection="row"
        alignItems="center"
        gap={2}
      >
        <text fg={theme.accent}>◇</text>
        <text fg={theme.text}>
          <b>{props.artifact.title}</b>
        </text>
        <text fg={theme.textMuted}>{props.artifact.type}</text>
        <text fg={theme.textMuted}>
          v{props.artifact.version}/{props.artifact.versions}
        </text>
        <box flexGrow={1} minHeight={0} />
        <Show when={props.onClose}>
          <box onMouseUp={props.onClose}>
            <text fg={theme.textMuted}>✕ close</text>
          </box>
        </Show>
      </box>

      {/* Content area */}
      <box
        flexGrow={1}
        minHeight={0}
        paddingLeft={2}
        paddingRight={2}
        paddingTop={1}
      >
        {renderContent(content(), props.artifact.type, theme, syntax())}
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
        drawUnstyledText={true}
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

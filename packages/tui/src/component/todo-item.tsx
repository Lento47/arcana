import { useTheme } from "../context/theme"
import { StatusGlyph } from "../branding"

export interface TodoItemProps {
  status: string
  content: string
}

export function TodoItem(props: TodoItemProps) {
  const { theme } = useTheme()

  const glyph = () => {
    switch (props.status) {
      case "completed": return StatusGlyph.done
      case "in_progress": return StatusGlyph.running
      default: return StatusGlyph.pending
    }
  }

  const glyphColor = () => {
    switch (props.status) {
      case "completed": return theme.success as any
      case "in_progress": return (theme.warning ?? theme.accent) as any
      default: return theme.textMuted as any
    }
  }

  const contentStyle = () => {
    const s: Record<string, boolean> = {}
    if (props.status === "in_progress") s.bold = true
    if (props.status === "completed") s.strikethrough = true
    return s
  }

  return (
    <box flexDirection="row" gap={0}>
      <text flexShrink={0} width={2} fg={glyphColor()}>
        {glyph()}
      </text>
      <text
        flexGrow={1}
        wrapMode="word"
        fg={theme.text as any}
      >
        <span style={contentStyle()}>{props.content}</span>
      </text>
    </box>
  )
}

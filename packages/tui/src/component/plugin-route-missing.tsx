import type { MouseEvent } from "@opentui/core"
import { Space } from "../ui/chrome"
import { useTheme } from "../context/theme"

export function PluginRouteMissing(props: { id: string; onHome: () => void }) {
  const { theme } = useTheme()

  /**
   * "Go Home" is a leaf affordance and this route renders inside the app root
   * box, whose `onMouseUp` is copy-on-select (`Selection.copy`). Mouse events
   * bubble (`Renderable.processMouseEvent` walks to `this.parent` unless a
   * handler stops propagation), so the click has to be claimed here or leaving
   * this route also copies whatever the operator had selected.
   */
  const handleHomeMouseUp = (event: MouseEvent) => {
    event.stopPropagation?.()
    props.onHome()
  }

  return (
    <box width="100%" height="100%" alignItems="center" justifyContent="center" flexDirection="column" gap={Space.gap}>
      <text fg={theme.warning}>Unknown plugin route: {props.id}</text>
      <text fg={theme.textMuted}>Click Go Home to return to your session.</text>
      <box onMouseUp={handleHomeMouseUp} backgroundColor={theme.backgroundElement} paddingLeft={Space.unit} paddingRight={Space.unit}>
        <text fg={theme.text}>Go Home</text>
      </box>
    </box>
  )
}

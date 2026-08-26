import { createMarkdownCodeBlockRenderer, type CliRenderer } from "@opentui/core"
import { ganttWidget } from "./gantt"
import { statusWidget } from "./status"
import { widgetPalette } from "./palette"
import type { Theme } from "../../../theme"

export { widgetPalette } from "./palette"

/**
 * renderNode for <markdown>: intercepts ```gantt / ```status fences and renders
 * them as first-class widgets. Unknown languages fall through (undefined) so
 * default markdown rendering is untouched.
 */
export function createWidgetRenderNode(deps: {
  renderer: CliRenderer
  theme: Theme | Record<string, unknown>
}) {
  const palette = widgetPalette(deps.theme as Theme)
  return createMarkdownCodeBlockRenderer({
    gantt: (_token) => ganttWidget(deps.renderer, palette, _token.text),
    status: (_token) => statusWidget(deps.renderer, palette, _token.text),
  })
}

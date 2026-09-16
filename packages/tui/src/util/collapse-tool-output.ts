/**
 * Collapse a tool's output to a preview, and report what was left out.
 *
 * The two callers (the generic tool block and the shell block) turn this into
 * the transcript's disclosure row, and a disclosure is only honest if it says
 * how much it is hiding: `overflow` alone produced `click to expand` on a
 * one-line overrun and on a five-hundred-line one alike, which reads as the same
 * amount of missing output either way. `hiddenLines` counts the lines the
 * preview never showed.
 *
 * When the preview is cut by the character budget instead of the line budget,
 * the counted lines are still wholly unshown — the line the cut landed in is not
 * one of them — so the count stays true in both branches.
 */
export type CollapsedToolOutput = {
  output: string
  overflow: boolean
  /** Lines the preview does not show. Zero when nothing was hidden. */
  hiddenLines: number
}

export function collapseToolOutput(output: string, maxLines: number, maxChars: number): CollapsedToolOutput {
  const lines = output.split("\n")
  if (lines.length <= maxLines && Array.from(output).length <= maxChars) {
    return { output, overflow: false, hiddenLines: 0 }
  }

  const hiddenLines = Math.max(0, lines.length - maxLines)
  const preview = lines.slice(0, maxLines).join("\n")
  if (Array.from(preview).length > maxChars) {
    return {
      output:
        Array.from(preview)
          .slice(0, Math.max(0, maxChars - 1))
          .join("") + "…",
      overflow: true,
      hiddenLines,
    }
  }

  return { output: [...lines.slice(0, maxLines), "…"].join("\n"), overflow: true, hiddenLines }
}

import type { JSX } from "solid-js"
import type { RGBA } from "@opentui/core"
import open from "open"
import { useToast } from "./toast"

export interface LinkProps {
  href: string
  children?: JSX.Element | string
  fg?: RGBA
  bg?: RGBA
  width?: number | "auto" | `${number}%`
  wrapMode?: "word" | "none"
}

/**
 * Link component that renders clickable hyperlinks.
 * Clicking anywhere on the link text opens the URL in the default browser.
 */
export function Link(props: LinkProps) {
  const displayText = props.children ?? props.href
  const toast = useToast()

  return (
    <text
      fg={props.fg}
      bg={props.bg}
      width={props.width}
      wrapMode={props.wrapMode}
      onMouseUp={() => {
        // A failed open used to be swallowed silently; tell the operator what
        // to do instead of leaving the click with no visible effect.
        void open(props.href).catch(() => {
          toast.show({
            variant: "error",
            message: "Could not open the link in your browser — copy the URL and open it manually.",
          })
        })
      }}
    >
      {displayText}
    </text>
  )
}

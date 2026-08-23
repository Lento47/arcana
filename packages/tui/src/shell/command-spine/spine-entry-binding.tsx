import { Show, type Accessor } from "solid-js"
import type { SpineEntry as SpineEntryType } from "./spine-types"
import { SpineEntry } from "./spine-entry"

type SpineEntryProps = Parameters<typeof SpineEntry>[0]

export type SpineEntryBindingProps = Omit<SpineEntryProps, "entry"> & {
  getEntry: Accessor<SpineEntryType | undefined>
}

/** Keeps a stable keyed row mounted while forwarding its latest entry object. */
export function SpineEntryBinding(props: SpineEntryBindingProps) {
  return (
    <Show when={props.getEntry()}>
      {(entry) => (
        <SpineEntry
          entry={entry()}
          index={props.index}
          layout={props.layout}
          expanded={props.expanded}
          focused={props.focused}
          onToggle={props.onToggle}
          onFocus={props.onFocus}
          onHover={props.onHover}
          onContextMenu={props.onContextMenu}
          onAction={props.onAction}
          selectedAction={props.selectedAction}
          onNavigate={props.onNavigate}
          onResolveChild={props.onResolveChild}
          sessionID={props.sessionID}
          fallbackChildSessionID={props.fallbackChildSessionID}
          contentWidth={props.contentWidth}
          thinkContentWidth={props.thinkContentWidth}
          gutterWidth={props.gutterWidth}
          onDismiss={props.onDismiss}
        />
      )}
    </Show>
  )
}

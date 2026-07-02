import { Show } from "solid-js"
import type { SpineEntry as SpineEntryType, SpineLayout } from "./spine-types"
import { SpineGutter } from "./spine-gutter"
import { SpineRail } from "./spine-rail"
import { SpineNode } from "./spine-node"
import { SpineReceipt } from "./spine-receipt"
import { SpineDiff } from "./spine-diff"

export function SpineEntry(props: { entry: SpineEntryType; layout: SpineLayout }) {
  const e = props.entry

  if (e.hidden) return null

  return (
    <box flexDirection="row" paddingLeft={1}>
      <SpineGutter index={e.index} elapsed={e.elapsed} layout={props.layout} />
      <SpineRail kind={e.kind} glyph={e.glyph} layout={props.layout} />
      <box flexGrow={1} flexDirection="column">
        <SpineNode kind={e.kind} summary={e.summary} layout={props.layout} />
        <Show when={e.receipt}>
          {(r) => <SpineReceipt kind={e.kind} receipt={r()} layout={props.layout} />}
        </Show>
        <Show when={e.diff}>
          {(d) => <SpineDiff diff={d()} layout={props.layout} />}
        </Show>
      </box>
    </box>
  )
}

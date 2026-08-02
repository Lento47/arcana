import { createMemo } from "solid-js"
import type { Accessor } from "solid-js"
import { getSpineLayout, type SpineLayout } from "./spine-types"

/**
 * Reactive spine layout with hysteresis (audit S4).
 *
 * Feeds the previous layout back into `getSpineLayout` so the ±5px dead zone
 * engages at the 80/100/120 breakpoints — resizing across a boundary no
 * longer flaps layouts. Same tracked-prev pattern that was previously inlined
 * (with `as any`) in permission.tsx / question.tsx; now one shared hook.
 */
export function useSpineLayout(width: Accessor<number>): Accessor<SpineLayout> {
  let prev: SpineLayout | undefined
  return createMemo(() => {
    const next = getSpineLayout(width(), prev)
    prev = next
    return next
  })
}

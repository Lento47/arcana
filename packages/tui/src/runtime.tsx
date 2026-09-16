import path from "path"
import { displayWidth, truncateLeft } from "./util/locale"

export function abbreviateHome(input: string, home: string) {
  if (!home) return input
  const relative = path.relative(home, input)
  if (relative === "") return "~"
  if (relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) return input
  // Display paths use forward slashes on every platform (host-neutral); path.relative
  // yields backslashes on Windows, so normalize before returning.
  return "~/" + relative.split(path.sep).join("/")
}

/**
 * The tail of a path cut to `budget` columns, preferring a component boundary.
 *
 * `truncateLeft` is the plain answer and it is right most of the time, but a
 * path is one unbreakable token and a column-exact cut lands mid-name: given 7
 * columns, `/tmp/opencode/packages/tui` becomes `…s/tui`, a leaf that reads as
 * noise. Backing up to the nearest `/` spends a column or two of a fragment
 * nobody could read anyway and buys `…/tui` instead.
 *
 * The longest tail that fits wins, so the result is never wider than the budget
 * and never gives up columns it did not have to. A value with no `/` at all
 * (`~`) has no boundary to find and falls through to `truncateLeft`.
 */
export function elidePath(value: string, budget: number): string {
  if (displayWidth(value) <= budget) return value
  const segments = value.split("/")
  for (let take = segments.length - 1; take >= 1; take--) {
    const candidate = "…/" + segments.slice(segments.length - take).join("/")
    if (displayWidth(candidate) <= budget) return candidate
  }
  return truncateLeft(value, budget)
}

/**
 * The directory line the home footer draws: the path, then the branch, cut to
 * `budget` columns.
 *
 * Two names live in this string and they are not equal. The branch is short and
 * worth its columns — it is how an operator knows which line they are working
 * on — but it is a *name*, so a column-exact cut takes `arcanagov` down to
 * `anagov` and it stops being a branch at all. So the branch is kept whole or
 * not at all: it gets its columns reserved first, and it is dropped only when
 * what remains could not render a readable path leaf. That order also means the
 * path keeps more of itself whenever the branch does fit.
 */
export function directoryLabel(input: { path: string; branch?: string }, budget: number): string {
  const full = input.branch ? `${input.path}:${input.branch}` : input.path
  if (displayWidth(full) <= budget) return full
  if (!input.branch) return elidePath(input.path, budget)
  const leaf = input.path.split("/").pop() ?? input.path
  const pathBudget = budget - (1 + displayWidth(input.branch))
  if (pathBudget >= displayWidth(`…/${leaf}`)) return `${elidePath(input.path, pathBudget)}:${input.branch}`
  return elidePath(input.path, budget)
}

/**
 * Tree flattening for the kit's tree renderable.
 *
 * Rows carry their own connector glyphs, computed from the ancestor chain, so
 * the renderer is a dumb text loop. Collapsed subtrees contribute nothing.
 */

export type TreeNode = { id: string; label: string; mark?: string; children?: readonly TreeNode[] }
export type TreeRow = {
  id: string
  depth: number
  label: string
  mark?: string
  /** Connector prefix for this row (`├─ `, `└─ `, `│  ` chains). */
  rail: string
  hasChildren: boolean
  expanded: boolean
}

export function flattenTree(nodes: readonly TreeNode[], expanded: ReadonlySet<string>): TreeRow[] {
  const rows: TreeRow[] = []
  const walk = (list: readonly TreeNode[], prefix: string) => {
    list.forEach((node, index) => {
      const last = index === list.length - 1
      const hasChildren = (node.children?.length ?? 0) > 0
      const isExpanded = hasChildren && expanded.has(node.id)
      rows.push({
        id: node.id,
        depth: prefix.length / 3,
        label: node.label,
        mark: node.mark,
        rail: prefix + (last ? "└─ " : "├─ "),
        hasChildren,
        expanded: isExpanded,
      })
      if (isExpanded) walk(node.children ?? [], prefix + (last ? "   " : "│  "))
    })
  }
  walk(nodes, "")
  return rows
}

/** Ancestor chain (root first) for breadcrumbs, or [] when not found. */
export function ancestry<T extends { id: string; parentID?: string | null }>(nodes: readonly T[], id: string): T[] {
  const byID = new Map(nodes.map((node) => [node.id, node]))
  const chain: T[] = []
  let cursor = byID.get(id)
  const guard = new Set<string>()
  while (cursor && !guard.has(cursor.id)) {
    guard.add(cursor.id)
    chain.unshift(cursor)
    cursor = cursor.parentID ? byID.get(cursor.parentID) : undefined
  }
  return chain
}

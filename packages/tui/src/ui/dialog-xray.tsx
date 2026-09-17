import { createMemo, createSignal, onMount } from "solid-js"
import { useTheme } from "../context/theme"
import { useSync } from "../context/sync"
import { useRoute } from "../context/route"
import { Breadcrumbs } from "./kit/breadcrumbs"
import { Tree } from "./kit/tree-view"
import { ancestry, flattenTree, type TreeNode } from "./kit/tree"
import { DialogColumn, DialogFooter, DialogTitleRow } from "./dialog-chrome"
import { useDialog } from "./dialog"

/**
 * `/xray` — the session tree.
 *
 * The operator's map of the run: the root session, every subagent under it,
 * and where the current view sits in that tree. Marks mirror liveness: a busy
 * session leads with a dot, a waiting one with the attention glyph, a failed
 * one with a cross. This is the lineage half of the X-ray; the authority
 * chain lands when the engine exposes capability/contract linkage on entries.
 */
export function DialogXray() {
  const dialog = useDialog()
  const sync = useSync()
  const route = useRoute()
  const { theme } = useTheme()
  onMount(() => dialog.setSize("large"))

  const current = () =>
    route.data?.type === "session" ? ((route.data as { sessionID?: string }).sessionID ?? undefined) : undefined
  const sessions = () => sync.data.session ?? []
  const label = (title: string | null | undefined, id: string) =>
    (title ?? id).replace(/\s*\(@[\s\S]*$/, "") || id
  const markFor = (type: string | undefined) => {
    if (type === "busy") return "●"
    if (type === "waiting") return "△"
    if (type === "error") return "✗"
    return undefined
  }

  const [collapsed, setCollapsed] = createSignal<ReadonlySet<string>>(new Set())
  const tree = createMemo<TreeNode[]>(() => {
    const list = sessions()
    const id = current()
    if (!id) return []
    const root = ancestry(list, id)[0]
    if (!root) return []
    const build = (sessionID: string): TreeNode => {
      const node = list.find((session) => session.id === sessionID)
      const children = list
        .filter((session) => session.parentID === sessionID)
        .sort((a, b) => (a.time?.created ?? 0) - (b.time?.created ?? 0))
      return {
        id: sessionID,
        label: label(node?.title, sessionID),
        mark: markFor(sync.data.session_status[sessionID]?.type),
        children: children.map((child) => build(child.id)),
      }
    }
    return [build(root.id)]
  })

  const expanded = createMemo(() => {
    const all = new Set<string>()
    const collect = (nodes: readonly TreeNode[]) => {
      for (const node of nodes) {
        all.add(node.id)
        if (node.children) collect(node.children)
      }
    }
    collect(tree())
    for (const id of collapsed()) all.delete(id)
    return all
  })

  const rows = createMemo(() => flattenTree(tree(), expanded()))
  const crumbs = createMemo(() => {
    const id = current()
    if (!id) return []
    return ancestry(sessions(), id).map((session) => label(session.title, session.id))
  })

  return (
    <DialogColumn padBottom>
      <DialogTitleRow title="X-ray" onClose={() => dialog.clear()} />
      <Breadcrumbs items={crumbs()} />
      <Tree
        rows={rows()}
        onToggle={(id) =>
          setCollapsed((previous) => {
            const next = new Set(previous)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
          })
        }
      />
      <text fg={theme.textMuted} wrapMode="word">
        {"● busy · △ waiting · ✗ failed — click a parent to fold its subtree"}
      </text>
      <DialogFooter />
    </DialogColumn>
  )
}

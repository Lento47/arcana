/**
 * Layered layout for Mermaid flowcharts → a tone-tagged character canvas.
 *
 * Pipeline: longest-path ranks → barycenter de-crossing → lane assignment
 * for rank-skipping edges → orthogonal routing in flow coordinates →
 * screen projection (TB natively; BT flips rows, LR lays ranks along x, RL
 * flips columns) → subgraph boxes → nodes → edge labels.
 *
 * Flow coordinates keep one code path for both orientations: every polyline
 * is a list of (flow, cross) points, and glyphs resolve from screen-space
 * directions at draw time. Anything over budget returns `undefined` so the
 * fence falls back to a code block — a pathological diagram must never blow
 * the frame budget.
 */

import { displayWidth, truncate } from "../../../util/locale"
import type {
  MermaidDirection,
  MermaidEdge,
  MermaidNode,
  MermaidNodeShape,
} from "./mermaid-parse"

export type MermaidTone = "edge" | "node" | "muted"

export interface MermaidCell {
  ch: string
  tone: MermaidTone
}

export interface MermaidCanvas {
  rows: MermaidCell[][]
  width: number
  height: number
}

export interface MermaidLayoutResult {
  canvas: MermaidCanvas
  /** Edges dropped by lane/jog caps — the widget reports them as markers. */
  dropped: string[]
}

export interface MermaidFlowchart {
  direction: MermaidDirection
  nodes: MermaidNode[]
  edges: MermaidEdge[]
  subgraphs: { id: string; title: string; parent?: string }[]
}

const MAX_RANKS = 12
const MAX_LANES = 8
const MAX_JOG_ROWS = 8
const DEFAULT_MAX_WIDTH = 100
const DEFAULT_MAX_HEIGHT = 300
const MAX_LABEL_WIDTH = 48
const CROSS_GAP = 2

type ScreenDir = "N" | "S" | "E" | "W"

interface Placed {
  id: string
  lines: string[]
  shape: MermaidNodeShape
  rank: number
  /** Screen rect (top-left + size), axis-aligned in both orientations. */
  x: number
  y: number
  w: number
  h: number
  subgraph?: string
}

interface Routed {
  /** Flow-space polyline: [flow, cross] points in travel order. */
  points: Array<[number, number]>
  label?: string
  style: MermaidEdge["style"]
  lane: number
  up: boolean
  /** Travel direction along flow at the head (+1 downstream, -1 upstream). */
  headFlow: 1 | -1
  /** Screen x the head-row label needs (head + gap + text). */
  labelNeedX: number
}

// ---------------------------------------------------------------------------
// Glyph tables
// ---------------------------------------------------------------------------

const DIRS: Record<string, ScreenDir[]> = {
  "─": ["E", "W"],
  "│": ["N", "S"],
  "┌": ["S", "E"],
  "┐": ["S", "W"],
  "└": ["N", "E"],
  "┘": ["N", "W"],
  "├": ["N", "S", "E"],
  "┤": ["N", "S", "W"],
  "┬": ["S", "E", "W"],
  "┴": ["N", "E", "W"],
  "┼": ["N", "S", "E", "W"],
  "┄": ["E", "W"],
  "┆": ["N", "S"],
  "═": ["E", "W"],
  "║": ["N", "S"],
  "╔": ["S", "E"],
  "╗": ["S", "W"],
  "╚": ["N", "E"],
  "╝": ["N", "W"],
}

function compose(dirs: Set<ScreenDir>, thick: boolean, dotted: boolean): string {
  const key = [...dirs].sort().join("")
  if (thick) {
    if (key === "EW") return "═"
    if (key === "NS") return "║"
    if (key === "ES") return "╔"
    if (key === "SW") return "╗"
    if (key === "EN") return "╚"
    if (key === "NW") return "╝"
  }
  if (dotted && (key === "EW" || key === "NS")) return key === "EW" ? "┄" : "┆"
  switch (key) {
    case "EW": return "─"
    case "NS": return "│"
    case "ES": return "┌"
    case "SW": return "┐"
    case "EN": return "└"
    case "NW": return "┘"
    case "ENS": return "├"
    case "NSW": return "┤"
    case "ESW": return "┬"
    case "ENW": return "┴"
    case "ENSW": return "┼"
    default: return "┼"
  }
}

function cornerGlyph(from: ScreenDir, to: ScreenDir, style: MermaidEdge["style"]): string {
  return compose(new Set([from, to]), style === "thick", style === "dotted")
}

const FLIP_V: Record<string, string> = {
  "▼": "▲", "▲": "▼",
  "└": "┌", "┌": "└", "┘": "┐", "┐": "┘",
  "┬": "┴", "┴": "┬",
  "╭": "╰", "╮": "╯", "╰": "╭", "╯": "╭",
  "╱": "╲", "╲": "╱",
}

const FLIP_H: Record<string, string> = {
  "▶": "◀", "◀": "▶",
  "┌": "┐", "┐": "┌", "└": "┘", "┘": "└",
  "├": "┤", "┤": "├",
  "╭": "╮", "╮": "╭", "╰": "╯", "╯": "╰",
  "╱": "╲", "╲": "╱",
}

// ---------------------------------------------------------------------------
// Rank assignment + ordering
// ---------------------------------------------------------------------------

function assignRanks(nodes: MermaidNode[], edges: MermaidEdge[]): Map<string, number> | undefined {
  const ids = nodes.map((n) => n.id)
  const index = new Map(ids.map((id, i) => [id, i]))
  const incoming = new Map<string, string[]>()
  for (const id of ids) incoming.set(id, [])
  for (const edge of edges) incoming.get(edge.to)?.push(edge.from)
  const rank = new Map<string, number>()
  const remaining = new Set(ids)
  // Kahn's pass, deterministic by first-seen order.
  for (;;) {
    const ready = [...remaining]
      .filter((id) => (incoming.get(id) ?? []).every((pred) => rank.has(pred)))
      .sort((a, b) => (index.get(a) ?? 0) - (index.get(b) ?? 0))
    if (ready.length === 0) break
    for (const id of ready) {
      const preds = incoming.get(id) ?? []
      rank.set(id, preds.length === 0 ? 0 : 1 + Math.max(...preds.map((p) => rank.get(p) ?? -1)))
      remaining.delete(id)
    }
  }
  // Cycle leftovers layer above ranked predecessors in id order. Whoever of an
  // edge's endpoints ranks second lands strictly higher, so no edge ever runs
  // same-rank: downward edges route left, upward edges route right.
  for (const id of [...remaining].sort((a, b) => (index.get(a) ?? 0) - (index.get(b) ?? 0))) {
    const preds = incoming.get(id) ?? []
    const best = preds.length === 0 ? -1 : Math.max(...preds.map((p) => rank.get(p) ?? -1))
    rank.set(id, best + 1)
  }
  if (Math.max(...rank.values()) >= MAX_RANKS) return undefined
  return rank
}

function orderRanks(
  nodes: MermaidNode[],
  edges: MermaidEdge[],
  rank: Map<string, number>,
  maxRank: number,
): string[][] {
  const firstSeen = new Map(nodes.map((n, i) => [n.id, i]))
  const ranks: string[][] = Array.from({ length: maxRank + 1 }, () => [])
  for (const node of nodes) ranks[rank.get(node.id) ?? 0]!.push(node.id)

  const pos = new Map<string, number>()
  const refresh = () => {
    ranks.forEach((ids, r) => ids.forEach((id, i) => pos.set(`${r}:${id}`, i)))
  }
  const incoming = new Map<string, string[]>()
  const outgoing = new Map<string, string[]>()
  for (const node of nodes) {
    incoming.set(node.id, [])
    outgoing.set(node.id, [])
  }
  for (const edge of edges) {
    outgoing.get(edge.from)?.push(edge.to)
    incoming.get(edge.to)?.push(edge.from)
  }
  refresh()
  for (let sweep = 0; sweep < 4; sweep++) {
    const downward = sweep % 2 === 0
    for (let s = 0; s <= maxRank; s++) {
      const r = downward ? s : maxRank - s
      const ids = ranks[r]!
      const scored = ids.map((id) => {
        const neighbors = downward ? (incoming.get(id) ?? []) : (outgoing.get(id) ?? [])
        const neighborRank = downward ? r - 1 : r + 1
        const total = neighbors.reduce((sum, n) => sum + (pos.get(`${neighborRank}:${n}`) ?? 0), 0)
        const score = neighbors.length === 0 ? (pos.get(`${r}:${id}`) ?? 0) : total / neighbors.length
        return { id, score, first: firstSeen.get(id) ?? 0 }
      })
      scored.sort((a, b) => a.score - b.score || a.first - b.first)
      ranks[r] = scored.map((s) => s.id)
      refresh()
    }
  }
  return ranks
}

// ---------------------------------------------------------------------------
// Node sizes
// ---------------------------------------------------------------------------

function nodeSize(shape: MermaidNodeShape, labelWidth: number, lineCount: number): { w: number; h: number } {
  if (shape === "diamond") return { w: labelWidth + 4, h: 5 }
  if (shape === "stadium") return { w: labelWidth + 6, h: 2 + lineCount }
  return { w: labelWidth + 4, h: 2 + lineCount }
}

// ---------------------------------------------------------------------------
// Main layout
// ---------------------------------------------------------------------------

export function layoutFlowchart(
  diagram: MermaidFlowchart,
  opts?: { maxWidth?: number; maxHeight?: number },
): MermaidLayoutResult | undefined {
  // The canvas sizes to the viewport (the widget passes terminal width):
  // wrapping box art destroys it, so an over-wide diagram declines instead.
  // Height is generous — scrollback absorbs rows; width is the hard bound.
  const maxWidth = Math.max(48, Math.floor(opts?.maxWidth ?? DEFAULT_MAX_WIDTH))
  const maxHeight = Math.max(8, Math.floor(opts?.maxHeight ?? DEFAULT_MAX_HEIGHT))
  const wrapBudget = Math.max(40, maxWidth - 16)
  const horizontal = diagram.direction === "LR" || diagram.direction === "RL"
  const rank = assignRanks(diagram.nodes, diagram.edges)
  if (!rank) return undefined
  const maxRank = Math.max(...rank.values())
  const ranks = orderRanks(diagram.nodes, diagram.edges, rank, maxRank)

  const placed = new Map<string, Placed>()
  for (const node of diagram.nodes) {
    // Diamonds stay single-line (joined): a 5-row rhombus cannot stack text.
    const lines =
      node.shape === "diamond"
        ? [truncate(node.label.join(" ") || node.id, MAX_LABEL_WIDTH)]
        : node.label.length > 0
          ? node.label.map((line) => truncate(line, MAX_LABEL_WIDTH))
          : [node.id]
    const labelWidth = Math.max(...lines.map((line) => displayWidth(line)))
    const { w, h } = nodeSize(node.shape, labelWidth, lines.length)
    placed.set(node.id, {
      id: node.id, lines, shape: node.shape,
      rank: rank.get(node.id) ?? 0, x: 0, y: 0, w, h,
      subgraph: node.subgraph,
    })
  }
  // Flow-space extents: len along flow, wid across.
  const flowLen = (id: string) => {
    const node = placed.get(id)!
    return horizontal ? node.w : node.h
  }
  const crossWid = (id: string) => {
    const node = placed.get(id)!
    return horizontal ? node.h : node.w
  }

  // Lane assignment for rank-skipping edges: global interval coloring per
  // side, so a lane column stays consistent across gaps. Edges from the SAME
  // source share one lane (bus routing): a fan-out hub like Diagnose paints
  // one trunk with per-target branches instead of a wall of parallel lines.
  // The shared trunk is the union of member ranges.
  interface LaneUse { key: string; fromRank: number; toRank: number }
  const downLanes: LaneUse[][] = []
  const upLanes: LaneUse[][] = []
  const dropped: string[] = []
  interface RoutedMeta { lane: number; up: boolean }
  const metas = new Map<MermaidEdge, RoutedMeta>()

  const takeLane = (
    pools: LaneUse[][],
    key: string,
    fromRank: number,
    toRank: number,
  ): number => {
    for (let lane = 0; lane < pools.length; lane++) {
      const covering = pools[lane]!.find(
        (other) => other.key === key && other.fromRank <= fromRank && toRank <= other.toRank,
      )
      if (covering) {
        // Extending must not newly clash with another source's trunk on
        // this lane — otherwise take a fresh lane below.
        const extended = {
          fromRank: Math.min(covering.fromRank, fromRank),
          toRank: Math.max(covering.toRank, toRank),
        }
        const clash = pools[lane]!.some(
          (other) =>
            other !== covering &&
            other.key !== key &&
            extended.fromRank <= other.toRank &&
            other.fromRank <= extended.toRank,
        )
        if (!clash) {
          covering.fromRank = extended.fromRank
          covering.toRank = extended.toRank
          return lane
        }
      }
    }
    for (let lane = 0; lane < pools.length; lane++) {
      const clash = pools[lane]!.some(
        (other) => fromRank <= other.toRank && other.fromRank <= toRank,
      )
      if (!clash) {
        pools[lane]!.push({ key, fromRank, toRank })
        return lane
      }
    }
    if (pools.length >= MAX_LANES) return -1
    pools.push([{ key, fromRank, toRank }])
    return pools.length - 1
  }

  for (const edge of diagram.edges) {
    const fromRank = rank.get(edge.from) ?? 0
    const toRank = rank.get(edge.to) ?? 0
    if (toRank <= fromRank) {
      const lane = takeLane(upLanes, edge.from, toRank, fromRank)
      if (lane < 0) {
        dropped.push(`${edge.from} → ${edge.to}`)
        continue
      }
      metas.set(edge, { lane, up: true })
    } else if (toRank - fromRank > 1) {
      const lane = takeLane(downLanes, edge.from, fromRank, toRank)
      if (lane < 0) {
        dropped.push(`${edge.from} → ${edge.to}`)
        continue
      }
      metas.set(edge, { lane, up: false })
    } else {
      metas.set(edge, { lane: -1, up: false })
    }
  }

  // Cross placement per rank, centered within the widest rank: rows share
  // a visual axis, and single-node ranks (chains) line up center-to-center
  // so their edges run straight instead of jogging.
  // Ranks wider than the wrap budget wrap into stacked sub-rows: a crowded
  // rank (many disconnected nodes) would otherwise force the whole canvas
  // past the viewport width. Sub-rows restart the cursor; edges reference
  // node positions, so routing is unaffected.
  interface RankSubRow { ids: string[]; height: number; width: number }
  const leftLaneWidth = downLanes.length
  const rankSubs: RankSubRow[][] = ranks.map((ids) => {
    const rows: RankSubRow[] = []
    let cur: string[] = []
    let curW = 0
    const flush = () => {
      if (cur.length === 0) return
      rows.push({
        ids: cur,
        height: Math.max(...cur.map((id) => flowLen(id))),
        width: curW,
      })
      cur = []
      curW = 0
    }
    for (const id of ids) {
      const w = crossWid(id)
      if (cur.length > 0 && curW + CROSS_GAP + w > wrapBudget) flush()
      if (cur.length > 0) curW += CROSS_GAP
      cur.push(id)
      curW += w
    }
    flush()
    return rows
  })
  const maxSubWidth = Math.max(
    0,
    ...rankSubs.flatMap((subs) => subs.map((sub) => sub.width)),
  )
  const rankCross: number[][] = []
  ranks.forEach((ids, r) => {
    const positions: number[] = []
    let subStart = 0
    for (const sub of rankSubs[r]!) {
      const offset = Math.floor((maxSubWidth - sub.width) / 2)
      let cursor = leftLaneWidth + 1 + offset
      for (let i = 0; i < sub.ids.length; i++) {
        positions[subStart + i] = cursor
        cursor += crossWid(sub.ids[i]!) + CROSS_GAP
      }
      subStart += sub.ids.length
    }
    rankCross.push(positions)
  })
  const crossExtent = leftLaneWidth + 1 + maxSubWidth
  const rightLaneStart = crossExtent + 1

  const crossCenter = (id: string): number => {
    const node = placed.get(id)!
    const order = ranks[node.rank]!.indexOf(id)
    return rankCross[node.rank]![order]! + Math.floor(crossWid(id) / 2)
  }
  // Band flow sizes: wrapped sub-rows stack with one separator row between
  // them so adjacent boxes never touch borders.
  const bandLen: number[] = rankSubs.map((subs) =>
    subs.length === 0 ? 0 : subs.reduce((total, sub) => total + sub.height, 0) + (subs.length - 1),
  )

  // Jog demand per gap: span-1 cross edges + lane entry/exit runs.
  interface Demand { v0: number; v1: number; edge: MermaidEdge }
  const gapDemand: Demand[][] = Array.from({ length: maxRank }, () => [])
  for (const edge of diagram.edges) {
    const meta = metas.get(edge)
    if (!meta) continue // dropped
    const fromRank = rank.get(edge.from) ?? 0
    const toRank = rank.get(edge.to) ?? 0
    const vcA = crossCenter(edge.from)
    const vcB = crossCenter(edge.to)
    if (meta.up) {
      const laneV = rightLaneStart + meta.lane
      gapDemand[fromRank - 1]?.push({ v0: Math.min(vcA, laneV), v1: Math.max(vcA, laneV), edge })
      gapDemand[toRank]?.push({ v0: Math.min(vcB, laneV), v1: Math.max(vcB, laneV), edge })
    } else if (meta.lane >= 0) {
      const laneV = leftLaneWidth - meta.lane
      gapDemand[fromRank]?.push({ v0: Math.min(vcA, laneV), v1: Math.max(vcA, laneV), edge })
      gapDemand[toRank - 1]?.push({ v0: Math.min(vcB, laneV), v1: Math.max(vcB, laneV), edge })
    } else if (vcA !== vcB) {
      gapDemand[fromRank]?.push({ v0: Math.min(vcA, vcB), v1: Math.max(vcA, vcB), edge })
    }
  }

  // Greedy interval packing per gap; touching endpoints share a row (they
  // merge into tees when drawn). Overflow folds onto the last row.
  const gapRowOf: Array<Map<MermaidEdge, number>> = []
  const gapHeight: number[] = []
  for (let g = 0; g < maxRank; g++) {
    const rows: Demand[][] = []
    const rowOf = new Map<MermaidEdge, number>()
    const sorted = [...gapDemand[g]!].sort((a, b) => a.v0 - b.v0 || a.v1 - b.v1)
    for (const item of sorted) {
      let row = rows.findIndex(
        (members) => !members.some((other) => item.v0 < other.v1 && other.v0 < item.v1),
      )
      if (row < 0) {
        row = rows.length < MAX_JOG_ROWS ? rows.length : rows.length - 1
        if (row === rows.length) rows.push([])
      }
      rows[row]!.push(item)
      if (!rowOf.has(item.edge)) rowOf.set(item.edge, row)
    }
    gapRowOf.push(rowOf)
    gapHeight.push(1 + rows.length)
  }

  // Flow positions: rank bands then gaps (last gap row is the head row).
  const rankFlow: number[] = []
  const gapStart: number[] = []
  {
    let flow = 0
    for (let r = 0; r <= maxRank; r++) {
      rankFlow.push(flow)
      flow += bandLen[r]!
      if (r < maxRank) {
        gapStart.push(flow)
        flow += gapHeight[r]!
      }
    }
  }

  // Place nodes, centered in their sub-row along the flow axis.
  const subFlowOffset = new Map<string, number>()
  ranks.forEach((ids, r) => {
    let offset = rankFlow[r]!
    for (const sub of rankSubs[r]!) {
      for (const id of sub.ids) subFlowOffset.set(id, offset)
      offset += sub.height + 1
    }
  })
  ranks.forEach((ids, r) => {
    ids.forEach((id, order) => {
      const node = placed.get(id)!
      const cross = rankCross[r]![order]!
      const len = flowLen(id)
      const sub = rankSubs[r]!.find((s) => s.ids.includes(id))!
      const start = (subFlowOffset.get(id) ?? rankFlow[r]!) + Math.floor((sub.height - len) / 2)
      if (horizontal) {
        node.x = start
        node.y = cross
      } else {
        node.x = cross
        node.y = start
      }
    })
  })

  const nodeFlowStart = (id: string): number => {
    const node = placed.get(id)!
    return horizontal ? node.x : node.y
  }
  const nodeFlowLen = (id: string): number => {
    const node = placed.get(id)!
    return horizontal ? node.w : node.h
  }

  // Resolve polylines in flow coordinates.
  const routed: Routed[] = []
  for (const edge of diagram.edges) {
    const meta = metas.get(edge)
    if (!meta) continue
    const fromRank = rank.get(edge.from) ?? 0
    const toRank = rank.get(edge.to) ?? 0
    const vcA = crossCenter(edge.from)
    const vcB = crossCenter(edge.to)
    const fsA = nodeFlowStart(edge.from)
    const fsB = nodeFlowStart(edge.to)
    const lenA = nodeFlowLen(edge.from)
    const pts: Array<[number, number]> = []
    if (meta.up) {
      const laneV = rightLaneStart + meta.lane
      const entryU = gapStart[fromRank - 1]! + (gapRowOf[fromRank - 1]?.get(edge) ?? 0)
      const exitU = gapStart[toRank]! + (gapRowOf[toRank]?.get(edge) ?? 0)
      pts.push([fsA - 1, vcA], [entryU, vcA], [entryU, laneV], [exitU, laneV], [exitU, vcB], [fsB + nodeFlowLen(edge.to), vcB])
    } else if (meta.lane >= 0) {
      const laneV = leftLaneWidth - meta.lane
      const entryU = gapStart[fromRank]! + (gapRowOf[fromRank]?.get(edge) ?? 0)
      const exitU = gapStart[toRank - 1]! + (gapRowOf[toRank - 1]?.get(edge) ?? 0)
      pts.push(
        [fsA + lenA, vcA],
        [entryU, vcA],
        [entryU, laneV],
        [exitU, laneV],
        [exitU, vcB],
        [fsB - 1, vcB],
      )
    } else {
      const headU = fsB - 1
      pts.push([fsA + lenA, vcA])
      if (vcA !== vcB) {
        const jogU = gapStart[fromRank]! + (gapRowOf[fromRank]?.get(edge) ?? 0)
        pts.push([jogU, vcA], [jogU, vcB])
      }
      pts.push([headU, vcB])
    }
    // Collapse zero-length joints (entry on the port row) so corners only
    // ever join real direction changes. A one-cell edge keeps its single
    // point; the head resolves from travel direction, not segment geometry.
    const deduped = pts.filter((pt, i) => i === 0 || pt[0] !== pts[i - 1]![0] || pt[1] !== pts[i - 1]![1])
    const labelText = edge.label ? truncate(edge.label, 40) : undefined
    const [hxf, hcf] = deduped[deduped.length - 1]!
    // Head-row label room (`▼ label`): the canvas widens for it below.
    // (`project` is declared later; the mapping is trivially inline here.)
    const hxs = horizontal ? hxf : hcf
    routed.push({
      points: deduped,
      label: labelText,
      style: edge.style,
      lane: meta.lane,
      up: meta.up,
      headFlow: meta.up ? -1 : 1,
      // Head-row label room (`▼ label`): the canvas widens for it below.
      // Labels past the cap are skipped at draw time, never fatal.
      labelNeedX: labelText ? hxs + 2 + displayWidth(` ${labelText} `) : 0,
    })
  }

  // Subgraph top borders need a row above rank 0: without it the border
  // clamps onto member rows and titles paint under node boxes. Shift the
  // whole layout one cell along flow when a top-level box touches the edge.
  const topBoxes = diagram.subgraphs.filter((s) => !s.parent)
  if (topBoxes.length > 0) {
    const parentOfTop = new Map(diagram.subgraphs.map((sg) => [sg.id, sg.parent]))
    const inTop = (sub: string | undefined): boolean => {
      let current = sub
      while (current) {
        if (topBoxes.some((sg) => sg.id === current)) return true
        current = parentOfTop.get(current)
      }
      return false
    }
    const starts = [...placed.values()].filter((n) => inTop(n.subgraph)).map((n) => (horizontal ? n.x : n.y))
    if (starts.length > 0 && Math.min(...starts) === 0) {
      for (const node of placed.values()) {
        if (horizontal) node.x += 1
        else node.y += 1
      }
      for (let r = 0; r < rankFlow.length; r++) rankFlow[r]! += 1
      for (let g = 0; g < gapStart.length; g++) gapStart[g]! += 1
    }
  }

  // Subgraph box geometries resolve BEFORE allocation: wide titles widen
  // the canvas instead of clipping. Titles cap at 40 columns.
  const parentOf = new Map(diagram.subgraphs.map((sg) => [sg.id, sg.parent]))
  const descendantOf = (nodeSub: string | undefined, top: string): boolean => {
    let current = nodeSub
    while (current) {
      if (current === top) return true
      current = parentOf.get(current)
    }
    return false
  }
  interface BoxGeom { x0: number; y0: number; x1: number; y1: number; title: string }
  const boxes: BoxGeom[] = []
  for (const sg of diagram.subgraphs.filter((s) => !s.parent)) {
    const members = [...placed.values()].filter((n) => descendantOf(n.subgraph, sg.id))
    if (members.length === 0) continue
    // Widen narrow boxes so the title fits: a title that cannot paint is a
    // missing label, and single-node subgraphs are the common case.
    const title = truncate(sg.title, 40)
    const titleW = displayWidth(title)
    const x0 = Math.max(0, Math.min(...members.map((n) => n.x)) - 1)
    const y0 = Math.max(0, Math.min(...members.map((n) => n.y)) - 1)
    const naturalX1 = Math.max(...members.map((n) => n.x + n.w - 1)) + 1
    const x1 = Math.max(naturalX1, x0 + titleW + 5)
    const y1 = Math.max(...members.map((n) => n.y + n.h - 1)) + 1
    boxes.push({ x0, y0, x1, y1, title })
  }
  const boxNeed = boxes.reduce((max, b) => Math.max(max, b.x1 + 1), 0)

  // Allocate + draw.
  const crossNeed = crossExtent + upLanes.length + 2
  const flowNeed = (rankFlow[maxRank] ?? 0) + (bandLen[maxRank] ?? 0) + 1
  const labelNeed = routed.reduce((max, e) => Math.max(max, e.labelNeedX + 1), 0)
  // Node-driven overflow declines (nodes cannot shrink); label room only
  // extends up to the cap — labels past it are skipped at draw time.
  // Node-driven overflow declines (nodes cannot shrink); label room only
  // extends up to the cap — labels past it are skipped at draw time.
  const nodeWidth = horizontal ? flowNeed : crossNeed
  const nodeHeight = horizontal ? crossNeed : flowNeed
  if (nodeWidth > maxWidth || nodeHeight > maxHeight || nodeWidth <= 0 || nodeHeight <= 0) {
    return undefined
  }
  // Labels and subgraph boxes extend the canvas up to the cap; past it they
  // are skipped at draw time (labels) or decline the diagram (boxes cannot
  // shrink — but titles already cap at 40 columns, so this is pathological).
  const width = horizontal
    ? nodeWidth
    : Math.min(Math.max(crossNeed, labelNeed, boxNeed), maxWidth)
  const height = nodeHeight
  if (width < boxNeed) return undefined
  if (width > maxWidth || height > maxHeight || width <= 0 || height <= 0) {
    return undefined
  }

  const project = (f: number, c: number): [number, number] =>
    horizontal ? [f, c] : [c, f]

  const grid: MermaidCell[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({ ch: " ", tone: "edge" as MermaidTone })),
  )
  const inBounds = (x: number, y: number) => y >= 0 && y < height && x >= 0 && x < width

  const putLine = (x: number, y: number, dir: ScreenDir, style: MermaidEdge["style"]) => {
    if (!inBounds(x, y)) return
    const cell = grid[y]![x]!
    if (cell.ch !== " " && !(cell.ch in DIRS)) return // never paint over text/heads
    const set = new Set<ScreenDir>([...(DIRS[cell.ch] ?? []), ...lineDirs(dir)])
    const thick = style === "thick" || /[═║╔╗╚╝]/.test(cell.ch)
    const dotted = (style === "dotted" || /[┄┆]/.test(cell.ch)) && !thick
    cell.ch = compose(set, thick, dotted)
    cell.tone = "edge"
  }

  const lineDirs = (dir: ScreenDir): ScreenDir[] =>
    dir === "N" || dir === "S" ? ["N", "S"] : ["E", "W"]

  const drawSegment = (x0: number, y0: number, x1: number, y1: number, style: MermaidEdge["style"]) => {
    if (x0 !== x1 && y0 !== y1) return // polylines are orthogonal by construction
    const dx = Math.sign(x1 - x0)
    const dy = Math.sign(y1 - y0)
    const dir: ScreenDir = dx !== 0 ? (dx > 0 ? "E" : "W") : dy > 0 ? "S" : "N"
    let x = x0
    let y = y0
    for (;;) {
      putLine(x, y, dir, style)
      if (x === x1 && y === y1) break
      x += dx
      y += dy
    }
  }

  const putHead = (x: number, y: number, dir: ScreenDir) => {
    if (!inBounds(x, y)) return
    grid[y]![x]! = { ch: dir === "S" ? "▼" : dir === "N" ? "▲" : dir === "E" ? "▶" : "◀", tone: "edge" }
  }

  for (const routedEdge of routed) {
    const screen = routedEdge.points.map(([f, c]) => project(f, c))
    for (let i = 0; i < screen.length - 1; i++) {
      const [x0, y0] = screen[i]!
      const [x1, y1] = screen[i + 1]!
      // Joints already carry their corner: resume drawing from the next cell
      // so the segment cannot upgrade the corner into a tee. Straight
      // pass-throughs draw no corner, so they start at the joint itself.
      const dx = Math.sign(x1 - x0)
      const dy = Math.sign(y1 - y0)
      let drewCorner = false
      if (i > 0) {
        const [px, py] = screen[i - 1]!
        const dIn: ScreenDir = px === x0 ? (py < y0 ? "S" : "N") : px < x0 ? "E" : "W"
        const dOut: ScreenDir = x1 === x0 ? (y1 < y0 ? "N" : "S") : x1 < x0 ? "W" : "E"
        const straight =
          dIn === dOut ||
          (dIn === "N" && dOut === "S") || (dIn === "S" && dOut === "N") ||
          (dIn === "E" && dOut === "W") || (dIn === "W" && dOut === "E")
        if (!straight && inBounds(x0, y0)) {
          const cell = grid[y0]![x0]!
          if (cell.ch === " " || cell.ch in DIRS) {
            cell.ch = cornerGlyph(dIn, dOut, routedEdge.style)
            cell.tone = "edge"
            drewCorner = true
          }
        }
      }
      const sx = drewCorner ? x0 + dx : x0
      const sy = drewCorner ? y0 + dy : y0
      if (sx === x1 && sy === y1) {
        putLine(sx, sy, dx !== 0 ? (dx > 0 ? "E" : "W") : dy > 0 ? "S" : "N", routedEdge.style)
      } else {
        drawSegment(sx, sy, x1, y1, routedEdge.style)
      }
    }
    // Head resolves from travel direction, not segment geometry: one-cell
    // edges collapse to a single point and still need their head.
    if (routedEdge.style !== "open" && screen.length > 0) {
      const [hx, hy] = screen[screen.length - 1]!
      const dir: ScreenDir =
        horizontal
          ? routedEdge.headFlow > 0 ? "E" : "W"
          : routedEdge.headFlow > 0 ? "S" : "N"
      putHead(hx, hy, dir)
    }
  }

  // Subgraph boxes: under nodes, over edges (lines pass behind borders).
  // Titles paint in their own pass after ALL borders: box rectangles can
  // cross each other on crowded diagrams, and the crossing border must not
  // eat a title character — text outranks chrome.
  const putBox = (x: number, y: number, ch: string) => {
    if (inBounds(x, y)) grid[y]![x]! = { ch, tone: "muted" }
  }
  const boxTitles: Array<{ x0: number; y0: number; x1: number; title: string }> = []
  for (const box of boxes) {
    const { x0, y0, x1, y1 } = box
    for (let x = x0; x <= x1; x++) {
      putBox(x, y0, x === x0 ? "┌" : x === x1 ? "┐" : "─")
      putBox(x, y1, x === x0 ? "└" : x === x1 ? "┘" : "─")
    }
    for (let y = y0 + 1; y < y1; y++) {
      putBox(x0, y, "│")
      putBox(x1, y, "│")
    }
    if (x1 - x0 >= 4) {
      boxTitles.push({ x0, y0, x1, title: box.title })
    }
  }
  for (const { x0, y0, x1, title } of boxTitles) {
    const label = `─ ${truncate(title, Math.max(1, x1 - x0 - 5))} `
    // Only border chrome (muted) and blanks may yield: node borders, edge
    // lines and other text block the title rather than being eaten by it.
    const clearAt = (s: number): boolean => {
      for (let i = 0; i < label.length; i++) {
        if (!inBounds(s + i, y0)) return false
        const cell = grid[y0]![s + i]!
        if (cell.ch !== " " && (cell.tone !== "muted" || !(cell.ch in DIRS))) return false
      }
      return true
    }
    // Slide right past other titles sharing this border row: two labels on
    // one rule read fine, overwritten text does not.
    let start = -1
    for (let s = x0 + 2; s + label.length <= x1 && start < 0; s++) {
      if (clearAt(s)) start = s
    }
    if (start < 0) continue
    for (let i = 0; i < label.length && start + i < x1; i++) {
      putBox(start + i, y0, label[i]!)
    }
  }

  // Nodes overwrite everything beneath.
  for (const node of placed.values()) drawNode(node, grid, inBounds)

  function drawNode(node: Placed, grid: MermaidCell[][], inBounds: (x: number, y: number) => boolean) {
    const put = (x: number, y: number, ch: string) => {
      if (inBounds(x, y)) grid[y]![x]! = { ch, tone: "node" }
    }
    const putText = (x: number, y: number, text: string) => {
      let cx = x
      for (const ch of text) {
        put(cx, y, ch)
        cx += displayWidth(ch) > 1 ? 2 : 1
      }
    }
    const { x, y, w, h, lines, shape } = node
    const labelW = w - 4
    if (shape === "diamond") {
      const label = lines[0] ?? ""
      const labelWidth = displayWidth(label)
      // 5-row diamond, widest at the label row; 45° slopes both sides.
      putText(x, y + 2, `╱ ${label} ╲`)
      putText(x + 1, y + 1, `╱${" ".repeat(labelWidth)}╲`)
      putText(x + 1, y + 3, `╲${" ".repeat(labelWidth)}╱`)
      putText(x + 2, y, `╱${" ".repeat(Math.max(0, labelWidth - 2))}╲`)
      putText(x + 2, y + 4, `╲${" ".repeat(Math.max(0, labelWidth - 2))}╱`)
      return
    }
    const rounded = shape !== "rect"
    const [tl, hbar, tr, ml, mr, bl, br] = rounded
      ? (["╭", "─", "╮", "│", "│", "╰", "╯"] as const)
      : (["┌", "─", "┐", "│", "│", "└", "┘"] as const)
    put(x, y, tl)
    putText(x + 1, y, hbar.repeat(w - 2))
    put(x + w - 1, y, tr)
    lines.forEach((line, i) => {
      const row = y + 1 + i
      put(x, row, ml)
      putText(x + 1, row, ` ${line}${" ".repeat(Math.max(0, labelW - displayWidth(line)))} `)
      put(x + w - 1, row, mr)
    })
    put(x, y + h - 1, bl)
    putText(x + 1, y + h - 1, hbar.repeat(w - 2))
    put(x + w - 1, y + h - 1, br)
  }

  // Edge labels last (horizontal text always): centered over the longest
  // straight run, or beside a vertical run. Only onto free/line cells —
  // never over borders, heads, or other text.
  const runFree = (x: number, y: number, len: number): boolean => {
    for (let i = 0; i < len; i++) {
      if (!inBounds(x + i, y)) return false
      const cell = grid[y]![x + i]!
      if (cell.tone !== "edge" && cell.ch !== " ") return false
      if (cell.ch !== " " && !(cell.ch in DIRS)) return false
    }
    return true
  }
  const putLabel = (x: number, y: number, text: string) => {
    let cx = x
    for (const ch of text) {
      if (!inBounds(cx, y)) break
      grid[y]![cx]! = { ch, tone: "muted" }
      cx += displayWidth(ch) > 1 ? 2 : 1
    }
  }
  for (const routedEdge of routed) {
    if (!routedEdge.label) continue
    const screen = routedEdge.points.map(([f, c]) => project(f, c))
    // Horizontal runs, longest first, then vertical runs (head row first).
    interface Run { x0: number; y0: number; x1: number; y1: number; len: number; horizontal: boolean }
    const runs: Run[] = []
    for (let i = 0; i < screen.length - 1; i++) {
      const [x0, y0] = screen[i]!
      const [x1, y1] = screen[i + 1]!
      runs.push({ x0, y0, x1, y1, len: Math.abs(x1 - x0) + Math.abs(y1 - y0), horizontal: y0 === y1 })
    }
    runs.sort((a, b) => Number(b.horizontal) - Number(a.horizontal) || b.len - a.len)
    const text = ` ${routedEdge.label} `
    const textW = displayWidth(text)
    const [hx, hy] = screen[screen.length - 1]!
    // One-cell edges have no runs at all: the head row is their only slot.
    if (runs.length === 0) {
      if (runFree(hx + 2, hy, textW)) putLabel(hx + 2, hy, text)
      continue
    }
    for (const run of runs) {
      if (run.horizontal) {
        const runLen = Math.abs(run.x1 - run.x0) + 1
        if (textW + 2 > runLen) continue
        const startX = Math.min(run.x0, run.x1) + Math.floor((runLen - textW) / 2)
        if (runFree(startX, run.y0, textW)) {
          putLabel(startX, run.y0, text)
          break
        }
      } else {
        // Head row first (`▼ label` reads as one unit), then the midpoint.
        const midY = Math.floor((run.y0 + run.y1) / 2)
        const placedLabel =
          runFree(hx + 2, hy, textW)
            ? (putLabel(hx + 2, hy, text), true)
            : runFree(run.x0 + 2, midY, textW)
              ? (putLabel(run.x0 + 2, midY, text), true)
              : false
        if (placedLabel) break
      }
    }
  }

  // Tight frame: trim all-space trailing columns/rows.
  let trimW = 0
  let trimH = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (grid[y]![x]!.ch !== " ") {
        trimW = Math.max(trimW, x + 1)
        trimH = Math.max(trimH, y + 1)
      }
    }
  }
  let rows = grid.slice(0, Math.max(trimH, 1)).map((row) => row.slice(0, Math.max(trimW, 1)))

  const flip = diagram.direction === "BT" ? FLIP_V : diagram.direction === "RL" ? FLIP_H : undefined
  if (flip) {
    rows = diagram.direction === "BT" ? [...rows].reverse() : rows.map((row) => [...row].reverse())
    for (const row of rows) {
      for (const cell of row) cell.ch = flip[cell.ch] ?? cell.ch
    }
  }
  return { canvas: { rows, width: rows[0]?.length ?? 0, height: rows.length }, dropped }
}

export function canvasText(canvas: MermaidCanvas): string[] {
  return canvas.rows.map((row) => row.map((cell) => cell.ch).join("").replace(/\s+$/, ""))
}

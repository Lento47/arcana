// One-off: parse a V8 .heapsnapshot and report top allocation types by retained size.
// Usage: bun run scripts/heap-analyze.ts <file.heapsnapshot>
import { readFileSync } from "node:fs"

const file = process.argv[2]
if (!file) {
  console.error("usage: bun run scripts/heap-analyze.ts <file.heapsnapshot>")
  process.exit(1)
}

const snap = JSON.parse(readFileSync(file, "utf8"))
const nodes = snap.nodes
const edges = snap.edges
const strings = snap.strings
const nodeFields = snap.snapshot.meta.node_fields
const edgeFields = snap.snapshot.meta.edge_fields
const nodeTypes = snap.snapshot.meta.node_types[0]

const ni = (name: string) => nodeFields.indexOf(name)
const ei = (name: string) => edgeFields.indexOf(name)
const NODE_TYPE = ni("type")
const NODE_NAME = ni("name")
const NODE_ID = ni("id")
const NODE_SELF = ni("self_size")
const NODE_EDGE = ni("edge_count")
const EDGE_TYPE = ei("type")
const EDGE_NAME = ei("name_or_index")
const EDGE_TO = ei("to_node")

const nodeCount = nodes.length / nodeFields.length
const edgeCount = edges.length / edgeFields.length

// retained size via reverse-edge traversal (approximate: sum self of reachable)
// Build adjacency: for each node, list of outgoing edge targets.
const out = new Array<number[]>(nodeCount)
for (let i = 0; i < nodeCount; i++) out[i] = []
for (let e = 0; e < edgeCount; e++) {
  const from = Math.floor((e * edgeFields.length) / edgeFields.length)
  const toNode = edges[e * edgeFields.length + EDGE_TO] / edgeFields.length
  const fromNode = e // edges are grouped by node in order
  // to_node is a node index * nodeFields.length
  const toIdx = edges[e * edgeFields.length + EDGE_TO] / nodeFields.length
  // from node = the node whose edge list we're in; compute via edge order
  void fromNode
  void toNode
  if (toIdx >= 0 && toIdx < nodeCount) {
    // find owner: edges are stored per-node in node order
    // owner = the node whose edge_count covers this edge index
    // simpler: iterate nodes, track edge cursor
  }
}

// Simpler correct approach: iterate nodes, each node has edge_count edges starting at cursor.
const byType = new Map<string, { count: number; self: number }>()
let cursor = 0
for (let n = 0; n < nodeCount; n++) {
  const type = nodeTypes[nodes[n * nodeFields.length + NODE_TYPE]]
  const name = strings[nodes[n * nodeFields.length + NODE_NAME]]
  const self = nodes[n * nodeFields.length + NODE_SELF]
  const ec = nodes[n * nodeFields.length + NODE_EDGE]
  const key = type === "object" ? name : type
  const rec = byType.get(key) ?? { count: 0, self: 0 }
  rec.count++
  rec.self += self
  byType.set(key, rec)
  cursor += ec
}

const sorted = [...byType.entries()].sort((a, b) => b[1].self - a[1].self).slice(0, 30)
console.log(`nodes=${nodeCount} edges=${edgeCount}`)
console.log("Top types by self size:")
for (const [type, { count, self }] of sorted) {
  console.log(`  ${String(type).padEnd(40)} ${String(count).padStart(8)}  ${(self / 1024 / 1024).toFixed(2)}MB`)
}

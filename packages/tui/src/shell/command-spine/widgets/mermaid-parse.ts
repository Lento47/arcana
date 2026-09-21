/**
 * Mermaid flowchart parser for the `mermaid` chat widget.
 *
 * Pure and tolerant like the other widget DSL parsers: malformed statements
 * land in `badLines` and render as marker rows, never throws. The supported
 * subset is `graph`/`flowchart` only — sequence/class/pie/git/mindmap and
 * oversized graphs return `unsupported` so the fence falls back to a code
 * block (the renderer treats anything but `flowchart` as "not mine").
 *
 * Covered syntax:
 * - `graph TB|TD|BT|LR|RL` / `flowchart …` (TD aliases TB)
 * - Node shapes: `[rect]`, `(round)`, `([stadium])`, `[(stadium)]`,
 *   `{diamond}`, `((circle→round))`, `[[subroutine→rect]]`, `[/parallelogram→rect]`
 * - Edges: `-->`, `---`, `-.->`, `==>` (+ `o`/`x` endpoint markers, folded to
 *   the base kind), labels `-- text -->` and `-->|text|`
 * - Chains (`A --> B --> C`) and fan-out (`A --> B & C`, `A & B --> C`)
 * - `subgraph id[Title]` … `end` (one rendered level; deeper nesting groups
 *   into its top-level ancestor), `direction` at top level
 * - `%%` comments, `%%{…}%%` directives, `class`/`classDef`/`style`/
 *   `linkStyle`/`click`/`accTitle`/`accDescr` (skipped, not errors)
 */

export type MermaidDirection = "TB" | "BT" | "LR" | "RL"

export type MermaidNodeShape = "rect" | "round" | "stadium" | "diamond" | "circle"

export interface MermaidNode {
  id: string
  label: string
  shape: MermaidNodeShape
  /** Innermost enclosing subgraph id, if any. */
  subgraph?: string
}

export type MermaidEdgeStyle = "solid" | "dotted" | "thick" | "open"

export interface MermaidEdge {
  from: string
  to: string
  label?: string
  style: MermaidEdgeStyle
}

export interface MermaidSubgraph {
  id: string
  title: string
  parent?: string
}

export type MermaidDiagram =
  | {
      type: "flowchart"
      direction: MermaidDirection
      nodes: MermaidNode[]
      edges: MermaidEdge[]
      subgraphs: MermaidSubgraph[]
      /** Statements that matched nothing — rendered as `? …` marker rows. */
      badLines: string[]
    }
  | { type: "unsupported"; kind: string }

export const MERMAID_LIMITS = {
  maxNodes: 40,
  maxEdges: 80,
  maxLabelChars: 64,
  maxBadLines: 8,
} as const

const DIRECTIONS: Record<string, MermaidDirection> = {
  TB: "TB",
  TD: "TB",
  BT: "BT",
  LR: "LR",
  RL: "RL",
}

const UNSUPPORTED_KINDS = new Set([
  "sequencediagram",
  "classdiagram",
  "classdiagram-v2",
  "statediagram",
  "statediagram-v2",
  "erdiagram",
  "gantt",
  "pie",
  "gitgraph",
  "mindmap",
  "timeline",
  "zenuml",
  "sankey-beta",
  "xychart-beta",
  "block-beta",
  "packet-beta",
  "kanban",
  "architecture-beta",
  "radar-beta",
  "treemap-beta",
])

const SKIPPED_STATEMENTS =
  /^(class|classDef|style|linkStyle|click|accTitle|accDescr|title)\b/i

// Ids may contain hyphens (`my-node`), but a hyphen run must be followed by
// a word char — otherwise `A-->B` lexes the id as `A--` and the arrow dies.
const ID_RE = /^[A-Za-z0-9_]+(?:-[A-Za-z0-9_]+)*/

function truncateLabel(label: string): string {
  const chars = Array.from(label)
  if (chars.length <= MERMAID_LIMITS.maxLabelChars) return label
  return `${chars.slice(0, MERMAID_LIMITS.maxLabelChars - 1).join("")}…`
}

function cleanLabel(raw: string): string {
  let label = raw.trim()
  if (
    (label.startsWith('"') && label.endsWith('"')) ||
    (label.startsWith("'") && label.endsWith("'"))
  ) {
    label = label.slice(1, -1)
  }
  // Inline `<br/>` breaks are the standard multi-line label idiom.
  label = label.replace(/<br\s*\/?>/gi, " ")
  return truncateLabel(label.replace(/\s+/g, " ").trim())
}

/** Split a statement into top-level `&` segments (depth/quote aware). */
function splitTopLevel(text: string, delimiter: "&"): string[] {
  const parts: string[] = []
  let depth = 0
  let quote: string | undefined
  let current = ""
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (quote) {
      current += ch
      if (ch === quote) quote = undefined
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      current += ch
      continue
    }
    if (ch === "(" || ch === "[" || ch === "{") depth++
    else if ((ch === ")" || ch === "]" || ch === "}") && depth > 0) depth--
    if (ch === delimiter && depth === 0) {
      parts.push(current)
      current = ""
      continue
    }
    current += ch
  }
  parts.push(current)
  return parts.map((part) => part.trim()).filter((part) => part.length > 0)
}

/**
 * Split the source into statements in one pass: `;` terminates at depth 0,
 * newlines terminate at depth 0 unless the statement is open (open brackets,
 * trailing arrow/`&`/open label pipe), and `%%` comments are stripped at
 * depth 0 outside quotes. `A -->\nB` stays one statement; `A --> B %% note`
 * drops the comment.
 */
function splitStatements(source: string): string[] {
  const text = source.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  const statements: string[] = []
  let depth = 0
  let quote: string | undefined
  let current = ""

  const flush = () => {
    if (current.trim()) statements.push(current.trim())
    current = ""
  }
  // A newline continues the statement when brackets are open, when it ends
  // with an arrow/`&`, or when a `|label|` is unbalanced (odd pipe count).
  // A balanced `-->|label|` at EOL ends the statement — the naive
  // `\|[^|]*$` test merged the NEXT line into it.
  const openTail = () => {
    const tail = current.trimEnd()
    if (/(--?>|---|-\.->|==>|--|&)$/.test(tail)) return true
    const pipes = (tail.match(/\|/g) ?? []).length
    return pipes % 2 === 1
  }

  let i = 0
  while (i < text.length) {
    const ch = text[i]!
    if (quote) {
      current += ch
      if (ch === quote) quote = undefined
      i++
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      current += ch
      i++
      continue
    }
    if (ch === "%" && text[i + 1] === "%" && depth === 0) {
      while (i < text.length && text[i] !== "\n") i++
      continue
    }
    if (ch === "(" || ch === "[" || ch === "{") depth++
    else if ((ch === ")" || ch === "]" || ch === "}") && depth > 0) depth--
    if (ch === ";" && depth === 0) {
      flush()
      i++
      continue
    }
    if (ch === "\n") {
      if (depth === 0 && !openTail()) flush()
      else current += " "
      i++
      continue
    }
    current += ch
    i++
  }
  flush()
  return statements
}

interface Bracketed {
  id: string
  label?: string
  shape?: MermaidNodeShape
  rest: string
}

/**
 * Parse `id`, `id[…]`-family at the head of `text`. Returns the id, the
 * optional explicit label/shape, and the unconsumed remainder.
 */
function parseNodeHead(text: string): Bracketed | undefined {
  const idMatch = ID_RE.exec(text.trimStart())
  if (!idMatch) return undefined
  const id = idMatch[0]
  let rest = text.trimStart().slice(id.length).trimStart()
  if (!rest || (!"([{".includes(rest[0]!) && !(rest[0] === "["))) {
    return { id, rest }
  }
  const opener = rest[0]!
  // Asymmetric openers first.
  if (rest.startsWith("((")) return scanBracket(id, rest, "((", "))", "circle")
  if (rest.startsWith("([") || rest.startsWith("[(")) {
    const closer = rest.startsWith("([") ? "])" : ")]"
    return scanBracket(id, rest, rest.slice(0, 2), closer, "stadium")
  }
  if (rest.startsWith("[[")) return scanBracket(id, rest, "[[", "]]", "rect")
  if (rest.startsWith("[/")) return scanBracket(id, rest, "[/", "/]", "rect")
  if (rest.startsWith("[\\")) return scanBracket(id, rest, "[\\", "\\]", "rect")
  if (opener === "[") return scanBracket(id, rest, "[", "]", "rect")
  if (opener === "(") return scanBracket(id, rest, "(", ")", "round")
  if (opener === "{") return scanBracket(id, rest, "{", "}", "diamond")
  return { id, rest }
}

/** Scan a bracketed label with nesting of the same bracket type. */
function scanBracket(
  id: string,
  rest: string,
  opener: string,
  closer: string,
  shape: MermaidNodeShape,
): Bracketed {
  let depth = 0
  let i = 0
  while (i < rest.length) {
    if (rest.startsWith(opener, i)) {
      depth++
      i += opener.length
      continue
    }
    if (rest.startsWith(closer, i)) {
      depth--
      i += closer.length
      if (depth === 0) {
        const inner = rest.slice(opener.length, i - closer.length)
        return { id, label: cleanLabel(inner), shape, rest: rest.slice(i).trimStart() }
      }
      continue
    }
    i++
  }
  // Unterminated — treat the id as bare and leave the text for edge parsing.
  return { id, rest }
}

const ARROW_RE = /^(-\.->|==>|-->|---(?![-])|--(?![->]))/
const ARROW_TOKENS = ["-.->", "-->", "==>", "---"] as const
type ArrowToken = (typeof ARROW_TOKENS)[number]

function arrowStyle(token: string): MermaidEdgeStyle {
  if (token.startsWith("-.")) return "dotted"
  if (token.startsWith("==")) return "thick"
  if (token === "---") return "open"
  return "solid"
}

/**
 * First arrow token at depth 0 (quote/bracket aware). Powers the
 * `-- label -->` form: the dashes before the arrow are a label, not an edge.
 */
function scanTopLevelArrow(text: string): { index: number; token: ArrowToken } | undefined {
  let depth = 0
  let quote: string | undefined
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (quote) {
      if (ch === quote) quote = undefined
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }
    if (ch === "(" || ch === "[" || ch === "{") {
      depth++
      continue
    }
    if ((ch === ")" || ch === "]" || ch === "}") && depth > 0) {
      depth--
      continue
    }
    if (depth > 0) continue
    for (const token of ARROW_TOKENS) {
      if (text.startsWith(token, i)) return { index: i, token }
    }
  }
  return undefined
}

interface EdgeHead {
  from: string
  style: MermaidEdgeStyle
  label?: string
  rest: string
}

/** Parse `node arrow [label] remainder` at the head of a chain segment. */
function parseEdgeHead(text: string): (EdgeHead & { node: Bracketed }) | undefined {
  const node = parseNodeHead(text)
  if (!node) return undefined
  let rest = node.rest
  // `-- label -->` form: the first top-level arrow is preceded by label
  // dashes. Without this, `hello` in `A -- hello --> B` parses as a node.
  const found = scanTopLevelArrow(rest)
  if (found && found.index > 0) {
    const middle = rest.slice(0, found.index)
    const labelMatch = /^(--|-.)\s*([\s\S]*?)\s*$/.exec(middle)
    if (labelMatch) {
      const label = labelMatch[2]!.trim() ? cleanLabel(labelMatch[2]!) : undefined
      return {
        from: node.id,
        node,
        style: arrowStyle(found.token),
        label,
        rest: rest.slice(found.index + found.token.length).trimStart(),
      }
    }
  }
  // Fold o/x endpoint markers. Leading (`o-->`) strips when arrow-adjacent;
  // trailing (`--o N`) strips only with more text after — a bare `o`/`x`
  // target is a node name. (Attached `-->oB` stays a name: it is
  // indistinguishable from an id starting with o/x.)
  rest = rest
    .replace(/^[ox]\s*(?=(--|-\\.|==))/i, "")
    .replace(/(--?>|---|-\.->|==>|--)[ox]\s*$/i, "$1")
  const arrow = ARROW_RE.exec(rest)
  if (!arrow) return undefined
  const token = arrow[0]
  rest = rest.slice(token.length).trimStart()
  // Spaced o/x endpoint marker (`--o N`): strip it. A bare `o`/`x` target is
  // a node name — only strip when more text follows. (Attached `-->oB`
  // stays a node name: indistinguishable from an id starting with o/x.)
  const marker = /^[ox]\s+(?=\S)/i.exec(rest)
  if (marker) rest = rest.slice(marker[0].length)
  // `-->|label|` form.
  const pipe = /^\|\s*([^|]*?)\s*\|\s*/.exec(rest)
  let label: string | undefined
  if (pipe) {
    label = pipe[1]!.trim() || undefined
    rest = rest.slice(pipe[0].length)
  }
  return { from: node.id, node, style: arrowStyle(token), label, rest }
}

/** Trailing `-- label` form: `A -- text` where the arrow follows in the chain. */
function splitTrailingLabel(segment: string): { head: string; label?: string } {
  const match = /^(.*?)\s*(--|-.)\s*([\s\S]+?)\s*$/.exec(segment)
  if (!match) return { head: segment }
  // The tail must be a bare label, not another edge: if it still holds an
  // arrow token, the `--` belongs to edge syntax, not a label.
  if (/--?>|---|-\.->|==>/ .test(match[3]!)) return { head: segment }
  return { head: match[1]!.trim(), label: cleanLabel(match[3]!) }
}

export function parseMermaid(source: string): MermaidDiagram {
  const statements = splitStatements(source)
  if (statements.length === 0) return { type: "unsupported", kind: "empty" }

  const first = statements[0]!
  const headMatch = /^([A-Za-z-]+)(?:\s+([A-Za-z]+))?/.exec(first)
  const headKind = (headMatch?.[1] ?? "").toLowerCase()
  if (headKind !== "graph" && headKind !== "flowchart" && headKind !== "flowchart-elk") {
    if (UNSUPPORTED_KINDS.has(headKind)) return { type: "unsupported", kind: headKind }
    return { type: "unsupported", kind: headKind || "unknown" }
  }
  const direction = DIRECTIONS[(headMatch?.[2] ?? "TB").toUpperCase()] ?? "TB"

  const nodes = new Map<string, MermaidNode>()
  const edges: MermaidEdge[] = []
  const subgraphs: MermaidSubgraph[] = []
  const subgraphById = new Map<string, MermaidSubgraph>()
  const stack: string[] = []
  const badLines: string[] = []
  let subgraphSeq = 0

  const ensureNode = (id: string, subgraph?: string): MermaidNode => {
    let node = nodes.get(id)
    if (!node) {
      node = { id, label: id, shape: "rect", subgraph }
      nodes.set(id, node)
    } else if (subgraph && !node.subgraph) {
      node.subgraph = subgraph
    }
    return node
  }

  const defineNode = (parsed: Bracketed, subgraph?: string) => {
    const node = ensureNode(parsed.id, subgraph)
    // An explicit label overrides (a later `B[Real label]` beats the bare
    // `A --> B` reference); shape follows the defining occurrence.
    if (parsed.label !== undefined) {
      node.label = parsed.label
      node.shape = parsed.shape ?? node.shape
      if (subgraph) node.subgraph = subgraph
    } else if (parsed.shape && node.label === node.id) {
      node.shape = parsed.shape
    }
  }

  const pushEdge = (from: string, to: string, label: string | undefined, style: MermaidEdgeStyle) => {
    if (from === to) return
    if (edges.some((e) => e.from === from && e.to === to && e.label === label && e.style === style)) return
    edges.push({ from, to, label, style })
  }

  /** Parse one chain statement, fanning out across `&` segments. */
  const parseChain = (statement: string, subgraph?: string): boolean => {
    const text = statement.trim()
    if (!text) return true
    // Split `A & B --> C` / `A --> B & C` at top level first: leading
    // segments without arrows are extra sources for the next arrow.
    const segments = splitTopLevel(text, "&")
    const sources: string[] = []
    let idx = 0
    while (idx < segments.length) {
      const seg = segments[idx]!
      // Consult the edge parser first: an o/x marker can hide the arrow
      // from the scanner (`M o--o N`), while a bare node never parses as
      // an edge — so edge-first is unambiguous.
      if (parseEdgeHead(seg)) break
      const bare = parseNodeHead(seg)
      if (!bare || bare.rest) return false
      defineNode(bare, subgraph)
      ensureNode(bare.id, subgraph)
      sources.push(bare.id)
      idx++
    }
    if (idx >= segments.length) return sources.length > 0
    // segments[idx] holds the first arrow; chain through it and everything
    // after, where bare segments share the current sources.
    const first = parseEdgeHead(segments[idx]!)
    if (!first) return false
    defineNode(first.node, subgraph)
    ensureNode(first.from, subgraph)
    sources.push(first.from)
    let pendingLabel = first.label
    let pendingStyle = first.style
    let rest = first.rest
    idx++
    for (;;) {
      rest = rest.trim()
      if (!rest) {
        // End of this segment: the next `&`-sibling is either another
        // target (bare node) or a fresh chain (`C --> D` resets sources).
        if (idx >= segments.length) return true
        const sibling = segments[idx++]!
        if (scanTopLevelArrow(sibling)) {
          const chained = parseEdgeHead(sibling)
          if (!chained) return false
          defineNode(chained.node, subgraph)
          ensureNode(chained.from, subgraph)
          sources.length = 0
          sources.push(chained.from)
          pendingLabel = chained.label
          pendingStyle = chained.style
          rest = chained.rest
          continue
        }
        const bare = parseNodeHead(sibling)
        if (!bare || bare.rest) return false
        defineNode(bare, subgraph)
        ensureNode(bare.id, subgraph)
        for (const source of sources) pushEdge(source, bare.id, pendingLabel, pendingStyle)
        continue
      }
      // Mid-segment chain continuation (`B --> C` inside one segment).
      const head = parseNodeHead(rest)
      if (!head) return false
      defineNode(head, subgraph)
      ensureNode(head.id, subgraph)
      if (!head.rest) {
        for (const source of sources) pushEdge(source, head.id, pendingLabel, pendingStyle)
        rest = ""
        continue
      }
      const chained = parseEdgeHead(rest)
      if (!chained) {
        // `B -- label` tail: attach the label to a fresh head-only edge.
        const { head: bare, label } = splitTrailingLabel(rest)
        const bareNode = parseNodeHead(bare)
        if (!bareNode || bareNode.rest) return false
        defineNode(bareNode, subgraph)
        for (const source of sources) pushEdge(source, bareNode.id, label ?? pendingLabel, pendingStyle)
        rest = ""
        continue
      }
      defineNode(chained.node, subgraph)
      for (const source of sources) pushEdge(source, chained.from, pendingLabel, pendingStyle)
      sources.length = 0
      sources.push(chained.from)
      pendingLabel = chained.label
      pendingStyle = chained.style
      rest = chained.rest
    }
  }

  for (let s = 1; s < statements.length; s++) {
    const statement = statements[s]!.trim()
    if (!statement) continue
    if (SKIPPED_STATEMENTS.test(statement)) continue

    const subgraphMatch = /^subgraph(?:\s+(.*))?$/.exec(statement)
    if (subgraphMatch) {
      const arg = (subgraphMatch[1] ?? "").trim()
      let id: string
      let title: string
      const bracketed = arg ? parseNodeHead(arg) : undefined
      if (bracketed && (bracketed.label !== undefined || !bracketed.rest)) {
        id = bracketed.id
        title = bracketed.label ?? bracketed.id
      } else if (arg) {
        subgraphSeq++
        id = `sg${subgraphSeq}`
        title = cleanLabel(arg)
      } else {
        subgraphSeq++
        id = `sg${subgraphSeq}`
        title = id
      }
      const parent = stack.length > 0 ? stack[stack.length - 1] : undefined
      if (!subgraphById.has(id)) {
        const sg: MermaidSubgraph = { id, title: title || id }
        if (parent) sg.parent = parent
        subgraphs.push(sg)
        subgraphById.set(id, sg)
      }
      stack.push(id)
      continue
    }
    if (/^end\b/.test(statement)) {
      stack.pop()
      continue
    }
    const directionMatch = /^direction\s+(TB|TD|BT|LR|RL)\s*$/i.exec(statement)
    if (directionMatch) continue // subgraph-local directions: layout uses the graph one

    const current = stack.length > 0 ? stack[stack.length - 1] : undefined
    // A `-- label -->` chain may itself contain `&`; fan out first so each
    // branch parses as an independent chain with shared sources.
    if (!parseChain(statement, current)) {
      if (badLines.length < MERMAID_LIMITS.maxBadLines) badLines.push(statement.slice(0, 80))
    }
  }

  if (nodes.size === 0) return { type: "unsupported", kind: "empty" }
  if (nodes.size > MERMAID_LIMITS.maxNodes || edges.length > MERMAID_LIMITS.maxEdges) {
    return { type: "unsupported", kind: "flowchart-too-large" }
  }
  return {
    type: "flowchart",
    direction,
    nodes: [...nodes.values()],
    edges,
    subgraphs,
    badLines,
  }
}

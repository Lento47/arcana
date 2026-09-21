/**
 * Mermaid widget tests: parser coverage for the flowchart subset, layout
 * determinism/geometry, and fallback behavior. The canvas is asserted as
 * plain strings (layout is renderer-free); the widget itself is thin
 * renderable assembly over it, mirroring the gantt widget's test split.
 */
import { describe, expect, test } from "bun:test"
import {
  parseMermaid,
  type MermaidDiagram,
} from "../src/shell/command-spine/widgets/mermaid-parse"
import { canvasText, layoutFlowchart } from "../src/shell/command-spine/widgets/mermaid-layout"

function flowchart(source: string): Extract<MermaidDiagram, { type: "flowchart" }> {
  const parsed = parseMermaid(source)
  if (parsed.type !== "flowchart") throw new Error(`expected flowchart, got ${parsed.type}`)
  return parsed
}

function render(source: string): string[] {
  const diagram = flowchart(source)
  const laidOut = layoutFlowchart(diagram)
  if (!laidOut) throw new Error("layout declined a small diagram")
  return canvasText(laidOut.canvas)
}

describe("mermaid parser", () => {
  test("directions normalize (TD aliases TB)", () => {
    expect(flowchart("graph TB\nA-->B").direction).toBe("TB")
    expect(flowchart("flowchart TD\nA-->B").direction).toBe("TB")
    expect(flowchart("graph BT\nA-->B").direction).toBe("BT")
    expect(flowchart("graph LR\nA-->B").direction).toBe("LR")
    expect(flowchart("graph RL\nA-->B").direction).toBe("RL")
    expect(flowchart("graph\nA-->B").direction).toBe("TB")
  })

  test("node shapes parse", () => {
    const diagram = flowchart(
      "graph TB\nA[rect]\nB(round)\nC([stadium])\nD{ diamond }\nE((circle))\nF[[sub]]\nG[/para/]",
    )
    const shape = (id: string) => diagram.nodes.find((n) => n.id === id)?.shape
    expect(shape("A")).toBe("rect")
    expect(shape("B")).toBe("round")
    expect(shape("C")).toBe("stadium")
    expect(shape("D")).toBe("diamond")
    expect(shape("E")).toBe("circle")
    expect(shape("F")).toBe("rect")
    expect(shape("G")).toBe("rect")
  })

  test("edge kinds and labels", () => {
    const diagram = flowchart(
      "graph TB\nA --> B\nC --- D\nE -.-> F\nG ==> H\nI -- hello --> J\nK-->|piped|L\nM o--o N",
    )
    const edge = (from: string) => diagram.edges.find((e) => e.from === from)!
    expect(edge("A").style).toBe("solid")
    expect(edge("C").style).toBe("open")
    expect(edge("E").style).toBe("dotted")
    expect(edge("G").style).toBe("thick")
    expect(edge("I").label).toBe("hello")
    expect(edge("K").label).toBe("piped")
    expect(edge("M").style).toBe("solid")
    expect(edge("M").to).toBe("N")
  })

  test("chains and fan-out share nodes correctly", () => {
    const chained = flowchart("graph TB\nA --> B --> C")
    expect(chained.edges).toEqual([
      { from: "A", to: "B", label: undefined, style: "solid" },
      { from: "B", to: "C", label: undefined, style: "solid" },
    ])
    const fanOut = flowchart("graph TB\nA --> B & C")
    expect(fanOut.edges.map((e) => e.to).sort()).toEqual(["B", "C"])
    const fanIn = flowchart("graph TB\nA & B --> C")
    expect(fanIn.edges.map((e) => e.from).sort()).toEqual(["A", "B"])
    const separate = flowchart("graph TB\nA --> B & C --> D")
    expect(separate.edges).toEqual([
      { from: "A", to: "B", label: undefined, style: "solid" },
      { from: "C", to: "D", label: undefined, style: "solid" },
    ])
  })

  test("subgraphs group members; nesting flattens to the top level", () => {
    const diagram = flowchart("graph TB\nsubgraph S[Title]\nA --> B\nsubgraph Inner\nC\nend\nend")
    expect(diagram.subgraphs.map((s) => s.id)).toContain("S")
    expect(diagram.subgraphs.find((s) => s.id === "S")?.title).toBe("Title")
    expect(diagram.nodes.find((n) => n.id === "A")?.subgraph).toBe("S")
    expect(diagram.nodes.find((n) => n.id === "C")?.subgraph).toBe("Inner")
    expect(diagram.subgraphs.find((s) => s.id === "Inner")?.parent).toBe("S")
  })

  test("comments, directives and styling statements are skipped", () => {
    const diagram = flowchart(
      "graph TB\n%% a comment\nA --> B %% trailing\n%%{init: {}}%%\nclassDef foo fill:#fff\nclass A foo\nclick A href\nstyle A fill:#000\nlinkStyle 0 stroke:#fff",
    )
    expect(diagram.edges).toHaveLength(1)
    expect(diagram.badLines).toHaveLength(0)
  })

  test("quoted labels survive separators", () => {
    const diagram = flowchart('graph TB\nA["x; y & z"] --> B')
    expect(diagram.nodes.find((n) => n.id === "A")?.label).toEqual(["x; y & z"])
    expect(diagram.edges).toHaveLength(1)
  })

  test("br breaks become rows", () => {
    const diagram = flowchart("graph TB\nA[Web App<br/>React 18]")
    expect(diagram.nodes.find((n) => n.id === "A")?.label).toEqual(["Web App", "React 18"])
  })

  test("later explicit labels override bare references", () => {
    const diagram = flowchart("graph TB\nA --> B\nB[Real Label]")
    expect(diagram.nodes.find((n) => n.id === "B")?.label).toEqual(["Real Label"])
  })

  test("multiline statements join across newlines", () => {
    const diagram = flowchart("graph TB\nA -->\nB")
    expect(diagram.edges).toEqual([{ from: "A", to: "B", label: undefined, style: "solid" }])
  })

  test("unsupported diagrams fall back", () => {
    expect(parseMermaid("sequenceDiagram\nA->>B: hi").type).toBe("unsupported")
    expect(parseMermaid("pie\nA: 1").type).toBe("unsupported")
    expect(parseMermaid("").type).toBe("unsupported")
    expect(parseMermaid("hello world").type).toBe("unsupported")
  })

  test("oversized graphs decline", () => {
    const many = `graph TB\n${Array.from({ length: 100 }, (_, i) => `N${i}`).join("\n")}`
    const parsed = parseMermaid(many)
    expect(parsed.type).toBe("unsupported")
    if (parsed.type === "unsupported") expect(parsed.kind).toBe("flowchart-too-large")
  })

  test("garbage becomes badLines, never throws", () => {
    const diagram = flowchart("graph TB\nA --> B\n??? nope\n(((")
    expect(diagram.edges).toHaveLength(1)
    expect(diagram.badLines.length).toBeGreaterThan(0)
  })
})

describe("mermaid layout", () => {
  test("vertical flow: sources above targets with heads", () => {
    const rows = render("graph TB\nA[Alpha] --> B[Beta]")
    const joined = rows.join("\n")
    expect(joined).toContain("Alpha")
    expect(joined).toContain("Beta")
    expect(joined).toContain("▼")
    const rowA = rows.findIndex((row) => row.includes("Alpha"))
    const rowB = rows.findIndex((row) => row.includes("Beta"))
    expect(rowA).toBeGreaterThanOrEqual(0)
    expect(rowB).toBeGreaterThan(rowA)
  })

  test("horizontal flow: sources left of targets with right heads", () => {
    const rows = render("graph LR\nA[Alpha] --> B[Beta]")
    const joined = rows.join("\n")
    expect(joined).toContain("▶")
    const colA = Math.min(...rows.filter((r) => r.includes("Alpha")).map((r) => r.indexOf("Alpha")))
    const colB = Math.min(...rows.filter((r) => r.includes("Beta")).map((r) => r.indexOf("Beta")))
    expect(colA).toBeLessThan(colB)
  })

  test("deterministic across runs", () => {
    const source = "graph TB\nA --> B & C\nB --> D\nC --> D\nE[X1] --> A"
    expect(render(source)).toEqual(render(source))
  })

  test("diamonds render five rows with slashes", () => {
    const rows = render("graph TB\nA{decide} --> B[ok]")
    const joined = rows.join("\n")
    expect(joined).toContain("╱")
    expect(joined).toContain("╲")
    expect(joined).toContain("decide")
  })

  test("br breaks stack into label rows", () => {
    const rows = render("graph TB\nA[cli.ts<br/>commander entry] --> B[ok]")
    const joined = rows.join("\n")
    expect(joined).toContain("cli.ts")
    expect(joined).toContain("commander entry")
    const cliRow = rows.findIndex((row) => row.includes("cli.ts"))
    const entryRow = rows.findIndex((row) => row.includes("commander entry"))
    expect(entryRow).toBe(cliRow + 1)
  })

  test("edge labels paint on the canvas", () => {
    const rows = render("graph TB\nA[Start] -- hello world --> B[End]")
    expect(rows.join("\n")).toContain("hello world")
  })

  test("subgraphs draw titled boxes", () => {
    const rows = render("graph TB\nsubgraph S[Workers]\nA --> B\nend")
    const joined = rows.join("\n")
    expect(joined).toContain("Workers")
    expect(joined).toContain("┌")
    expect(joined).toContain("┘")
  })

  test("cycles terminate with both nodes present", () => {
    const rows = render("graph TB\nA --> B --> A")
    const joined = rows.join("\n")
    expect(joined).toContain("A")
    expect(joined).toContain("B")
    expect(joined).not.toContain("undefined")
  })

  test("deep chains decline to code fallback", () => {
    const chain = `graph TB\n${Array.from({ length: 15 }, (_, i) => `N${i} --> N${i + 1}`).join("\n")}`
    expect(layoutFlowchart(flowchart(chain))).toBeUndefined()
  })

  test("wide ranks wrap into stacked rows instead of declining", () => {
    const source = `graph TB\n${Array.from({ length: 25 }, (_, i) => `N${i}[node ${i} label]`).join("\n")}`
    const rows = render(source)
    const joined = rows.join("\n")
    expect(joined).toContain("node 0 label")
    expect(joined).toContain("node 24 label")
    expect(rows.length).toBeGreaterThan(6)
  })

  test("canvas rows are trimmed and bounded", () => {
    const rows = render("graph TB\nA --> B")
    for (const row of rows) expect(row).not.toMatch(/\s+$/)
    expect(Math.max(...rows.map((row) => row.length))).toBeLessThanOrEqual(100)
  })

  test("same-source fan-out shares one bus lane", () => {
    // Twelve span-2 edges from one hub: without bus routing they need twelve
    // lanes (cap: eight) and four would drop. The bus carries them all.
    // (R gives every B rank 1 so H --> C spans two ranks and needs a lane.)
    const roots = Array.from({ length: 12 }, (_, i) => `R --> B${i}`).join("\n")
    const branches = Array.from({ length: 12 }, (_, i) => `B${i} --> C${i}`).join("\n")
    const hub = Array.from({ length: 12 }, (_, i) => `H --> C${i}`).join("\n")
    const diagram = flowchart(`graph TB\nR[root]\nH[hub]\n${roots}\n${branches}\n${hub}`)
    const laidOut = layoutFlowchart(diagram)
    expect(laidOut).toBeDefined()
    expect(laidOut!.dropped).toEqual([])
  })

  test("viewport budget declines over-tall diagrams", () => {
    const source = "graph TB\nA --> B --> C --> D --> E"
    expect(layoutFlowchart(flowchart(source), { maxHeight: 10 })).toBeUndefined()
    expect(layoutFlowchart(flowchart(source))).toBeDefined()
  })
})

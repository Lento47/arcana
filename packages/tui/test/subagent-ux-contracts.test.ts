import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const root = join(import.meta.dir, "..")
const src = (path: string) => readFileSync(join(root, path), "utf8").replace(/\r\n/g, "\n")

describe("subagent dive/back UX source contracts", () => {
  test("spine rows do not scan the project session list for childSessionID", () => {
    const entry = src("src/shell/command-spine/spine-entry.tsx")
    const projection = src("src/shell/command-spine/use-spine-projection.ts")
    expect(entry).toContain("props.fallbackChildSessionID")
    expect(entry).not.toContain(".filter((s: any) => s.parentID === props.sessionID)")
    expect(projection).toContain("unstamped.length !== 1")
    expect(projection).toContain("children.length === 1")
  })

  test("the header owns session navigation and the route no longer renders a duplicate breadcrumb", () => {
    const header = src("src/shell/command-spine/spine-header.tsx")
    const shell = src("src/shell/command-spine/command-spine-shell.tsx")
    const route = src("src/routes/session/index.tsx")
    const footer = src("src/routes/session/subagent-footer.tsx")

    expect(header).toContain("<SpineNavigationRail")
    expect(shell).toContain('keymap.dispatchCommand("session.parent")')
    expect(shell).toContain('keymap.dispatchCommand("session.child.previous")')
    expect(shell).toContain('keymap.dispatchCommand("session.child.next")')
    expect(route).not.toContain("SubagentBreadcrumb")
    expect(footer).not.toContain('keymap.dispatchCommand("session.parent")')
    expect(footer).not.toContain('keymap.dispatchCommand("session.child.previous")')
    expect(footer).not.toContain('keymap.dispatchCommand("session.child.next")')
  })
})

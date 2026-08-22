import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const root = join(import.meta.dir, "..")
const src = (path: string) => readFileSync(join(root, path), "utf8").replace(/\r\n/g, "\n")

describe("subagent dive/back UX source contracts", () => {
  test("spine rows do not scan the project session list for childSessionID", () => {
    const entry = src("src/shell/command-spine/spine-entry.tsx")
    expect(entry).toContain("props.fallbackChildSessionID")
    expect(entry).not.toContain(".filter((s: any) => s.parentID === props.sessionID)")
  })

  test("breadcrumb renders a back-to-parent affordance with the session.parent shortcut", () => {
    const breadcrumb = src("src/routes/session/subagent-breadcrumb.tsx")
    expect(breadcrumb).toContain("← back to")
    expect(breadcrumb).toContain('useCommandShortcut("session.parent")')
    expect(breadcrumb).toContain('route.navigate({ type: "session", sessionID: props.parentID })')
  })
})

import { describe, expect, test } from "bun:test"
import {
  buildSessionNavigation,
  navigationRailDisplayWidth,
  navigationSessionLabel,
  projectNavigationRail,
  type SessionNavigationLike,
} from "../src/shell/command-spine/session-navigation-rail"

const session = (
  id: string,
  title: string,
  parentID?: string,
  created = 0,
): SessionNavigationLike => ({ id, title, parentID, time: { created } })

describe("session navigation model", () => {
  test("uses agent identities for generated subagent titles", () => {
    expect(navigationSessionLabel(session("review", "Review task (@review subagent)"))).toBe("@review")
    expect(navigationSessionLabel(session("root", "Fix stuck agent"))).toBe("Fix stuck agent")
    expect(navigationSessionLabel(session("empty", "   "))).toBe("session")
  })

  test("projects root-to-leaf ancestry and deterministic sibling position", () => {
    const root = session("root", "Fix stuck agent", undefined, 1)
    const research = session("research", "Research (@research subagent)", "root", 2)
    const review = session("review", "Review (@review subagent)", "root", 3)
    const model = buildSessionNavigation({ current: review, sessions: [review, root, research] })

    expect(model.crumbs.map((crumb) => crumb.label)).toEqual(["Fix stuck agent", "@review"])
    expect(model.crumbs.map((crumb) => crumb.current)).toEqual([false, true])
    expect(model.siblingIndex).toBe(2)
    expect(model.siblingTotal).toBe(2)
    expect(model.canGoParent).toBe(true)
    expect(model.cycleDetected).toBe(false)
  })

  test("keeps a navigable placeholder when the parent has not synchronized", () => {
    const child = session("child", "Child (@review subagent)", "missing")
    const model = buildSessionNavigation({ current: child, sessions: [child] })

    expect(model.crumbs).toEqual([
      {
        id: "missing",
        label: "parent session",
        current: false,
        navigable: true,
        unresolved: true,
      },
      { id: "child", label: "@review", current: true, navigable: false },
    ])
  })

  test("terminates malformed cyclic ancestry", () => {
    const a = session("a", "A", "b")
    const b = session("b", "B", "a")
    const model = buildSessionNavigation({ current: a, sessions: [a, b] })

    expect(model.cycleDetected).toBe(true)
    expect(model.crumbs.map((crumb) => crumb.id)).toEqual(["b", "a"])
  })
})

describe("session navigation fitting", () => {
  const root = session("root", "Fix stuck agent")
  const a = session("a", "Research (@research subagent)", "root", 1)
  const b = session("b", "Review (@review subagent)", "a", 2)
  const leaf = session("leaf", "Validate (@validate subagent)", "b", 3)
  const peer = session("peer", "Peer (@peer subagent)", "b", 4)
  const model = buildSessionNavigation({ current: leaf, sessions: [root, a, b, leaf, peer] })

  test("wide mode keeps repository context and elides deep middle ancestry", () => {
    const projection = projectNavigationRail({
      model,
      path: "L:/PROJECTS/arcana/packages/tui",
      layout: "wide",
      width: 120,
    })

    expect(projection.repo).toBe("arcana ▸ … ▸ tui")
    expect(projection.crumbs.map((crumb) => crumb.label)).toEqual(["Fix stuck agent", "…", "@validate"])
    expect(projection.siblingLabel).toBe("1/2")
    expect(projection.showParent).toBe(true)
  })

  test("minimal mode prioritizes the current session over repository context", () => {
    const projection = projectNavigationRail({
      model,
      path: "L:/PROJECTS/arcana/packages/tui",
      layout: "minimal",
      width: 40,
    })

    expect(projection.repo).toBeUndefined()
    expect(projection.crumbs.map((crumb) => crumb.label)).toEqual(["@validate"])
  })

  test("always fits tiny budgets by yielding passive and secondary controls first", () => {
    for (const width of [8, 10, 12, 16, 20]) {
      const projection = projectNavigationRail({
        model,
        path: "L:/PROJECTS/arcana/packages/tui",
        layout: "narrow",
        width,
      })
      expect(navigationRailDisplayWidth(projection)).toBeLessThanOrEqual(width)
    }
  })
})

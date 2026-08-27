import { For, Show, createMemo, createSignal } from "solid-js"
import { useTheme } from "../../context/theme"
import { displayWidth, truncate } from "../../util/locale"
import type { SpineLayout } from "./spine-types"
import { breadcrumbFromPath } from "./spine-chrome"

export type SessionNavigationLike = {
  id: string
  parentID?: string | null
  title?: string | null
  time?: { created?: number }
}

export type NavigationCrumb = {
  id?: string
  label: string
  current: boolean
  navigable: boolean
  unresolved?: boolean
  elided?: boolean
}

export type SessionNavigationModel = {
  crumbs: NavigationCrumb[]
  siblingIndex: number
  siblingTotal: number
  canGoParent: boolean
  cycleDetected: boolean
}

export type NavigationRailProjection = {
  repo?: string
  crumbs: NavigationCrumb[]
  siblingLabel?: string
  showParent: boolean
  cycleWarning?: boolean
}

const SESSION_SEP_WIDTH = displayWidth(" ▸ ")

export function navigationSessionLabel(session: SessionNavigationLike): string {
  const title = session.title?.trim() ?? ""
  const agent = title.match(/@([\w-]+)\s+subagent/i)?.[1]
  if (agent) return `@${agent}`
  return title || "session"
}

export function buildSessionNavigation(input: {
  current: SessionNavigationLike
  sessions: readonly SessionNavigationLike[]
}): SessionNavigationModel {
  const byID = new Map(input.sessions.map((session) => [session.id, session]))
  byID.set(input.current.id, { ...byID.get(input.current.id), ...input.current })

  const reverse: NavigationCrumb[] = []
  const seen = new Set<string>()
  let cursor: SessionNavigationLike | undefined = byID.get(input.current.id)
  let cycleDetected = false

  while (cursor) {
    if (seen.has(cursor.id)) {
      cycleDetected = true
      break
    }
    seen.add(cursor.id)
    reverse.push({
      id: cursor.id,
      label: navigationSessionLabel(cursor),
      current: cursor.id === input.current.id,
      navigable: cursor.id !== input.current.id,
    })

    const parentID = cursor.parentID
    if (!parentID) break
    const parent = byID.get(parentID)
    if (!parent) {
      reverse.push({
        id: parentID,
        label: "parent session",
        current: false,
        navigable: true,
        unresolved: true,
      })
      break
    }
    cursor = parent
  }

  const crumbs = reverse.reverse()
  const siblings = input.current.parentID
    ? input.sessions
        .filter((session) => session.parentID === input.current.parentID)
        .toSorted((a, b) => {
          const time = (a.time?.created ?? 0) - (b.time?.created ?? 0)
          return time || a.id.localeCompare(b.id)
        })
    : []
  const siblingIndex = siblings.findIndex((session) => session.id === input.current.id)

  return {
    crumbs,
    siblingIndex: siblingIndex >= 0 ? siblingIndex + 1 : 0,
    siblingTotal: siblings.length,
    canGoParent: Boolean(input.current.parentID),
    cycleDetected,
  }
}

function selectSessionCrumbs(crumbs: readonly NavigationCrumb[], max: number): NavigationCrumb[] {
  if (crumbs.length <= max) return [...crumbs]
  if (max <= 1) return [crumbs[crumbs.length - 1]!]
  if (max === 2) return crumbs.slice(-2)
  return [
    crumbs[0]!,
    { label: "…", current: false, navigable: false, elided: true },
    ...crumbs.slice(-(max - 2)),
  ]
}

function projectionWidth(projection: NavigationRailProjection): number {
  const repo = projection.repo
    ? displayWidth(`⌂ ${projection.repo}`) + (projection.crumbs.length > 0 ? displayWidth(" │ ") : 0)
    : 0
  const crumbs = projection.crumbs.reduce(
    (width, crumb, index) => width + (index > 0 ? SESSION_SEP_WIDTH : 0) + displayWidth(crumb.label),
    0,
  )
  const cycle = projection.cycleWarning ? displayWidth(" ⚠ cycle") : 0
  const siblings = projection.siblingLabel ? displayWidth(` ‹ ${projection.siblingLabel} ›`) : 0
  const parent = projection.showParent ? displayWidth(" ↑") : 0
  return repo + crumbs + cycle + siblings + parent
}

export function projectNavigationRail(input: {
  model: SessionNavigationModel
  path?: string
  layout: SpineLayout
  width: number
  /** Hide the current leaf when the session title is rendered elsewhere. */
  showCurrent?: boolean
}): NavigationRailProjection {
  const room = Math.max(8, Math.floor(input.width))
  const repoSegments = input.layout === "wide" ? 3 : input.layout === "compact" ? 2 : input.layout === "narrow" ? 1 : 0
  const sessionSegments = input.layout === "wide" ? 3 : input.layout === "minimal" ? 1 : 2
  const sessionCrumbs = input.showCurrent === false
    ? input.model.crumbs.filter((crumb) => !crumb.current)
    : input.model.crumbs
  let projection: NavigationRailProjection = {
    repo: input.path && repoSegments > 0 ? breadcrumbFromPath(input.path, repoSegments) : undefined,
    crumbs: selectSessionCrumbs(sessionCrumbs, sessionSegments),
    siblingLabel:
      input.model.siblingTotal > 1 && input.model.siblingIndex > 0
        ? `${input.model.siblingIndex}/${input.model.siblingTotal}`
        : undefined,
    showParent: input.model.canGoParent,
    cycleWarning: input.model.cycleDetected || undefined,
  }

  // Session navigation is actionable, so repository context yields first.
  if (projectionWidth(projection) > room) projection = { ...projection, repo: undefined }
  if (projectionWidth(projection) > room && projection.cycleWarning) {
    projection = { ...projection, cycleWarning: undefined }
  }
  if (projectionWidth(projection) > room && projection.crumbs.length > 1) {
    projection = { ...projection, crumbs: selectSessionCrumbs(sessionCrumbs, 1) }
  }
  if (projectionWidth(projection) > room && projection.showParent) {
    projection = { ...projection, showParent: false }
  }
  if (projectionWidth(projection) > room && projection.siblingLabel) {
    projection = { ...projection, siblingLabel: undefined }
  }

  if (projectionWidth(projection) > room) {
    const leaf = projection.crumbs[projection.crumbs.length - 1]
    if (leaf) {
      const fixed = projectionWidth({ ...projection, crumbs: [{ ...leaf, label: "" }] })
      projection = {
        ...projection,
        crumbs: [{ ...leaf, label: truncate(leaf.label, Math.max(3, room - fixed)) }],
      }
    }
  }
  return projection
}

export function navigationRailDisplayWidth(projection: NavigationRailProjection): number {
  return projectionWidth(projection)
}

export function SpineNavigationRail(props: {
  layout: SpineLayout
  width: number
  path?: string
  session: SessionNavigationLike
  sessions?: readonly SessionNavigationLike[]
  /** Hide the current leaf when a parent component owns the session title. */
  showCurrent?: boolean
  onNavigate?: (sessionID: string) => void
  onPrevious?: () => void
  onNext?: () => void
  onParent?: () => void
}) {
  const { theme } = useTheme()
  const [hover, setHover] = createSignal<string>()
  // Debounce hover clear so moving between adjacent crumbs doesn't flicker:
  // onMouseOver on the next element cancels the pending clear.
  let hoverClearTimer: ReturnType<typeof setTimeout> | undefined
  const hoverSet = (id: string) => {
    if (hoverClearTimer) { clearTimeout(hoverClearTimer); hoverClearTimer = undefined }
    setHover(id)
  }
  const hoverClear = () => {
    hoverClearTimer = setTimeout(() => setHover(undefined), 50)
  }

  const model = createMemo(() => buildSessionNavigation({
    current: props.session,
    sessions: props.sessions ?? [props.session],
  }))
  const rail = createMemo(() => projectNavigationRail({
    model: model(),
    path: props.path,
    layout: props.layout,
    width: props.width,
    showCurrent: props.showCurrent,
  }))

  const navigate = (id: string | undefined) => {
    if (!id || id === props.session.id) return
    props.onNavigate?.(id)
  }
  const bg = (id: string) => hover() === id ? theme.backgroundElement : undefined

  return (
    <box flexDirection="row" minWidth={0} flexShrink={1}>
      <Show when={rail().repo}>
        {(repo) => (
          <>
            <text fg={theme.spineContext} wrapMode="none">⌂ {repo()}</text>
            <Show when={rail().crumbs.length > 0}>
              <text fg={theme.borderSubtle} wrapMode="none"> │ </text>
            </Show>
          </>
        )}
      </Show>
      <For each={rail().crumbs}>
        {(crumb, index) => (
          <>
            <Show when={index() > 0}>
              <text fg={theme.spineRail} wrapMode="none"> ▸ </text>
            </Show>
            <box
              id={crumb.id ? `session-crumb-${crumb.id}` : undefined}
              backgroundColor={crumb.navigable ? bg(`crumb:${crumb.id}`) : undefined}
              onMouseOver={() => crumb.navigable && hoverSet(`crumb:${crumb.id}`)}
              onMouseOut={() => hoverClear()}
              onMouseUp={() => crumb.navigable && navigate(crumb.id)}
            >
              <text
                fg={crumb.current ? theme.spineBrand : crumb.unresolved ? theme.warning : theme.spineContext}
                wrapMode="none"
              >
                {crumb.label}
              </text>
            </box>
          </>
        )}
      </For>
      <Show when={rail().cycleWarning}>
        <text fg={theme.warning} wrapMode="none"> ⚠ cycle</text>
      </Show>
      <Show when={rail().siblingLabel}>
        {(label) => (
          <>
            <text> </text>
            <box
              id="session-nav-prev"
              backgroundColor={bg("prev")}
              onMouseOver={() => hoverSet("prev")}
              onMouseOut={() => hoverClear()}
              onMouseUp={() => props.onPrevious?.()}
            >
              <text fg={theme.spineBrand}>‹</text>
            </box>
            <text fg={theme.textMuted}> {label()} </text>
            <box
              id="session-nav-next"
              backgroundColor={bg("next")}
              onMouseOver={() => hoverSet("next")}
              onMouseOut={() => hoverClear()}
              onMouseUp={() => props.onNext?.()}
            >
              <text fg={theme.spineBrand}>›</text>
            </box>
          </>
        )}
      </Show>
      <Show when={rail().showParent}>
        <>
          <text> </text>
          <box
            id="session-nav-parent"
            backgroundColor={bg("parent")}
            onMouseOver={() => hoverSet("parent")}
            onMouseOut={() => hoverClear()}
            onMouseUp={() => props.onParent?.()}
          >
            <text fg={theme.spineBrand}>↑</text>
          </box>
        </>
      </Show>
    </box>
  )
}

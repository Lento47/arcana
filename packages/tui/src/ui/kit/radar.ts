/**
 * Radar scope math: a deterministic PPI sweep over the running wave.
 *
 * The scope is a grid of cells, not a canvas: the sweep, the range rings and
 * the blips are all plotted by one pure function so the frame is reproducible
 * in a test and cheap enough to redraw on the stream lane. Distance encodes
 * *work done* — a blip sits near the core when the child has just started and
 * on the rim when it has finished — while colour and glyph encode liveness.
 * The sweep encodes time; nothing here encodes load that no source can report.
 *
 * Aspect: a terminal cell is roughly twice as tall as it is wide, so the
 * caller passes the grid's real height; rings drawn as ellipses over that grid
 * read as circles on screen.
 */

import { StatusGlyph } from "../../branding"

export type RadarState = "running" | "waiting" | "done" | "failed"
export type RadarTone = "ring" | "sweep" | "core" | RadarState | "label"
export interface RadarAgent {
  id: string
  /** The wave's ordinal for this agent; drawn as its slot label. */
  index: number
  state: RadarState
  /** 0..1 — how much of the wave's work this agent has finished. */
  progress: number
}
export interface RadarCell {
  char: string
  tone: RadarTone
}
export interface RadarPlacement {
  id: string
  index: number
  x: number
  y: number
  /** Orbit angle in radians (0 = right, growing clockwise). */
  angle: number
  /** Distance from the core as a fraction of the outer radius. */
  radius: number
}
export interface RadarGrid {
  width: number
  height: number
  rows: (RadarCell | null)[][]
  placements: RadarPlacement[]
}
export interface RadarOptions {
  width: number
  height: number
  sweep: number
  agents: readonly RadarAgent[]
}

const TAU = Math.PI * 2
/** Range rings at a third, two thirds and the rim. */
const RING_FRACTIONS = [1 / 3, 2 / 3, 1] as const
/** Status canon, straight from the shared vocabulary. */
const STATE_GLYPH: Record<RadarState, string> = {
  running: StatusGlyph.running,
  waiting: StatusGlyph.pending,
  done: StatusGlyph.done,
  failed: StatusGlyph.failed,
}
/** Plot priority: a blip never erases a blip, a ring never erases a blip. */
const PRIORITY: Record<RadarTone, number> = {
  ring: 0,
  sweep: 1,
  label: 2,
  running: 3,
  waiting: 3,
  done: 3,
  failed: 3,
  core: 4,
}
/** Sweep head glyph; the arm is dim dots, the head is a solid bullet. */
const SWEEP_HEAD = "•"
/** A running blip lights up when the sweep is within this angle of it. */
export const RADAR_HOT_ANGLE = 0.26

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0
}

function angularDistance(a: number, b: number): number {
  const distance = Math.abs((a - b) % TAU)
  return Math.min(distance, TAU - distance)
}

export function radarGrid(options: RadarOptions): RadarGrid {
  const width = Math.max(1, Math.floor(options.width))
  const height = Math.max(1, Math.floor(options.height))
  const rows: (RadarCell | null)[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => null as RadarCell | null),
  )
  const cx = (width - 1) / 2
  const cy = (height - 1) / 2
  const rx = Math.max(1, (width - 1) / 2)
  const ry = Math.max(1, (height - 1) / 2)

  const plot = (x: number, y: number, char: string, tone: RadarTone) => {
    const px = Math.round(x)
    const py = Math.round(y)
    if (px < 0 || px >= width || py < 0 || py >= height) return
    const existing = rows[py]![px]
    if (existing && PRIORITY[existing.tone] > PRIORITY[tone]) return
    rows[py]![px] = { char, tone }
  }

  // Range rings.
  const ringSteps = Math.max(32, Math.ceil(TAU * Math.max(rx, ry) * 3))
  for (const fraction of RING_FRACTIONS) {
    for (let step = 0; step < ringSteps; step++) {
      const angle = (step / ringSteps) * TAU
      plot(cx + Math.cos(angle) * rx * fraction, cy + Math.sin(angle) * ry * fraction, "·", "ring")
    }
  }

  // Sweep arm, then its head so the head owns the tip.
  const sweep = Number.isFinite(options.sweep) ? options.sweep : 0
  const armSteps = Math.max(8, Math.ceil(Math.max(rx, ry) * 2))
  for (let step = 1; step <= armSteps; step++) {
    const fraction = step / armSteps
    plot(cx + Math.cos(sweep) * rx * fraction, cy + Math.sin(sweep) * ry * fraction, "·", "sweep")
  }
  plot(cx + Math.cos(sweep) * rx, cy + Math.sin(sweep) * ry, SWEEP_HEAD, "sweep")

  // Blips and their slot labels. The array is the wave: the slot comes from
  // the position, so two agents can never share an angle; `index` is only the
  // label the legend and the dialog agree on.
  const placements: RadarPlacement[] = []
  const wave = Math.max(1, options.agents.length)
  options.agents.forEach((agent, position) => {
    const angle = -Math.PI / 2 + (position / wave) * TAU
    const progress = clamp01(agent.progress)
    const radius = agent.state === "done" || agent.state === "failed" ? 1 : 0.3 + 0.7 * progress
    const x = Math.round(cx + Math.cos(angle) * rx * radius)
    const y = Math.round(cy + Math.sin(angle) * ry * radius)
    placements.push({ id: agent.id, index: agent.index, x, y, angle, radius })
    const hot = agent.state === "running" && angularDistance(sweep, angle) < RADAR_HOT_ANGLE
    plot(x, y, hot ? "◉" : STATE_GLYPH[agent.state], agent.state)
    const label = String(Math.max(0, Math.floor(agent.index))).padStart(2, "0")
    const side = x + 1 + label.length <= width - 1 ? 1 : -label.length - 1
    for (let i = 0; i < label.length; i++) plot(x + side + i, y, label[i]!, "label")
  })

  // The orchestrator owns the center last; its priority would win anyway.
  plot(cx, cy, "◆", "core")

  return { width, height, rows, placements }
}

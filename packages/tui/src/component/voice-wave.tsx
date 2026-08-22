import { Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import { useKV } from "../context/kv"
import { useTheme } from "../context/theme"
import { Lexicon } from "../branding"

const BARS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇"] as const

export function isVoiceUiActive(status: string): boolean {
  return status === "recording" || status === "transcribing" || status === "normalizing" || status === "sending"
}

export function voiceStatusLabel(status: string): string {
  if (status === "transcribing") return Lexicon.Voice.transcribe
  if (status === "normalizing") return Lexicon.Voice.normalize
  if (status === "sending") return Lexicon.Voice.send
  return Lexicon.Voice.listen
}

/** Deterministic VU-style bar row for a given animation frame. */
export function voiceWaveFrame(frame: number, width = 28): string {
  let out = ""
  for (let i = 0; i < width; i++) {
    const wave = Math.sin(i * 0.55 + frame * 0.45) * 0.7 + Math.sin(i * 0.18 + frame * 0.21) * 0.3
    const idx = Math.round(((wave + 1) / 2) * (BARS.length - 1))
    out += BARS[Math.max(0, Math.min(BARS.length - 1, idx))]!
  }
  return out
}

export function VoiceWave(props: { status: () => string }) {
  const { theme } = useTheme()
  const kv = useKV()
  const animationsEnabled = () => kv.get("animations_enabled", true)
  const [frame, setFrame] = createSignal(0)
  const active = createMemo(() => isVoiceUiActive(props.status()))
  const recording = createMemo(() => props.status() === "recording")

  createEffect(() => {
    if (!active() || !animationsEnabled()) return
    const timer = setInterval(() => setFrame((n) => n + 1), 80)
    onCleanup(() => clearInterval(timer))
  })

  return (
    <Show when={active()}>
      <box width="100%" flexDirection="row" flexShrink={0} gap={1} alignItems="center">
        <text fg={recording() ? theme.error : theme.primary}>
          {voiceWaveFrame(frame())} {voiceStatusLabel(props.status())}
        </text>
      </box>
    </Show>
  )
}

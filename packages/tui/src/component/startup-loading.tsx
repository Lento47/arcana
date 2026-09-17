import { createEffect, createMemo, createSignal, onCleanup, Show } from "solid-js"
import { Layer, Space } from "../ui/chrome"
import { useTheme } from "../context/theme"
import { Spinner } from "./spinner"
import { Scramble } from "./scramble"
import { Glyph, BOOT_PHRASES, BOOT_READY } from "../branding"
import { Frame } from "../ui/frame"

export function StartupLoading(props: { ready: () => boolean }) {
  const theme = useTheme().theme
  const [show, setShow] = createSignal(false)
  // Pick the boot phrase at mount (after setLexiconVoice ran) so a plain-voice
  // session never flashes arcane splash copy.
  const bootPhrase = () => BOOT_PHRASES[Math.floor(Math.random() * BOOT_PHRASES.length)] ?? "…"
  const text = createMemo(() => (props.ready() ? BOOT_READY : bootPhrase()))
  let wait: NodeJS.Timeout | undefined
  let hold: NodeJS.Timeout | undefined
  let stamp = 0

  createEffect(() => {
    if (props.ready()) {
      if (wait) {
        clearTimeout(wait)
        wait = undefined
      }
      if (!show()) return
      if (hold) return

      const left = 3000 - (Date.now() - stamp)
      if (left <= 0) {
        setShow(false)
        return
      }

      hold = setTimeout(() => {
        hold = undefined
        setShow(false)
      }, left).unref()
      return
    }

    if (hold) {
      clearTimeout(hold)
      hold = undefined
    }
    if (show()) return
    if (wait) return

    wait = setTimeout(() => {
      wait = undefined
      stamp = Date.now()
      setShow(true)
    }, 500).unref()
  })

  onCleanup(() => {
    if (wait) clearTimeout(wait)
    if (hold) clearTimeout(hold)
  })

  return (
    <Show when={show()}>
      <box position="absolute" zIndex={Layer.splash} left={0} right={0} bottom={1} justifyContent="center" alignItems="center">
        <Frame shape="heavy" padX={1}>
          <box flexDirection="row" alignItems="center" gap={Space.gap}>
            <text fg={theme.primary}>{Glyph.sigil}</text>
            <Spinner color={theme.textMuted} />
            <Scramble text={text()} fg={theme.textMuted} />
          </box>
        </Frame>
      </box>
    </Show>
  )
}

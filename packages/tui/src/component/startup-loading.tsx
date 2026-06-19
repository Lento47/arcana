import { createEffect, createMemo, createSignal, onCleanup, Show } from "solid-js"
import { useTheme } from "../context/theme"
import { Spinner } from "./spinner"
import { Scramble } from "./scramble"
import { Glyph, BOOT_PHRASES } from "../branding"

const bootPhrase = BOOT_PHRASES[Math.floor(Math.random() * BOOT_PHRASES.length)]
import { FrameBorder } from "../ui/chrome"

export function StartupLoading(props: { ready: () => boolean }) {
  const theme = useTheme().theme
  const [show, setShow] = createSignal(false)
  const text = createMemo(() => (props.ready() ? "binding sigils…" : bootPhrase))
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
      <box position="absolute" zIndex={5000} left={0} right={0} bottom={1} justifyContent="center" alignItems="center">
        <box
          flexDirection="row"
          alignItems="center"
          gap={1}
          backgroundColor={theme.backgroundPanel}
          border={["top", "bottom", "left", "right"]}
          customBorderChars={FrameBorder}
          borderColor={theme.accent}
          paddingLeft={1}
          paddingRight={1}
        >
          <text fg={theme.primary}>{Glyph.sigil}</text>
          <Spinner color={theme.textMuted} />
          <Scramble text={text()} fg={theme.textMuted} />
        </box>
      </box>
    </Show>
  )
}

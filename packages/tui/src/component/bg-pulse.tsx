import {
  FrameBufferRenderable,
  RGBA,
  type OptimizedBuffer,
  type RenderContext,
  type RenderableOptions,
} from "@opentui/core"
import { extend, useRenderer } from "@opentui/solid"
import { onCleanup, onMount } from "solid-js"
import { tint, useTheme } from "../context/theme"
import { GoUpsellArtPainter } from "./bg-pulse-render"

type GoUpsellArtOptions = RenderableOptions<FrameBufferRenderable> & {
  backgroundPanel?: RGBA
  primary?: RGBA
  logoBase?: RGBA
}

class GoUpsellArtRenderable extends FrameBufferRenderable {
  private painter = new GoUpsellArtPainter()

  constructor(ctx: RenderContext, options: GoUpsellArtOptions = {}) {
    const width = typeof options.width === "number" ? options.width : 1
    const height = typeof options.height === "number" ? options.height : 1
    super(ctx, {
      ...options,
      width,
      height,
      live: options.live ?? true,
      respectAlpha: false,
    })

    if (options.width !== undefined && typeof options.width !== "number") this.width = options.width
    if (options.height !== undefined && typeof options.height !== "number") this.height = options.height
    this.painter.setBackgroundPanel(options.backgroundPanel)
    this.painter.setPrimary(options.primary)
    this.painter.setLogoBase(options.logoBase)
  }

  set backgroundPanel(value: RGBA | undefined) {
    if (this.painter.setBackgroundPanel(value)) this.requestRender()
  }

  set logoBase(value: RGBA | undefined) {
    if (this.painter.setLogoBase(value)) this.requestRender()
  }

  set primary(value: RGBA | undefined) {
    if (this.painter.setPrimary(value)) this.requestRender()
  }

  protected override renderSelf(buffer: OptimizedBuffer, deltaTime = 0): void {
    if (!this.visible || this.isDestroyed) return

    this.painter.render(this.frameBuffer, {
      deltaTime,
      rgb: this._ctx.capabilities?.rgb === true,
    })
    super.renderSelf(buffer)
  }
}

declare module "@opentui/solid" {
  interface OpenTUIComponents {
    go_upsell_art: typeof GoUpsellArtRenderable
  }
}

extend({ go_upsell_art: GoUpsellArtRenderable })

// Track active BgPulse instances to prevent permanent FPS cap when multiple
// instances mount/unmount concurrently (the second instance would otherwise
// save the already-capped 30fps as the "original" value).
let _bgPulseCount = 0
let _savedFps: { targetFps: number; maxFps: number } | null = null

export function BgPulse() {
  const { theme } = useTheme()
  const renderer = useRenderer()

  onMount(() => {
    if (_bgPulseCount === 0) {
      _savedFps = { targetFps: renderer.targetFps, maxFps: renderer.maxFps }
      renderer.targetFps = 30
      renderer.maxFps = 30
    }
    _bgPulseCount++
  })

  onCleanup(() => {
    _bgPulseCount--
    if (_bgPulseCount === 0 && _savedFps) {
      renderer.targetFps = _savedFps.targetFps
      renderer.maxFps = _savedFps.maxFps
      _savedFps = null
    }
  })

  return (
    <go_upsell_art
      width="100%"
      height="100%"
      backgroundPanel={theme.backgroundPanel}
      primary={theme.primary}
      logoBase={tint(theme.background, theme.text, 0.62)}
      live
    />
  )
}

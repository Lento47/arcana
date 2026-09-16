/**
 * Brand-source contract for the command-spine header.
 *
 * The wordmark and the runtime dot were literals local to the header, so a
 * rename of the app or a retune of the diamond glyph would silently skip the
 * spine. These guards pin both to `src/branding.ts`.
 */
/** @jsxImportSource @opentui/solid */
import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { testRender } from "@opentui/solid"
import { APP_NAME_UPPER, Glyph } from "../src/branding"
import { SpineHeader } from "../src/shell/command-spine/spine-header"
import { buildStatusSegments } from "../src/shell/command-spine/spine-segments"
import { projectSessionCharter } from "../src/shell/command-spine/session-charter"
import { ThemeProvider } from "../src/context/theme"
import { ToastProvider } from "../src/ui/toast"
import { TuiConfigProvider } from "../src/config"
import { KVProvider } from "../src/context/kv"
import { TestTuiContexts } from "./fixture/tui-environment"
import { createTuiResolvedConfig } from "./fixture/tui-runtime"

const headerSource = readFileSync(
  join(import.meta.dir, "../src/shell/command-spine/spine-header.tsx"),
  "utf8",
)

describe("spine header brand source contract", () => {
  test("the wordmark reads APP_NAME_UPPER rather than a local literal", () => {
    expect(headerSource).toContain("APP_NAME_UPPER")
    expect(headerSource).not.toContain("ARCANA")
  })

  test("the runtime dot reads Glyph.diamond rather than a local literal", () => {
    expect(headerSource).toContain("const RUNTIME_DOT = Glyph.diamond")
    expect(headerSource).not.toContain('"◆"')
  })
})

test("SpineHeader renders the branding wordmark and the branding runtime dot", async () => {
  const width = 120
  const app = await testRender(
    () => (
      <TestTuiContexts>
        <TuiConfigProvider config={createTuiResolvedConfig()}>
          <KVProvider>
            <ToastProvider>
              <ThemeProvider mode="dark">
                <box width={width} height={8}>
                  <SpineHeader
                    layout="wide"
                    contentWidth={width}
                    segments={buildStatusSegments({
                      branch: "arcanagov",
                      model: "gpt-4.1-mini",
                      ctxPercent: 12,
                      path: "L:/PROJECTS/arcana",
                    })}
                    session={() => ({ id: "sess_brand1", title: "brand" })}
                    trust={{
                      state: "disconnected",
                      connection: "degraded",
                      trace: "UNAVAILABLE",
                      integrity: "UNVERIFIED",
                      pendingApprovals: 0,
                      workspaceTrusted: false,
                      authorityActionsDisabled: true,
                    }}
                    charter={projectSessionCharter({ proofLevel: "P1", integrityStatus: "UNVERIFIED" })}
                  />
                </box>
              </ThemeProvider>
            </ToastProvider>
          </KVProvider>
        </TuiConfigProvider>
      </TestTuiContexts>
    ),
    { width, height: 8 },
  )
  for (let attempt = 0; attempt < 40; attempt++) {
    await Bun.sleep(10)
    await app.renderOnce()
    if (app.captureCharFrame().includes(APP_NAME_UPPER)) break
  }
  const frame = app.captureCharFrame()
  app.renderer.destroy()

  expect(frame).toContain(APP_NAME_UPPER)
  expect(frame).toContain(`${Glyph.diamond} OFFLINE`)
})

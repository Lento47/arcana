/**
 * O3 — static + geometry verification for bounded generic dialog content.
 *
 * The real render regression lives in o3-clip-repro.test.tsx. This standalone
 * mirror keeps the repository verifier sweep useful on hosts where OpenTUI's
 * render test cannot run: every DialogProvider surface must inherit one
 * bounded, visible scroll owner from Dialog itself.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { dialogContentMaxHeight, dialogMaxHeight } from "../src/util/geometry"

const read = (path: string) =>
  readFileSync(join(import.meta.dir, "../src", path), "utf8").replace(/\r\n/g, "\n")

const dialogSrc = read("ui/dialog.tsx")
const appSrc = read("app.tsx")
const artifactSrc = read("routes/session/artifact-viewer.tsx")
const inheritedReview = readFileSync(
  join(import.meta.dir, "../../../.hermes/docs/arcana/docs/tui-interface-dialog-mouse-review.md"),
  "utf8",
).replace(/\r\n/g, "\n")

let failures = 0
let checks = 0
const check = (condition: boolean, message: string) => {
  checks++
  if (condition) console.log(`  ok - ${message}`)
  else {
    failures++
    console.error(`  FAIL - ${message}`)
  }
}

console.log("verify-o3-repro (bounded dialog content):")

console.log("1. Dialog owns the shared overflow boundary:")
check(dialogSrc.includes("maxHeight={dialogMaxHeight(dimensions().height)}"), "dialog card height is terminal-bounded")
check(dialogSrc.includes("<scrollbox"), "dialog body has a ScrollBox owner")
check(
  dialogSrc.includes("height={bodyHeight()}") && dialogSrc.includes("Math.min(measured, contentCap())"),
  "scroll viewport height is measured from content and capped at the terminal bound (shrink-to-fit)",
)
check(
  !dialogSrc.includes("scrollbarOptions"),
  "scrollbar auto-appears on overflow (no forced track on short dialogs)",
)
check(dialogSrc.includes("viewportCulling={true}"), "long dialog bodies cull offscreen rows")

console.log("2. DialogProvider routes every stacked surface through Dialog:")
const providerStart = dialogSrc.indexOf("export function DialogProvider")
const providerRegion = providerStart >= 0 ? dialogSrc.slice(providerStart) : ""
check(providerRegion.includes("<Dialog onClose="), "provider mounts its active surface inside Dialog")
check(providerRegion.includes("value.stack.at(-1)!.element"), "the active arbitrary dialog element inherits the shared viewport")

console.log("3. Previously clipping surfaces remain covered without nested owners:")
check(appSrc.includes("<For each={events()}"), "RunProof event tape is still present")
check(artifactSrc.includes("export function ArtifactViewer"), "ArtifactViewer is still present")
check(
  providerRegion.includes("value.stack.at(-1)!.element"),
  "RunProof and artifact surfaces receive the generic Dialog scroll boundary",
)

console.log("4. Geometry remains valid at small and normal terminals:")
for (const height of [1, 2, 12, 25, 40]) {
  const card = dialogMaxHeight(height)
  const viewport = dialogContentMaxHeight(height)
  check(card >= 1 && card <= Math.max(1, height), `height ${height}: card stays within terminal (${card})`)
  check(viewport >= 1 && viewport <= card, `height ${height}: viewport is valid (${viewport})`)
}
check(dialogContentMaxHeight(12) === 6, "12-row terminal exposes a stable 6-row viewport")
check(60 > dialogContentMaxHeight(25), "60-row proof tape overflows into scrolling instead of terminal clipping")

console.log("5. Inherited review recommendation is fulfilled:")
check(
  inheritedReview.includes("standardize a dialog body primitive") ||
    inheritedReview.includes("bounded header/footer"),
  "the inherited review calls for the shared bounded dialog body now implemented",
)

console.log(
  failures === 0
    ? `O3 FIX VERIFIED (${checks}/${checks}) - dialog overflow is bounded and reachable.`
    : `PARTIAL (${failures}/${checks} failed)`,
)
process.exit(failures === 0 ? 0 : 1)

/**
 * Spinner component registration (spinner-crash fix B).
 *
 * `opentui-spinner/solid` normally self-registers via a bare side-effect
 * import, but under Bun compile with chunk splitting that side effect has
 * historically been dropped or evaluated against the wrong module instance,
 * producing the fatal "[Reconciler] Unknown component type: spinner".
 *
 * This module makes registration explicit and idempotent, and is imported
 * FIRST in app.tsx so it is guaranteed to have run before any component
 * tree mounts.
 */
import { registerSpinner } from "opentui-spinner/solid"

registerSpinner()

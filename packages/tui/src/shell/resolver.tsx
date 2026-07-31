import type { ShellComponent } from "./types"
import { OpencodeShell } from "./opencode-shell"
import { CommandSpineShell } from "./command-spine"

const shellRegistry: Record<string, ShellComponent> = {
  opencode: OpencodeShell,
  "command-spine": CommandSpineShell,
}

export function resolveShell(name: string): ShellComponent {
  const resolved = shellRegistry[name]
  if (!resolved) console.warn(`[arcana] Unknown shell "${name}" — falling back to "command-spine"`)
  return resolved ?? shellRegistry["command-spine"]!
}

export function getRegisteredShells(): string[] {
  return Object.keys(shellRegistry)
}

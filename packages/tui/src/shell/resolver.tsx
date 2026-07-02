import type { ShellComponent } from "./types"
import { OpencodeShell } from "./opencode-shell"
import { CommandSpineShell } from "./command-spine"

const shellRegistry: Record<string, ShellComponent> = {
  opencode: OpencodeShell,
  "command-spine": CommandSpineShell,
}

export function resolveShell(name: string): ShellComponent {
  return shellRegistry[name] ?? shellRegistry["opencode"]
}

export function getRegisteredShells(): string[] {
  return Object.keys(shellRegistry)
}

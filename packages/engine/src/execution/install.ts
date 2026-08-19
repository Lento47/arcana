// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors

/**
 * Detect any software/package installation in a command or path.
 * Used by inspect, risk, permission, and shell always-grants.
 * A miss here is a bypass — keep this list broad.
 */

export { isDependencyManifest } from "@arcana/core/util/file-edit-guard"

const INSTALL_COMMAND = new RegExp(
  [
    // JS / Node
    String.raw`\b(?:npm|yarn|pnpm|bun)\s+(?:install|i|add|update|upgrade|up|remove|uninstall|ci)\b`,
    String.raw`\b(?:npx|bunx|pnpx)\b`,
    String.raw`\b(?:pnpm|yarn)\s+dlx\b`,
    String.raw`\b(?:npm|yarn|pnpm)\s+exec\b`,
    String.raw`\b(?:npm|yarn)\s+create\b`,
    String.raw`\bbun\s+x\b`,
    String.raw`\bbun\s+create\b`,
    String.raw`\byarn\s+global\s+add\b`,
    String.raw`\byarn\s+upgrade-interactive\b`,
    // Python
    String.raw`\b(?:pip|pip3|pipx)\s+(?:install|download|uninstall)\b`,
    String.raw`\bpython(?:3)?\s+-m\s+pip\s+install\b`,
    String.raw`\b(?:uv|poetry)\s+(?:add|install|remove|sync)\b`,
    String.raw`\buvx\b`,
    String.raw`\bconda\s+install\b`,
    String.raw`\bmamba\s+install\b`,
    // Rust / Go / Ruby / PHP
    String.raw`\bcargo\s+(?:install|add|update|remove)\b`,
    String.raw`\bgo\s+(?:install|get)\b`,
    String.raw`\bgo\s+mod\s+(?:download|tidy)\b`,
    String.raw`\bgem\s+(?:install|update)\b`,
    String.raw`\bbundle\s+(?:install|add|update)\b`,
    String.raw`\bcomposer\s+(?:require|install|update|remove)\b`,
    // System / desktop
    String.raw`\bbrew\s+(?:install|upgrade|cask\s+install)\b`,
    String.raw`\b(?:apt-get|apt|yum|dnf|zypper)\s+(?:install|remove|purge|autoremove)\b`,
    String.raw`\bpacman\s+-[SRU]\b`,
    String.raw`\bapk\s+(?:add|del|upgrade)\b`,
    String.raw`\bchoco(?:latey)?\s+install\b`,
    String.raw`\bscoop\s+install\b`,
    String.raw`\bwinget\s+install\b`,
    String.raw`\bnix(?:-env\s+-i| profile install)\b`,
    String.raw`\bdotnet\s+(?:add\s+package|tool\s+(?:install|update|uninstall))\b`,
    String.raw`\bnuget\s+install\b`,
    String.raw`\bdeno\s+install\b`,
    String.raw`\bmake\s+install\b`,
    // uv tool install/upgrade (uvx-style managed tools)
    String.raw`\buv\s+tool\s+(?:install|upgrade)\b`,
    // Desktop / system storefronts
    String.raw`\bsnap\s+install\b`,
    String.raw`\bflatpak\s+install\b`,
    String.raw`\bmas\s+install\b`,
    String.raw`\bwinget\s+upgrade\b`,
    String.raw`\bchoco(?:latey)?\s+upgrade\b`,
    String.raw`\bscoop\s+update\b`,
    // Container images are installed/executed from remote registries
    String.raw`\bdocker\s+(?:pull|run)\b`,
    // Rust / Dart / Flutter / Elixir / OCaml / Haskell / Java
    String.raw`\bcargo\s+binstall\b`,
    String.raw`\bdart\s+pub\s+(?:add|get|upgrade)\b`,
    String.raw`\bflutter\s+pub\s+(?:add|get|upgrade)\b`,
    String.raw`\bmix\s+deps\.(?:get|update)\b`,
    String.raw`\bopam\s+install\b`,
    String.raw`\bcabal\s+install\b`,
    String.raw`\bmvn\s+(?:install|dependency:get|dependency:go-offline)\b`,
    // PHP + Python setup + CMake
    String.raw`\bcomposer\s+update\b`,
    String.raw`\bpython(?:3)?\s+setup\.py\s+install\b`,
    String.raw`\bcmake\s+--install\b`,
  ].join("|"),
  "i",
)

export function normalizeCommand(command: string): string {
  return command.replace(/\s+/g, " ").trim()
}

export function commandLooksLikeInstall(command: string): boolean {
  const text = normalizeCommand(command)
  if (!text) return false
  return INSTALL_COMMAND.test(text)
}

const OPAQUE_EXEC = new RegExp(
  [
    String.raw`\b(?:node|nodejs|bun)\s+(-e|-p|--eval|--print)\b`,
    String.raw`\bpython(?:3)?\s+-c\b`,
    String.raw`\b(?:ruby|perl)\s+-e\b`,
    String.raw`\bphp\s+-r\b`,
    String.raw`\bosascript\s+-e\b`,
    String.raw`\b(?:bash|sh|zsh)\s+-c\b`,
    String.raw`\b(?:powershell|pwsh)\s+(-(command|c|noprofile))\b`,
    String.raw`\bcmd(?:\.exe)?\s+/c\b`,
    String.raw`\beval\s+['"\`]`,
    String.raw`\bInvoke-Expression\b`,
  ].join("|"),
  "i",
)

const OPAQUE_BLOCK = new RegExp(
  [
    String.raw`\bcertutil\b[\s\S]{0,80}-urlcache`,
    String.raw`\bbitsadmin\b[\s\S]{0,40}/transfer`,
    String.raw`\bmsiexec\b[\s\S]{0,40}/i\s+https?://`,
    String.raw`\bmshta\s+https?://`,
    String.raw`\brundll32\b[\s\S]{0,40}url\.dll`,
    String.raw`\bregsvr32\b[\s\S]{0,40}https?://`,
  ].join("|"),
  "i",
)

const DANGEROUS_HEAD =
  /^(npm|npx|node|nodejs|bun|bunx|yarn|pnpm|pip|pip3|python|python3|curl|wget|cmd|cmd.exe|powershell|pwsh|irm|iwr|deno|go|cargo|gem|composer)$/i

export function commandLooksLikeOpaqueExec(command: string): boolean {
  const text = normalizeCommand(command)
  if (!text) return false
  return OPAQUE_EXEC.test(text) || OPAQUE_BLOCK.test(text)
}

export function commandLooksLikeBlockedOpaque(command: string): boolean {
  return OPAQUE_BLOCK.test(normalizeCommand(command))
}

export function commandRequiresExactAlways(command: string): boolean {
  const text = normalizeCommand(command)
  if (!text) return false
  if (commandLooksLikeInstall(text) || commandLooksLikeOpaqueExec(text)) return true
  const head = text.split(/\s+/)[0]?.replace(/^["']|["']$/g, "") ?? ""
  return DANGEROUS_HEAD.test(head)
}

export function extractInstallPackages(command: string): string[] {
  const text = normalizeCommand(command)
  const match = text.match(
    /\b(?:npm|npx|pnpm|yarn|bun|bunx|pip|pip3|pipx|uv|poetry|cargo|go|composer|gem|brew|choco|scoop|winget)\s+(?:install|i|add|update|upgrade|dlx|exec|x|get)?\s*(.*)$/i,
  )
  const alt = !match?.[1]
    ? text.match(
        new RegExp(
          [
            String.raw`\b(?:bundle|snap|flatpak|mas|opam|cabal|mvn|cmake)\s+(?:install|add|update|upgrade|--install|dependency:(?:get|go-offline))\s+(.*)$`,
            String.raw`\b(?:apt|apt-get|yum|dnf|zypper|pacman|apk)\s+install\s+(.*)$`,
            String.raw`\buv\s+tool\s+install\s+(.*)$`,
            String.raw`\b(?:dart|flutter)\s+pub\s+(?:add|get|upgrade)\s+(.*)$`,
            String.raw`\bmix\s+deps\.(?:get|update)\s+(.*)$`,
          ].join("|"),
          "i",
        ),
      )
    : undefined
  const tail = match?.[1] ?? alt?.slice(1).find((group) => group !== undefined)
  if (!tail) return []
  return tail
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0 && !token.startsWith("-") && token !== "." && token !== "./")
    .slice(0, 12)
}

// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors

/**
 * Detect any software/package installation in a command or path.
 * Used by inspect, risk, permission, and shell always-grants.
 * A miss here is a bypass — keep this list broad.
 */

const INSTALL_COMMAND = new RegExp(
  [
    // JS / Node
    String.raw`\b(?:npm|yarn|pnpm|bun)\s+(?:install|i|add|update|upgrade|remove|uninstall|ci)\b`,
    String.raw`\b(?:npx|bunx|pnpx)\b`,
    String.raw`\b(?:pnpm|yarn)\s+dlx\b`,
    String.raw`\b(?:npm|yarn|pnpm)\s+exec\b`,
    String.raw`\b(?:npm|yarn)\s+create\b`,
    String.raw`\bbun\s+x\b`,
    String.raw`\bbun\s+create\b`,
    String.raw`\byarn\s+global\s+add\b`,
    // Python
    String.raw`\b(?:pip|pip3|pipx)\s+(?:install|download)\b`,
    String.raw`\bpython(?:3)?\s+-m\s+pip\s+install\b`,
    String.raw`\b(?:uv|poetry)\s+(?:add|install|remove|sync)\b`,
    String.raw`\buvx\b`,
    String.raw`\bconda\s+install\b`,
    String.raw`\bmamba\s+install\b`,
    // Rust / Go / Ruby / PHP
    String.raw`\bcargo\s+(?:install|add)\b`,
    String.raw`\bgo\s+(?:install|get)\b`,
    String.raw`\bgem\s+install\b`,
    String.raw`\bbundle\s+add\b`,
    String.raw`\bcomposer\s+(?:require|install)\b`,
    // System / desktop
    String.raw`\bbrew\s+(?:install|upgrade|cask\s+install)\b`,
    String.raw`\b(?:apt-get|apt|yum|dnf|zypper)\s+install\b`,
    String.raw`\bpacman\s+-S\b`,
    String.raw`\bapk\s+add\b`,
    String.raw`\bchoco(?:latey)?\s+install\b`,
    String.raw`\bscoop\s+install\b`,
    String.raw`\bwinget\s+install\b`,
    String.raw`\bnix(?:-env\s+-i| profile install)\b`,
    String.raw`\bdotnet\s+add\s+package\b`,
    String.raw`\bnuget\s+install\b`,
    String.raw`\bdeno\s+install\b`,
    String.raw`\bmake\s+install\b`,
  ].join("|"),
  "i",
)

const MANIFEST_NAME = new Set([
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
  "requirements.txt",
  "pyproject.toml",
  "poetry.lock",
  "uv.lock",
  "pipfile",
  "pipfile.lock",
  "cargo.toml",
  "cargo.lock",
  "go.mod",
  "go.sum",
  "gemfile",
  "gemfile.lock",
  "composer.json",
  "composer.lock",
])

export function normalizeCommand(command: string): string {
  return command.replace(/\s+/g, " ").trim()
}

export function commandLooksLikeInstall(command: string): boolean {
  const text = normalizeCommand(command)
  if (!text) return false
  return INSTALL_COMMAND.test(text)
}

export function isDependencyManifest(filePath: string): boolean {
  const name = filePath.replace(/\\/g, "/").split("/").pop()?.toLowerCase() ?? ""
  return MANIFEST_NAME.has(name)
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
  if (!match?.[1]) return []
  return match[1]
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0 && !token.startsWith("-") && token !== "." && token !== "./")
    .slice(0, 12)
}

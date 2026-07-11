#!/usr/bin/env bun
/**
 * Lightweight import tracer for engine source.
 *
 * TypeScript 7 no longer ships the classic `typescript` compiler API on the
 * package root (only version metadata). This script uses a small regex-based
 * scanner instead of the old AST helpers.
 */
import * as path from "path"

const BASE_DIR = "/home/thdxr/dev/projects/anomalyco/opencode/packages/opencode"

// Get entry file from command line arg or use default
const ENTRY_FILE = process.argv[2] || "src/plugin/tui/runtime.ts"

const visited = new Set<string>()

function resolveImport(importPath: string, fromFile: string): string | null {
  if (importPath.startsWith("@/")) {
    return path.join(BASE_DIR, "src", importPath.slice(2))
  }

  if (importPath.startsWith("./") || importPath.startsWith("../")) {
    const dir = path.dirname(fromFile)
    return path.resolve(dir, importPath)
  }

  return null
}

function isInternalImport(importPath: string): boolean {
  return importPath.startsWith("@/") || importPath.startsWith("./") || importPath.startsWith("../")
}

async function tryExtensions(filePath: string): Promise<string | null> {
  const extensions = [".ts", ".tsx", ".js", ".jsx"]

  try {
    const file = Bun.file(filePath)
    const stat = await file.stat()

    if (stat?.isDirectory()) {
      for (const ext of extensions) {
        const indexPath = path.join(filePath, "index" + ext)
        const indexFile = Bun.file(indexPath)
        if (await indexFile.exists()) return indexPath
      }
      return null
    }

    return filePath
  } catch {
    for (const ext of extensions) {
      const withExt = filePath + ext
      const extFile = Bun.file(withExt)
      if (await extFile.exists()) return withExt
    }
    return null
  }
}

/** Extract module specifiers from static/dynamic import and re-export statements. */
function extractImports(source: string): string[] {
  const imports: string[] = []
  const seen = new Set<string>()

  // Strip block comments and line comments roughly so they don't produce false hits.
  const cleaned = source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")

  const patterns = [
    // import ... from "path"  |  import "path"
    /\bimport\s+(?:type\s+)?(?:[\s\S]*?\sfrom\s*)?["']([^"']+)["']/g,
    // export ... from "path"
    /\bexport\s+(?:type\s+)?[\s\S]*?\sfrom\s*["']([^"']+)["']/g,
    // dynamic import("path")
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  ]

  for (const pattern of patterns) {
    pattern.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = pattern.exec(cleaned))) {
      const spec = match[1]
      if (!spec || seen.has(spec)) continue
      // Skip pure type-only imports already filtered by not capturing "import type { x } from"
      // when the whole statement is `import type ...` — patterns above still match; drop them.
      const start = Math.max(0, match.index - 12)
      const prefix = cleaned.slice(start, match.index)
      if (/\bimport\s+type\s*$/.test(prefix) || /\bexport\s+type\s*$/.test(prefix)) continue
      seen.add(spec)
      imports.push(spec)
    }
  }

  return imports
}

async function traceFile(filePath: string, depth = 0): Promise<void> {
  const normalizedPath = path.relative(BASE_DIR, filePath)

  if (visited.has(filePath)) {
    return
  }

  if (!filePath.match(/\.(ts|tsx|js|jsx)$/)) {
    return
  }

  visited.add(filePath)
  console.log("\t".repeat(depth) + normalizedPath)

  let content: string
  try {
    content = await Bun.file(filePath).text()
  } catch {
    return
  }

  const imports = extractImports(content)
  const internalImports = imports.filter(isInternalImport)
  const externalImports = imports.filter((imp) => !isInternalImport(imp))

  for (const imp of externalImports) {
    console.log("\t".repeat(depth + 1) + `[ext] ${imp}`)
  }

  for (const imp of internalImports) {
    const resolved = resolveImport(imp, filePath)
    if (!resolved) continue

    const actualPath = await tryExtensions(resolved)
    if (!actualPath) continue

    await traceFile(actualPath, depth + 1)
  }
}

async function main() {
  const entryPath = path.join(BASE_DIR, ENTRY_FILE)

  const file = Bun.file(entryPath)
  if (!(await file.exists())) {
    console.error(`File not found: ${ENTRY_FILE}`)
    console.error(`Resolved to: ${entryPath}`)
    process.exit(1)
  }

  await traceFile(entryPath)
}

main().catch(console.error)

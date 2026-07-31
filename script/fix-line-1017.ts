/**
 * Direct line-number patcher for crypto.test.ts line 1017
 * Run: bun run script/fix-line-1017.ts
 */
import { readFileSync, writeFileSync } from "node:fs"

const path = "packages/core/src/crypto/crypto.test.ts"
const content = readFileSync(path, "utf-8")
const lines = content.split("\n")

console.log(`File: ${path}`)
console.log(`Total lines: ${lines.length}`)

// Line 1017 (1-indexed) = index 1016
const lineIdx = 1016
const line = lines[lineIdx]

console.log(`\nBefore (line ${lineIdx + 1}):`)
console.log(JSON.stringify(line))

// Check if already fixed
if (line.includes("as RejectionReason")) {
  console.log("\n✓ Already fixed — 'as RejectionReason' found on this line")
  process.exit(0)
}

// Check if the line contains what we expect
if (!line.includes("vector.expectedReason")) {
  console.log("\n✗ Line does not contain 'vector.expectedReason' — unexpected content")
  console.log("Full line content:", JSON.stringify(line))
  process.exit(1)
}

// Apply the fix: replace vector.expectedReason) with vector.expectedReason as RejectionReason)
const fixedLine = line.replace(
  "vector.expectedReason)",
  "vector.expectedReason as RejectionReason)"
)

lines[lineIdx] = fixedLine

console.log(`\nAfter (line ${lineIdx + 1}):`)
console.log(JSON.stringify(fixedLine))

// Write back
const newContent = lines.join("\n")
writeFileSync(path, newContent, "utf-8")
console.log("\n✓ File written successfully")
console.log("Run: bun run typecheck")

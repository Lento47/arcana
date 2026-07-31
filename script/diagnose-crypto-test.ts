/**
 * Diagnostic: print exact content around the error lines in crypto.test.ts
 * Run: bun run script/diagnose-crypto-test.ts
 */
import { readFileSync } from "node:fs"

const path = "packages/core/src/crypto/crypto.test.ts"
const content = readFileSync(path, "utf-8")
const lines = content.split("\n")

console.log(`File: ${path}`)
console.log(`Total lines: ${lines.length}`)
console.log()

// Show lines 1010-1025 (0-indexed: 1009-1024)
console.log("=== Lines 1010-1025 ===")
for (let i = 1009; i < Math.min(1025, lines.length); i++) {
  const line = lines[i]
  const num = String(i + 1).padStart(4)
  // Show invisible chars
  const display = line.replace(/\r/g, "\\r").replace(/\t/g, "\\t")
  console.log(`${num}: ${display}`)
}

console.log()

// Show the import section (lines 30-45)
console.log("=== Import lines 30-45 ===")
for (let i = 29; i < Math.min(45, lines.length); i++) {
  const line = lines[i]
  const num = String(i + 1).padStart(4)
  const display = line.replace(/\r/g, "\\r").replace(/\t/g, "\\t")
  console.log(`${num}: ${display}`)
}

console.log()

// Search for "expectedReason" occurrences
console.log("=== All 'expectedReason' occurrences ===")
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("expectedReason")) {
    const num = String(i + 1).padStart(4)
    const display = lines[i].replace(/\r/g, "\\r").replace(/\t/g, "\\t")
    console.log(`${num}: ${display}`)
  }
}

console.log()

// Search for "VerificationStage" occurrences
console.log("=== All 'VerificationStage' occurrences ===")
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("VerificationStage")) {
    const num = String(i + 1).padStart(4)
    const display = lines[i].replace(/\r/g, "\\r").replace(/\t/g, "\\t")
    console.log(`${num}: ${display}`)
  }
}

console.log()

// Show hex dump of line 1017 (0-indexed: 1016)
const line1017 = lines[1016]
if (line1017) {
  console.log(`=== Hex dump of line 1017 (${line1017.length} chars) ===`)
  const hex = Buffer.from(line1017).toString("hex")
  console.log(hex)
  console.log(`Raw: ${JSON.stringify(line1017)}`)
}

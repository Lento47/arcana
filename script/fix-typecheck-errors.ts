/**
 * Patch script: fixes all remaining typecheck errors in @arcana/core
 * Uses simple string replacements for maximum reliability.
 * 
 * Run: bun run script/fix-typecheck-errors.ts
 */
import { readFileSync, writeFileSync } from "node:fs"

function patchFile(path: string, replacements: Array<[string, string]>): boolean {
  let content: string
  try {
    content = readFileSync(path, "utf-8")
  } catch {
    console.error(`✗ Cannot read ${path}`)
    return false
  }
  let changed = false
  for (const [find, replace] of replacements) {
    if (content.includes(find)) {
      content = content.split(find).join(replace)
      changed = true
    }
  }
  if (changed) {
    writeFileSync(path, content, "utf-8")
    console.log(`✓ ${path}: patched`)
  } else {
    console.log(`⊘ ${path}: all patterns already applied or not found`)
  }
  return changed
}

let totalPatched = 0

// Fix 1: verifier.ts — add default:throw case to getAllowedFields switch
totalPatched += patchFile("packages/core/src/crypto/verifier.ts", [
  [
    "case REVOCATION_DOMAIN: return REVOCATION_ALLOWED_FIELDS\n  }\n}",
    "case REVOCATION_DOMAIN: return REVOCATION_ALLOWED_FIELDS\n    default: throw new Error(`unknown domain: ${domain as string}`)\n  }\n}",
  ],
  [
    "case REVOCATION_DOMAIN: return REVOCATION_ALLOWED_FIELDS\r\n  }\r\n}",
    "case REVOCATION_DOMAIN: return REVOCATION_ALLOWED_FIELDS\r\n    default: throw new Error(`unknown domain: ${domain as string}`)\r\n  }\r\n}",
  ],
])

// Fix 2: run-d7i-tests.ts — assert needs boolean, not string
totalPatched += patchFile("packages/core/src/crypto/run-d7i-tests.ts", [
  [
    'assert(readResult.content.toString(), "content is readable")',
    'assert(readResult.content.toString().length > 0, "content is readable")',
  ],
])

// Fix 3: crypto.test.ts — add import + cast expectedStage + cast expectedReason
totalPatched += patchFile("packages/core/src/crypto/crypto.test.ts", [
  // 3a: Add VerificationStage import (handle both line endings)
  [
    'type VerificationResult,\n} from "./verifier"',
    'type VerificationResult,\n  type VerificationStage,\n} from "./verifier"',
  ],
  [
    'type VerificationResult,\r\n} from "./verifier"',
    'type VerificationResult,\r\n  type VerificationStage,\r\n} from "./verifier"',
  ],
  // 3b: Cast expectedStage (simple string replace, safe — only one occurrence)
  [
    "vector.expectedStage)",
    "vector.expectedStage as VerificationStage)",
  ],
  // 3c: Cast expectedReason (simple string replace, safe — only one occurrence)
  [
    "vector.expectedReason)",
    "vector.expectedReason as RejectionReason)",
  ],
])

console.log(`\nDone. ${totalPatched} file(s) patched.`)
console.log("Run: bun run typecheck")

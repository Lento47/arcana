import { describe, expect, test } from "bun:test"
import { ARCANA_OWNED_CONCEPTS, allConceptsHaveOwners, canonicalOwners, ownerForConcept } from "./ownership"

describe("Arcana canonical ownership", () => {
  test("every owned concept has one canonical owner", () => {
    expect(allConceptsHaveOwners()).toBe(true)
    expect(canonicalOwners().length).toBe(ARCANA_OWNED_CONCEPTS.length)
  })

  test("security classification is owned by SecurityContext", () => {
    expect(ownerForConcept("security_classification").owner).toBe("kernel/security-context")
  })

  test("completion gate is owned by verifier", () => {
    expect(ownerForConcept("completion_gate").owner).toBe("kernel/verifier")
  })

  test("visible runtime state is owned by TUI projection", () => {
    expect(ownerForConcept("visible_runtime_state").owner).toBe("kernel/tui-projection")
  })
})

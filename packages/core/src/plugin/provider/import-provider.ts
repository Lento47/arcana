import { Effect } from "effect"
import { Npm } from "../../npm"

async function importWithFallback<T = any>(pkg: string): Promise<T> {
  try {
    return await import(pkg)
  } catch {
    const installed = await Npm.add(pkg)
    if (!installed.entrypoint)
      throw new Error(`Package ${pkg} has no import entrypoint`)
    return await import(installed.entrypoint)
  }
}

/**
 * Import a provider SDK package with automatic Npm.add() fallback.
 *
 * If the package is not installed (e.g. it was moved to optionalDependencies and
 * the user hasn't installed it), this will install it on demand via Npm.add()
 * before retrying the import.
 *
 * Use inside Effect.gen blocks:
 *   const mod = yield* importSdk("@ai-sdk/openai")
 */
export const importSdk = (pkg: string) => Effect.promise(() => importWithFallback(pkg))

/**
 * Import any package with automatic Npm.add() fallback, outside the Effect system.
 *
 * Use in plain async functions:
 *   const { GoogleAuth } = await importPackage("google-auth-library")
 */
export async function importPackage<T = any>(pkg: string): Promise<T> {
  return importWithFallback<T>(pkg)
}

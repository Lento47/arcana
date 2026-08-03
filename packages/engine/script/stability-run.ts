/**
 * Engine stability stress gate.
 *
 * Runs the load-bound engine suites repeatedly as FRESH processes.
 *
 * Why fresh processes instead of `bun test --rerun-each`:
 * Bun's --rerun-each re-executes file-level afterAll hooks (including the
 * engine test preload's AppRuntime disposal and temp-tree cleanup) once per
 * iteration in the same process, while src modules stay cached from
 * iteration 1. Iteration 2+ then fails with "ManagedRuntime disposed" or
 * NotFound writes into the deleted XDG config tree. Reproduced on
 * Bun 1.3.14 (Windows) with `--rerun-each 2`: every second iteration of
 * every snapshot test failed. Repeating whole runs in fresh processes is the
 * reliable stress signal and still surfaces every individual failure.
 *
 * Per-test timeouts (15s revert/compact restore, 10s snapshot) remain the
 * tightest legitimate ceiling for these load-bound integration tests; the
 * runner does not add a global timeout that could hide a failing test.
 * Individual failures are printed by name and fail the gate.
 */

const ITERATIONS = Number(process.env.STABILITY_ITERATIONS ?? "10")
const FILES = ["test/session/revert-compact.test.ts", "test/snapshot/snapshot.test.ts"]
const PER_TEST_TIMEOUT_MS = "30000"

function summaryLine(text: string): string {
  const pass = text.match(/(\d+) pass/)
  const fail = text.match(/(\d+) fail/)
  const skip = text.match(/(\d+) skip/)
  const ran = text.match(/Ran (\d+) tests across (\d+) files/)
  return [
    pass ? `${pass[0]}` : "? pass",
    fail ? `${fail[0]}` : "? fail",
    skip ? `${skip[0]}` : "? skip",
    ran ? `${ran[0]}` : "no summary",
  ].join(" · ")
}

let failures = 0

for (let i = 1; i <= ITERATIONS; i++) {
  const proc = Bun.spawn(
    [process.execPath, "test", ...FILES, "--timeout", PER_TEST_TIMEOUT_MS, "--randomize"],
    {
      cwd: import.meta.dir + "/..",
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env },
    },
  )
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  const exitCode = await proc.exited
  const text = `${stdout}\n${stderr}`
  const clean = exitCode === 0
  console.log(`[iteration ${i}/${ITERATIONS}] exit=${exitCode} · ${summaryLine(text)}`)

  if (!clean) {
    failures++
    const failNames = [...text.matchAll(/^\(fail\) (.+)$/gm)].map((m) => m[1])
    for (const name of failNames) console.log(`  FAIL: ${name}`)
    if (failNames.length === 0) {
      // Runner crash or non-test failure — surface the tail so the cause is
      // never hidden behind the gate.
      console.log(text.split(/\r?\n/).slice(-30).join("\n"))
    }
  }
}

const cleanIterations = ITERATIONS - failures
console.log(`stability: ${cleanIterations}/${ITERATIONS} iterations clean`)
process.exit(failures === 0 ? 0 : 1)

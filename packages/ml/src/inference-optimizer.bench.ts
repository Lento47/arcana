import { performance } from "node:perf_hooks"

import { createInferenceOptimizer, type InferenceContextItem } from "./inference-optimizer.js"

type BenchmarkResult = {
  name: string
  samples: number
  p50Milliseconds: number
  p95Milliseconds: number
  maximumMilliseconds: number
  targetP95Milliseconds: number
  passed: boolean
}

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0
}

function summarize(name: string, samples: number[], targetP95Milliseconds: number): BenchmarkResult {
  const p95Milliseconds = percentile(samples, 0.95)
  return {
    name,
    samples: samples.length,
    p50Milliseconds: Number(percentile(samples, 0.5).toFixed(3)),
    p95Milliseconds: Number(p95Milliseconds.toFixed(3)),
    maximumMilliseconds: Number(Math.max(...samples).toFixed(3)),
    targetP95Milliseconds,
    passed: p95Milliseconds <= targetP95Milliseconds,
  }
}

function measure(samples: number, operation: () => void): number[] {
  const durations: number[] = []
  for (let index = 0; index < samples; index += 1) {
    const start = performance.now()
    operation()
    durations.push(performance.now() - start)
  }
  return durations
}

function ordinaryContext(): InferenceContextItem[] {
  return Array.from({ length: 8 }, (_, index) => ({
    id: `ordinary-${index}`,
    kind: index % 3 === 0 ? "file" : "memory",
    content: `Context ${index} describes token packing, response evidence, and validation commands.`,
    priority: 1 - index / 10,
    recency: 1 - index / 12,
  }))
}

function largeContext(): InferenceContextItem[] {
  return Array.from({ length: 1_000 }, (_, index) => ({
    id: `large-${index}`,
    kind: index % 5 === 0 ? "file" : "memory",
    content: `Candidate ${index} contains ${index % 7 === 0 ? "token packing verification evidence" : "historical session detail"}.`,
    priority: (index % 10) / 10,
    recency: (index % 20) / 20,
    tags: index % 7 === 0 ? ["verification"] : ["history"],
  }))
}

export function runInferenceOptimizerBenchmark(): BenchmarkResult[] {
  const optimizer = createInferenceOptimizer({ mode: "optimize" })
  const request = "Implement and test token-aware context packing with explicit evidence"
  const ordinary = ordinaryContext()
  const large = largeContext()

  const runOrdinary = () => {
    const preparation = optimizer.prepare({ request, contextItems: ordinary, model: { contextWindow: 32_768 } })
    optimizer.evaluate({
      preparation,
      response:
        "Changed the token packing patch in `packages/ml/src/inference-optimizer.ts`; run `bun test packages/ml/src` to verify it.",
      evidence: [{ id: "test", type: "test", status: "passed", reference: "bun test packages/ml/src" }],
    })
  }
  const runLarge = () => {
    optimizer.prepare({ request, contextItems: large, model: { contextWindow: 32_768 } })
  }

  measure(50, runOrdinary)
  measure(5, runLarge)

  return [
    summarize("ordinary prepare + evaluate", measure(500, runOrdinary), 5),
    summarize("1,000-item context prepare", measure(30, runLarge), 50),
  ]
}

if (import.meta.main) {
  const results = runInferenceOptimizerBenchmark()
  console.log(JSON.stringify(results, null, 2))
  if (results.some((result) => !result.passed)) process.exitCode = 1
}

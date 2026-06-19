export function estimateTokens(text: string): number {
  if (!text) return 0
  const codeChars = (text.match(/[{}[\]();:|<>]/g) || []).length
  const regularChars = text.length - codeChars
  return Math.ceil(regularChars / 4) + Math.ceil(codeChars / 2)
}

const RATES = {
  cheap: { input: 0.0000003, output: 0.0000011 },
  mid: { input: 0.000003, output: 0.00001 },
  premium: { input: 0.000005, output: 0.00002 },
  ultra: { input: 0.00003, output: 0.00006 },
}

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const m = model.toLowerCase()
  let rate = RATES.mid
  if (m.includes("deepseek") || m.includes("qwen") || m.includes("mistral") || m.includes("gemma")) rate = RATES.cheap
  else if (m.includes("sonnet") || m.includes("gpt-4o") || m.includes("gpt-5")) rate = RATES.premium
  else if (m.includes("opus")) rate = RATES.ultra
  return inputTokens * rate.input + outputTokens * rate.output
}

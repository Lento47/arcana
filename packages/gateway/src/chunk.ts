/**
 * Split an outbound message into platform-sized chunks with an honest-tail
 * marker, instead of silent slicing. House style (count-suffix marker):
 * engine `message-v2.ts` `[Tool output truncated for compaction: omitted N
 * chars]`, `compaction-assemble.ts`, `compaction.ts`, `compaction-strategy.ts`.
 * Intermediate chunks carry a `…[continued]` tail so a dropped follow-up
 * chunk is visible, and the final chunk reports how many chars were omitted.
 */
export function chunkWithHonestTail(text: string, maxChars: number): string[] {
  if (maxChars <= 0) throw new Error("maxChars must be > 0")
  if (text.length <= maxChars) return [text]
  const chunks: string[] = []
  let remaining = text
  let sent = 0
  while (remaining.length > maxChars) {
    const head = remaining.slice(0, maxChars)
    remaining = remaining.slice(maxChars)
    sent += head.length
    chunks.push(head + "\n…[continued]")
  }
  if (remaining.length > 0) {
    sent += remaining.length
    const omitted = text.length - sent
    chunks.push(remaining + `\n[…truncated: omitted ${omitted} chars]`)
  }
  return chunks
}

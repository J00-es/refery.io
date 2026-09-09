/**
 * Is the AI gateway reachable from here? One tiny Haiku call, printed with
 * its usage. Run with the same env the app uses:  npx tsx scripts/engine/probe-gateway.ts
 */
import { generateText } from 'ai'

async function main() {
  const t0 = Date.now()
  try {
    const r = await generateText({ model: 'anthropic/claude-haiku-4-5', prompt: 'Reply with the single word: ok', maxOutputTokens: 5, maxRetries: 0, abortSignal: AbortSignal.timeout(30_000) })
    console.log('OK', JSON.stringify({ text: r.text, usage: r.usage, ms: Date.now() - t0 }))
  } catch (e) {
    console.log('FAIL', (e as Error).message.slice(0, 400))
  }
}

main()

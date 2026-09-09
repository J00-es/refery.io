/**
 * Is the AI gateway reachable from here, and is the ledger? One tiny Haiku
 * call through the paid gateway, printed with its usage and its ledger row.
 * Run with the same env the app uses:  npx tsx scripts/engine/probe-gateway.ts
 */
import { paidGenerateText } from '../../lib/engine/paid'

async function main() {
  const t0 = Date.now()
  try {
    const { result, charge } = await paidGenerateText(
      { model: 'anthropic/claude-haiku-4-5', prompt: 'Reply with the single word: ok', maxOutputTokens: 5, abortSignal: AbortSignal.timeout(30_000) },
      { source: 'benchmark', task: 'probe', discretionary: true },
    )
    console.log('OK', JSON.stringify({ text: result.text, charge, ms: Date.now() - t0 }))
  } catch (e) {
    console.log('FAIL', (e as Error).name, (e as Error).message.slice(0, 400))
  }
}

main()

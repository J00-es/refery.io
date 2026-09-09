import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { LedgerAdapter } from '../../lib/engine/ledger'

/** Durable, concurrency-safe allowance for synthetic tests before production migrations.
 * This never substitutes for the production account ledger. Export its charges
 * for reconciliation; keep the same file when retrying an interrupted benchmark.
 */
export function benchmarkLedger(file: string, capUsd = 5): LedgerAdapter & { summary(): unknown; close(): void } {
  if (!Number.isFinite(capUsd) || capUsd <= 0 || capUsd > 5) throw new Error('Synthetic benchmark cap must be positive and at most $5')
  mkdirSync(dirname(file), { recursive: true })
  const db = new DatabaseSync(file)
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS charges (id TEXT PRIMARY KEY, status TEXT, reserve REAL, actual REAL DEFAULT 0, model TEXT, metadata TEXT, request_id TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);')
  const used = () => Number((db.prepare("SELECT coalesce(sum(CASE WHEN status IN ('reserved','uncertain') THEN reserve ELSE actual END),0) AS n FROM charges").get() as { n: number }).n)
  return {
    async rpc(fn, args = {}) {
      try {
        if (fn === 'engine_reserve_budget') {
          if (args.p_source !== 'benchmark') throw new Error('This allowance is for synthetic benchmarks only')
          const estimate = Number(args.p_estimated_usd)
          if (!Number.isFinite(estimate) || estimate <= 0) throw new Error('Invalid estimate')
          db.exec('BEGIN IMMEDIATE')
          try {
            const remaining = capUsd - used()
            if (estimate > remaining) { db.exec('COMMIT'); return { data: [{ allowed: false, deferred: true, usage_id: null, reason: 'benchmark_cap', remaining_usd: remaining }], error: null } }
            const id = randomUUID()
            db.prepare('INSERT INTO charges (id,status,reserve,model,metadata) VALUES (?,?,?,?,?)').run(id, 'reserved', estimate, String(args.p_model), JSON.stringify(args.p_metadata ?? {}))
            db.exec('COMMIT')
            return { data: [{ allowed: true, deferred: false, usage_id: id, reason: 'ok', remaining_usd: remaining - estimate }], error: null }
          } catch (e) { db.exec('ROLLBACK'); throw e }
        }
        if (fn === 'engine_finalize_budget') {
          const status = String(args.p_status)
          if (!['completed', 'failed', 'uncertain'].includes(status)) throw new Error('Invalid status')
          const amount = Number(args.p_actual_usd)
          if (!Number.isFinite(amount) || amount < 0) throw new Error('Invalid actual cost')
          db.prepare("UPDATE charges SET status=?,actual=?,request_id=? WHERE id=? AND status IN ('reserved','uncertain')").run(status, amount, args.p_provider_request_id ? String(args.p_provider_request_id) : null, String(args.p_usage_id))
          return { data: null, error: null }
        }
        throw new Error(`Unsupported benchmark ledger operation: ${fn}`)
      } catch (e) { return { data: null, error: { message: (e as Error).message } } }
    },
    summary: () => ({ cap_usd: capUsd, consumed_or_reserved_usd: used(), charges: db.prepare('SELECT * FROM charges ORDER BY created_at,id').all() }),
    close: () => db.close(),
  }
}

import EmbeddedPostgres from 'embedded-postgres'
import postgres from 'postgres'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
import { createServer } from 'node:net'
import type { ChildProcess } from 'node:child_process'
const root = path.resolve(__dirname, '../..')
const dir = path.join(root, '.engine', `postgres-${Date.now()}`)
mkdirSync(dir, { recursive: true })
const password = randomUUID()
let pg: EmbeddedPostgres | undefined
const results: { case: string; passed: boolean }[] = []
let a: ReturnType<typeof postgres> | undefined, b: ReturnType<typeof postgres> | undefined
async function main() {
 const port=await new Promise<number>((resolve,reject)=>{const probe=createServer();probe.once('error',reject);probe.listen(0,'127.0.0.1',()=>{const addr=probe.address() as {port:number};probe.close(()=>resolve(addr.port))})})
 pg = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password, port, persistent: true, createPostgresUser: false, initdbFlags: ['--encoding=UTF8', '--locale=C'], postgresFlags: ['-h', '127.0.0.1'], onLog: () => {}, onError: () => {} })
 await pg.initialise(); await pg.start()
 if(process.argv.includes('--fail-harness-probe')) throw new Error('Intentional harness failure probe')
 const options = { host: '127.0.0.1', port, user: 'postgres', password, database: 'postgres', max: 1, onnotice: () => {}, connect_timeout: 10 }
 a = postgres(options); b = postgres(options)
 const check = (label: string) => { results.push({ case: label, passed: true }); console.log(`PASS ${label}`) }
 await a.unsafe(readFileSync(path.join(root, 'tests/fixtures/local-engine-base.sql'), 'utf8'))
 const part2 = readFileSync(path.join(root, 'scripts/engine/2026-09-09-02-eligibility-and-matching.sql'), 'utf8')
 // The real policy and decision tables, stopping before vector retrieval (not provided by the Windows runtime).
 const policyStart = part2.indexOf('create table if not exists public.candidate_human_decisions')
 const vectorStart = part2.indexOf('drop function', policyStart)
 await a.unsafe(part2.slice(policyStart, vectorStart))
 for (const file of ['2026-09-09-03-engine-records.sql','2026-09-09-04-review-fixes.sql']) await a.unsafe(readFileSync(path.join(root, 'scripts/engine', file), 'utf8'))
 await a`create trigger candidates_guard_journey before update on candidates for each row execute function candidates_guard_journey_trg()`
 check('policy and complete record/review migrations apply to the synthetic baseline')
 const ids = Array.from({ length: 4 }, () => randomUUID())
 for (const id of ids) { await a`insert into candidates(id,name,journey_stage,journey_stage_source) values (${id},'Synthetic fixture','uploaded','human')`; await a`select enqueue_candidate_panel(${id},'created')` }
 const [pidA] = await a`select pg_backend_pid() as pid`; const [pidB] = await b`select pg_backend_pid() as pid`
 assert.notEqual(pidA.pid, pidB.pid)
 const [qa,qb] = await Promise.all([a`select * from claim_panel_queue(1,60)`, b`select * from claim_panel_queue(1,60)`])
 assert.equal(qa.length,1); assert.equal(qb.length,1); assert.notEqual(qa[0].candidate_id,qb[0].candidate_id)
 check('two independent sessions claim disjoint candidates concurrently')
 const targeted = await b`select * from claim_panel_queue(1,60,${qa[0].candidate_id})`; assert.equal(targeted.length,0)
 check('targeted rerun cannot steal an unexpired lease')
 await a`update candidate_panel_queue set lease_expires_at=now()-interval '1 second' where candidate_id=${qa[0].candidate_id}`
 const [reclaimed] = await b`select * from claim_panel_queue(1,60,${qa[0].candidate_id})`
 assert.ok(reclaimed); assert.notEqual(reclaimed.lease_token,qa[0].lease_token)
 const [renew] = await a`select renew_panel_lease(${qa[0].candidate_id},${qa[0].lease_token},60) as ok`; assert.equal(renew.ok,false)
 const [complete] = await a`select complete_panel_queue(${qa[0].candidate_id},${qa[0].lease_token},'done','succeeded') as ok`; assert.equal(complete.ok,false)
 check('expired lease can be reclaimed; stale worker cannot renew or complete')
 await a`select enqueue_candidate_panel(${reclaimed.candidate_id},'manual')`
 const [whileRunning] = await a`select * from candidate_panel_queue where candidate_id=${reclaimed.candidate_id}`
 assert.equal(whileRunning.lease_token,reclaimed.lease_token); assert.equal(whileRunning.status,'running')
 await b`select complete_panel_queue(${reclaimed.candidate_id},${reclaimed.lease_token},'done','succeeded')`
 const [rerun] = await a`select status from candidate_panel_queue where candidate_id=${reclaimed.candidate_id}`; assert.equal(rerun.status,'queued')
 check('enqueue during an active run preserves ownership and requests a later rerun')
 for (const stage of ['not_fit','dormant']) {
   await a`update candidates set journey_stage=${stage},journey_stage_source='human' where id=${ids[0]}`
   await a`update candidates set journey_stage='decision_pending',journey_stage_source='desk',panel_grade='A' where id=${ids[0]}`
   const [row]: {journey_stage:string;panel_grade:string}[] = await a`select journey_stage,panel_grade from candidates where id=${ids[0]}`; assert.equal(row.journey_stage,stage); assert.equal(row.panel_grade,'A')
   await a`update candidates set journey_stage='decision_pending',journey_stage_source='human' where id=${ids[0]}`
   const [human]: {journey_stage:string}[] = await a`select journey_stage from candidates where id=${ids[0]}`; assert.equal(human.journey_stage,'decision_pending')
 }
 check('real SQL preserves synthetic human not-fit and dormant states and permits explicit human reopening')
 await a`update engine_settings set hard_limit_usd=1,defer_usd=0.9,alert_usd=0.7 where id=1`
 const [ra,rb] = await Promise.all([a`select * from engine_reserve_budget('benchmark','parallel','synthetic',0.75)`,b`select * from engine_reserve_budget('benchmark','parallel','synthetic',0.75)`])
 assert.equal([ra[0].allowed,rb[0].allowed].filter(Boolean).length,1)
 const allowed = ra[0].allowed ? ra[0] : rb[0]
 await a`select engine_finalize_budget(${allowed.usage_id},0,0,0,'uncertain')`
 const [blocked] = await b`select * from engine_reserve_budget('benchmark','after_timeout','synthetic',0.75)`; assert.equal(blocked.allowed,false)
 check('concurrent reservations obey one cap and uncertain calls retain their allowance')
 await a`insert into desk_outbox(kind,idempotency_key,payload) values ('synthetic','a','{}'),('synthetic','b','{}')`
 const [oa,ob] = await Promise.all([a`select * from claim_outbox(1,60)`,b`select * from claim_outbox(1,60)`])
 assert.equal(oa.length,1); assert.equal(ob.length,1); assert.notEqual(oa[0].id,ob[0].id)
 check('two independent sessions claim disjoint outbox items without sending anything')
 const v5=readFileSync(path.join(root,'supabase/migrations/20260909105010_engine_evidence_and_complete_matching.sql'),'utf8')
 await a.unsafe(v5.slice(0,v5.indexOf('-- SHADOW VECTOR STORAGE')))
 const [acl]=await a`select has_function_privilege('anon','public.engine_process_next_candidate(text,uuid)','execute') as anonymous,has_function_privilege('authenticated','public.engine_process_next_candidate(text,uuid)','execute') as authenticated,has_function_privilege('service_role','public.engine_process_next_candidate(text,uuid)','execute') as service`
 assert.equal(acl.anonymous,false);assert.equal(acl.authenticated,false);assert.equal(acl.service,true)
 check('new worker mutation RPC is restricted to the service role')
 // Retrieval is a controlled fixture here; pgvector/HNSW is a separate gate.
 await a.unsafe(`create function match_jobs_for_candidate_v2(uuid,double precision,integer,integer)
 returns table(job_id uuid,title text,company_name text,location text,similarity double precision,retrieval_route text)
 language sql as $$ select id,title,'Synthetic Co'::text,'Remote'::text,0.8::double precision,'embedding'::text from jobs where status='open' order by id $$;`)
 const jid=randomUUID()
 await a`insert into jobs(id,title,status) values(${jid},'Old role reopened','open')`
 await a`update candidates set embedding=true,journey_stage='uploaded',journey_stage_source='human'`
 await a`update candidates set journey_stage='dormant' where id=${ids[2]}`
 await a`update candidates set embedding=null where id=${ids[3]}`
 await a`select engine_start_nightly_match('synthetic-day-1')`
 const reviewer=randomUUID()
 await Promise.all([a`select engine_process_next_candidate('synthetic-day-1',${reviewer})`,b`select engine_process_next_candidate('synthetic-day-1',${reviewer})`])
 while((await a`select engine_nightly_status('synthetic-day-1') as s`)[0].s.queued>0) await a`select engine_process_next_candidate('synthetic-day-1',${reviewer})`
 const [day1]=await a`select engine_nightly_status('synthetic-day-1') as s`
 assert.equal(day1.s.done,2);assert.equal(day1.s.proposed,2);assert.equal(day1.s.excluded,1);assert.equal(day1.s.missing_embedding,1)
 assert.ok((await a`select owner_user_id from job_candidate_pipeline`).every(row=>row.owner_user_id===reviewer))
 await a`select engine_start_nightly_match('synthetic-day-1')`
 assert.equal((await a`select engine_nightly_status('synthetic-day-1') as s`)[0].s.queued,0)
 check('concurrent nightly transactions create proposals once; same-run restart preserves completed progress')
 await a`update jobs set status='closed' where id=${jid}`
 await a`select engine_start_nightly_match('synthetic-day-2')`
 while((await a`select engine_nightly_status('synthetic-day-2') as s`)[0].s.queued>0) await a`select engine_process_next_candidate('synthetic-day-2')`
 assert.equal((await a`select engine_nightly_status('synthetic-day-2') as s`)[0].s.evaluated,0)
 check('zero-result candidates still complete and record progress')
 await a`update jobs set status='open' where id=${jid}`
 await a`select engine_start_nightly_match('synthetic-day-3')`
 await a.unsafe(`create function fixture_fail_assessment() returns trigger language plpgsql as $$ begin raise exception 'synthetic write failure'; end $$;
 create trigger fixture_fail before insert on match_assessments for each row execute function fixture_fail_assessment();`)
 // Force the first queued item to be one of the active fixture candidates.
 await a`delete from engine_nightly_candidates where run_key='synthetic-day-3' and candidate_id<>${ids[0]}`
 await assert.rejects(a`select engine_process_next_candidate('synthetic-day-3')`)
 assert.equal((await a`select engine_nightly_status('synthetic-day-3') as s`)[0].s.queued,1)
 await a`drop trigger fixture_fail on match_assessments`
 await a`select engine_process_next_candidate('synthetic-day-3')`
 assert.equal((await a`select engine_nightly_status('synthetic-day-3') as s`)[0].s.evaluated,1)
 check('failed assessment rolls back progress; reopened old job is reconsidered on retry without a pipeline-date cursor')
 await a`update candidates set parsed_data='{"skills":["Rust"]}' where id=${ids[0]}`
 const parsed={skills:['Rust']}, fact=[{fact_key:'skills',fact_value:['Rust'],source_path:'parsed_data.skills'}]
 const [source]=await a`select engine_save_fact_bundle(${ids[0]},${a.json(parsed)},'synthetic-hash',${a.json(fact)}) as id`
 await a`select engine_save_fact_bundle(${ids[0]},${a.json(parsed)},'synthetic-hash',${a.json(fact)})`
 assert.equal((await a`select count(*)::int as n from candidate_facts where source_version_id=${source.id}`)[0].n,1)
 await assert.rejects(a`select engine_save_fact_bundle(${ids[0]},'{}','changed','[]')`)
 check('fact bundles are idempotent and stale source snapshots are refused')
 const card={priorities_confirmed:false,requirements:[{hard_gate:false,quote:'Rust'}]}
 await a`select engine_save_scorecard_draft(${jid},${a.json({title:'Old role reopened'})},${a.json(card)},'card-hash')`
 await assert.rejects(a`select engine_save_scorecard_draft(${jid},'{}','{"priorities_confirmed":true,"requirements":[]}','forged')`)
 check('scorecard draft importer cannot forge human confirmation')
 const paidId=randomUUID(), legacyPanel=randomUUID(), meteredPanel=randomUUID()
 await a`insert into brain_ai_usage(id,month_start,model,status,actual_usd) values(${paidId},date_trunc('month',now())::date,'synthetic','completed',0.1)`
 await a`insert into candidate_panels(id,candidate_id,model,cost_usd,usage_id) values(${legacyPanel},${ids[0]},'synthetic',0.2,null),(${meteredPanel},${ids[0]},'synthetic',0.1,${paidId})`
 const m4=readFileSync(path.join(root,'scripts/engine/2026-09-09-04-review-fixes.sql'),'utf8')
 await a.unsafe(m4);await a.unsafe(m4)
 assert.equal((await a`select count(*)::int as n from brain_ai_usage where metadata->>'import_key'=${'candidate_panels:'+legacyPanel}`)[0].n,1)
 assert.equal((await a`select count(*)::int as n from brain_ai_usage where metadata->>'import_key'=${'candidate_panels:'+meteredPanel}`)[0].n,0)
 check('migration reapplication imports legacy costs once and never double-counts already-metered panels')
 console.log(JSON.stringify({ backend_pids:[pidA.pid,pidB.pid],results }))
}
main().catch(e => { results.push({ case: e instanceof Error?e.message:String(e), passed: false }); console.error(e); process.exitCode=1 }).finally(async () => {
 if(a) await a.end({timeout:2}); if(b) await b.end({timeout:2})
 if(pg){
  // Version-pinned runtime fix: stop() otherwise waits forever if the child
  // exited before it registered its exit listener (for example a startup error).
  const runtime=pg as unknown as {process?:ChildProcess}
  if(runtime.process&&(runtime.process.exitCode!==null||runtime.process.signalCode!==null))runtime.process=undefined
  try { await pg.stop() } catch(e) { results.push({case:`database cleanup: ${String(e)}`,passed:false}) }
 }
 const filename=process.argv.includes('--fail-harness-probe')?'database-failure-probe-2026-09-09.json':'database-integration-2026-09-09.json'
 writeFileSync(path.join(root,'docs/engine',filename),JSON.stringify({ scope:'real PostgreSQL 17.6, two sessions, synthetic baseline; vector retrieval and hosted Supabase not covered', results },null,2))
 // The embedded runtime's async exit hook can replace an implicit exit code.
 // All connections, the server and the report are closed before explicit exit.
 process.exit(results.some(r=>!r.passed)?1:0)
})

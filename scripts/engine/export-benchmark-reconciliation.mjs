import {readFileSync,writeFileSync} from 'node:fs'
const report=JSON.parse(readFileSync('docs/engine/benchmark-2026-09-09.json','utf8'))
const charges=report.allowance.charges
if(charges.some(c=>c.status!=='completed'))throw new Error('Reconcile uncertain charges before exporting')
const quote=s=>"'"+String(s).replaceAll("'","''")+"'"
const rows=charges.map(c=>`(${quote(c.id)}::uuid,${quote(report.date.slice(0,7)+'-01')}::date,${quote(c.model)},${c.actual},${quote(c.request_id)})`).join(',\n')
const sql=`-- Actual token usage priced by the route register: ${charges.reduce((n,c)=>n+c.actual,0).toFixed(6)} USD.
-- Run once after engine migrations; idempotent. No model call is made.
begin;
insert into public.brain_budget_months(month_start,hard_limit_usd)
select ${quote(report.date.slice(0,7)+'-01')}::date,hard_limit_usd from public.engine_settings where id=1 on conflict do nothing;
select month_start from public.brain_budget_months where month_start=${quote(report.date.slice(0,7)+'-01')}::date for update;
with charges(id,month_start,model,actual_usd,request_id) as (values
${rows})
insert into public.brain_ai_usage(id,month_start,request_kind,model,reservation_usd,actual_usd,status,source,task,provider_request_id,metadata,finalized_at)
select id,month_start,'synthetic_panel_benchmark',model,0,actual_usd,'completed','benchmark','synthetic_panel_benchmark',request_id,'{"import":"local-synthetic-benchmark-2026-09-09"}'::jsonb,now()
from charges c where not exists(select 1 from public.brain_ai_usage u where u.provider_request_id=c.request_id) on conflict(id) do nothing;
update public.brain_budget_months b set spent_usd=(select coalesce(sum(u.actual_usd),0) from public.brain_ai_usage u where u.month_start=b.month_start and u.status='completed')
where b.month_start=${quote(report.date.slice(0,7)+'-01')}::date;
commit;
`
writeFileSync('scripts/engine/2026-09-09-benchmark-reconciliation.sql',sql)
console.log(JSON.stringify({charges:charges.length,usd:charges.reduce((n,c)=>n+c.actual,0),applied:false}))

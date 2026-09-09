/** Read-only: builds a private, UNLABELLED review set. Makes no model calls. */
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { sha256 } from '../../lib/engine/evidence'
for(const line of readFileSync(process.argv[2]??'.env.local','utf8').split(/\r?\n/)){
 const m=line.match(/^\s*(NEXT_PUBLIC_SUPABASE_URL|SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY)\s*=\s*(.*?)\s*$/)
 if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^['"]|['"]$/g,'')
}
const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}})
async function all(table:string,columns:string,open=false){
 const rows:Record<string,unknown>[]=[];let after=''
 while(true){
  let q=admin.from(table).select(columns).order('id').limit(1000)
  if(after)q=q.gt('id',after)
  if(open)q=q.eq('status','open')
  const {data,error}=await q;if(error)throw error
  if(!data?.length)break
  rows.push(...data as unknown as Record<string,unknown>[]);after=String((data.at(-1) as unknown as Record<string,unknown>).id)
 }
 return rows
}
async function main(){
 const candidates=(await all('candidates','id,name,parsed_data,panel_grade,journey_stage,person_type,intake_source')).filter(c=>c.intake_source!=='calibration')
 const jobs=await all('jobs','id,title,department',true)
 const groups=new Map<string,Record<string,unknown>[]>()
 for(const c of candidates){
  const key=`${c.panel_grade??'ungraded'}:${c.journey_stage??'unknown'}`
  groups.set(key,[...(groups.get(key)??[]),c])
 }
 for(const group of groups.values())group.sort((a,b)=>sha256(String(a.id)).localeCompare(sha256(String(b.id))))
 const selected:Record<string,unknown>[]=[]
 while(selected.length<120){let found=false;for(const group of groups.values()){if(group.length&&selected.length<120){selected.push(group.shift()!);found=true}}if(!found)break}
 const jobOrder=jobs.sort((a,b)=>sha256(String(a.id)).localeCompare(sha256(String(b.id))))
 const cases:Record<string,unknown>[]=[];const chosenJobIds=new Set<string>();const errors:Record<string,string>[]=[]
 for(let i=0;i<selected.length;i+=6){
  const batch=await Promise.all(selected.slice(i,i+6).map(async(c,offset)=>{
   const {data,error}=await admin.rpc('match_jobs_for_candidate',{candidate_uuid:c.id,similarity_threshold:0.40,max_results:30,max_per_company:2})
   if(error)errors.push({candidate_id:String(c.id),error:error.message})
   const retrieved=Array.isArray(data)?data as {job_id:string}[]:[]
   const ids=[retrieved[0]?.job_id,retrieved[4]?.job_id,jobOrder[(i+offset)*137%jobOrder.length]?.id].filter(Boolean).map(String)
   for(let j=0;new Set(ids).size<3&&j<jobOrder.length;j++)ids.push(String(jobOrder[j].id))
   const unique=[...new Set(ids)].slice(0,3);unique.forEach(id=>chosenJobIds.add(id))
   return {candidate_id:c.id,source_kind:'existing parsed resume; claims are unverified',evidence:c.parsed_data??{},
    review:{reviewer:null,reviewed_at:null,scope_level:null,function:null,evidence_sufficient:null,notes:null},
    pairs:unique.map(job_id=>({job_id,label:null,screening_appropriate:null,client_intro_ready:null,confirmed_blockers:[],evidence_spans:[],notes:null}))}
  }))
  cases.push(...batch);console.log(`Prepared ${cases.length}/${selected.length} candidates`)
 }
 const details:Record<string,unknown>[]=[];const ids=[...chosenJobIds]
 for(let i=0;i<ids.length;i+=100){
  const {data,error}=await admin.from('jobs').select('id,title,company_name,description,requirements,skills_required,location,remote_policy,salary_min,salary_max,status').in('id',ids.slice(i,i+100))
  if(error)throw error;details.push(...data)
 }
 const out='.engine/human-evaluation';mkdirSync(out,{recursive:true})
 writeFileSync(`${out}/review-packet.json`,JSON.stringify({version:'human-eval-v1',created_at:new Date().toISOString(),label_status:'UNLABELLED',
  instructions:'A human reviewer must assign labels. Do not ask an LLM to fill ground truth. Labels: strong, possible, not_supported, unknown. Keep unknowns explicit. This is a sampled pool, not exhaustive job-board relevance.',cases,jobs:details},null,2))
 writeFileSync(`${out}/sampling-manifest.json`,JSON.stringify({seed:'sha256(candidate/job id)',sampling:'round-robin across legacy grade and journey strata; grade used only for sampling, hidden from reviewer',candidate_count:cases.length,pair_count:cases.reduce((n,c)=>n+(c.pairs as unknown[]).length,0),retrieval_errors:errors,baseline:'existing four-argument retrieval; top result, fifth result, deterministic random job; missing results filled deterministically',promotion_ready:false},null,2))
 console.log(JSON.stringify({candidates:cases.length,pairs:cases.reduce((n,c)=>n+(c.pairs as unknown[]).length,0),retrieval_errors:errors.length,output:out,labels_created:0}))
}
main().catch(e=>{console.error(e.message);process.exitCode=1})

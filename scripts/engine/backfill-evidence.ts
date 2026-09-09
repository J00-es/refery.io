/** Read-only unless --apply. --embed-shadow additionally buys versioned shadow
 * vectors through the shared ledger; active matching vectors are untouched. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { buildFactBundle, persistFactBundle } from '../../lib/engine/fact-bundle'
import { draftScorecard } from '../../lib/engine/scorecards'
import { capabilityText } from '../../lib/engine/capability-text'
import { paidEmbed, setLedgerAdapter } from '../../lib/engine/paid'

const args=process.argv.slice(2)
const opt=(name:string, fallback='')=>args.includes(name)?args[args.indexOf(name)+1]:fallback
const envFile=opt('--env-file','.env.local')
for(const line of readFileSync(envFile,'utf8').split(/\r?\n/)){
 const m=line.match(/^\s*(NEXT_PUBLIC_SUPABASE_URL|SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|AI_GATEWAY_API_KEY)\s*=\s*(.*?)\s*$/)
 if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^['"]|['"]$/g,'')
}
const limit=Number(opt('--limit','100'))
if(!Number.isInteger(limit)||limit<1||limit>100000)throw new Error('Invalid limit')
const kind=opt('--kind','candidate') as 'candidate'|'job'
if(!['candidate','job'].includes(kind))throw new Error('Kind must be candidate or job')
const apply=args.includes('--apply'), embed=args.includes('--embed-shadow')
if(embed&&!apply)throw new Error('Embedding requires --apply; omit it for a free preview')
const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}})
setLedgerAdapter(admin)
const records:Record<string,unknown>[]=[]
const briefs=new Map<string,{id:string;version:number;content:unknown}|undefined>()
async function main(){
 let after=opt('--after'), processed=0
 while(processed<limit){
  // No embedding columns in source comparison: a successful backfill must not
  // invalidate its own input snapshot. A concurrent source edit refuses the CAS.
  const columns=kind==='candidate'?'id,name,email,parsed_data':'id,title,company_name,department,description,requirements,skills_required,company_id,status'
  let query=admin.from(kind==='candidate'?'candidates':'jobs').select(columns).order('id').limit(Math.min(500,limit-processed))
  if(kind==='job')query=query.eq('status','open')
  if(kind==='job'&&opt('--department'))query=query.eq('department',opt('--department'))
  if(after)query=query.gt('id',after)
  const {data,error}=await query
  if(error)throw error
  if(!data?.length)break
  for(const source of data as unknown as Record<string,unknown>[]){
   const id=String(source.id), p=(source.parsed_data??{}) as Record<string,unknown>
   const cap=capabilityText(kind,source)
   let saved=false, facts=0, scorecard=false
   if(kind==='candidate'&&source.parsed_data){
    facts=buildFactBundle(p).facts.length
    if(apply){await persistFactBundle(admin,id,p);saved=true}
   }else if(kind==='job'){
    const family=opt('--family','other')
    const companyId=String(source.company_id??'')
    if(companyId&&!briefs.has(companyId)){
     const {data,error}=await admin.from('hm_briefs').select('id,version,content').eq('company_id',companyId).eq('status','published').order('version',{ascending:false}).limit(1)
     if(error)throw error
     briefs.set(companyId,data?.[0])
    }
    const draft=draftScorecard(source,family,briefs.get(companyId))
    if(apply){
     const {error}=await admin.rpc('engine_save_scorecard_draft',{p_job_id:id,p_source:source,p_content:draft.content,p_hash:draft.contentHash})
     if(error)throw error
     saved=true
    }
    scorecard=true
   }
   let embedded=false
   if(embed&&!cap.thin){
    const {data:current,error}=await admin.from(kind==='candidate'?'candidates':'jobs').select('capability_hash,capability_version').eq('id',id).single()
    if(error)throw error
    if(current.capability_hash!==cap.inputHash||current.capability_version!==cap.version){
     const {result:{embedding}}=await paidEmbed({model:'openai/text-embedding-3-small',value:cap.text},{source:'embedding',task:'capability_shadow',metadata:{kind,id,input_hash:cap.inputHash}})
     const {data,error}=await admin.rpc('engine_save_capability_embedding',{p_kind:kind,p_id:id,p_source:source,p_embedding:embedding,p_hash:cap.inputHash,p_version:cap.version})
     if(error||data!==true)throw new Error(error?.message??'Source changed during embedding; result was not installed')
    }
    embedded=true
   }
   records.push({id,facts,scorecard_draft:scorecard,saved,embedded,capability_chars:cap.text.length,thin:cap.thin,input_hash:cap.inputHash})
   after=id;processed++
   mkdirSync('.engine',{recursive:true})
   writeFileSync(path.join('.engine',`backfill-${kind}.json`),JSON.stringify({apply,kind,processed,after,records},null,2))
  }
 }
 console.log(JSON.stringify({apply,kind,processed,last_id:after,thin:records.filter(r=>r.thin).length,report:`.engine/backfill-${kind}.json`}))
}
main().catch(e=>{console.error(e.message);process.exitCode=1})

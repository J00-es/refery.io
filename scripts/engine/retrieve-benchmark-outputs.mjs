// Retrieve the already-paid stored Responses outputs; never creates a response.
import { readFileSync,writeFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
const line=readFileSync(process.argv[2],'utf8').split(/\r?\n/).find(s=>/^OPENAI_API_KEY\s*=/.test(s))
const key=(line?.slice(line.indexOf('=')+1).trim()??'').replace(/^(['"])(.*)\1$/,'$2')
if(!key)throw new Error('Missing API key')
const report=JSON.parse(readFileSync('docs/engine/benchmark-2026-09-09.json','utf8'))
const db=new DatabaseSync('.engine/benchmark-allowance.sqlite',{readOnly:true})
const outputs=[]
for(const route of report.routes){
 const charges=db.prepare("select * from charges where model=? and status='completed' order by created_at,id").all(route.route)
 if(charges.length!==route.results.length)throw new Error('Ambiguous fixture-to-charge mapping')
 for(let i=0;i<charges.length;i++){
  const charge=charges[i]
  if(!/^resp_[a-zA-Z0-9_]+$/.test(charge.request_id))throw new Error('Unexpected response id')
  const response=await fetch('https://api.openai.com/v1/responses/'+charge.request_id,{headers:{Authorization:'Bearer '+key}})
  if(!response.ok)throw new Error('Stored response retrieval returned '+response.status)
  const body=await response.json()
  const texts=(body.output??[]).flatMap(x=>(x.content??[]).filter(y=>y.type==='output_text').map(y=>y.text))
  outputs.push({route:route.route,fixture_id:route.results[i].id,response_id:body.id,output:texts.join('\n'),usage:body.usage})
 }
 console.log('Retrieved stored outputs for '+route.route)
}
writeFileSync('docs/engine/benchmark-2026-09-09-outputs.json',JSON.stringify({note:'Already-paid stored outputs, retrieved without generation. Synthetic fixtures only.',outputs},null,2))
db.close()

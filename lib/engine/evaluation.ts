export interface HumanPair {
 job_id:string; label:'strong'|'possible'|'not_supported'|'unknown'|null;
 screening_appropriate:boolean|null; evidence_spans:string[]
}
export interface HumanCase {
 candidate_id:string; review:{reviewer:string|null;reviewed_at:string|null}; pairs:HumanPair[]
}
/** Never invent missing labels or treat an unjudged job as a negative. The
 * recall denominator covers only this judged pool, not the whole job board. */
export function humanEvaluation(cases:HumanCase[],rankings:Record<string,string[]>,k=10){
 const errors:string[]=[],ids=new Set<string>();let pairs=0,reviewed=0,precisionCases=0,recallCases=0,p3=0,rk=0
 for(const c of cases){
  if(ids.has(c.candidate_id))errors.push('duplicate candidate');ids.add(c.candidate_id)
  const attributed=!!c.review.reviewer?.trim()&&Number.isFinite(Date.parse(c.review.reviewed_at??''))
  if(!attributed)errors.push('missing human attribution')
  let complete=attributed
  const seen=new Set<string>()
  for(const p of c.pairs){
   pairs++
   if(seen.has(p.job_id))errors.push('duplicate pair');seen.add(p.job_id)
   if(p.label===null||p.screening_appropriate===null){complete=false;continue}
   if(!['strong','possible','not_supported','unknown'].includes(p.label))errors.push('invalid label')
   if(p.screening_appropriate&&!p.evidence_spans.some(s=>typeof s==='string'&&s.trim()))errors.push('positive label lacks evidence')
  }
  if(complete)reviewed++
  const ranking=rankings[c.candidate_id]??[]
  if(new Set(ranking).size!==ranking.length)errors.push('duplicate ranking entry')
  if(!complete||!ranking.length)continue
  const labels=new Map(c.pairs.map(p=>[p.job_id,p.screening_appropriate]))
  const top3=ranking.slice(0,3)
  if(top3.length===3&&top3.every(id=>typeof labels.get(id)==='boolean')){
   p3+=top3.filter(id=>labels.get(id)===true).length/3;precisionCases++
  }
  const positives=c.pairs.filter(p=>p.screening_appropriate===true).map(p=>p.job_id)
  if(positives.length){rk+=positives.filter(id=>ranking.slice(0,k).includes(id)).length/positives.length;recallCases++}
 }
 return {promotion_ready:false,labels_ready:errors.length===0&&reviewed>=120&&pairs>=300,
  errors:[...new Set(errors)],candidate_count:cases.length,reviewed_candidates:reviewed,pair_count:pairs,
  precision_at_3:precisionCases?p3/precisionCases:null,precision_candidates:precisionCases,
  judged_pool_recall_at_k:recallCases?rk/recallCases:null,recall_candidates:recallCases,k,
  limitation:'Judged-pool recall only. Human authorship must be verified; this schema cannot authenticate a reviewer. Production promotion also needs safety, outcome and retrieval coverage review.'}
}

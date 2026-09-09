import {expect,it} from 'vitest'
import {humanEvaluation,type HumanCase} from '../../lib/engine/evaluation'
const candidate=(reviewed:boolean):HumanCase=>({candidate_id:'a',review:{reviewer:reviewed?'reviewer':null,reviewed_at:reviewed?'2026-09-09T00:00:00Z':null},pairs:[{job_id:'1',label:reviewed?'strong':null,screening_appropriate:reviewed?true:null,evidence_spans:['Shipped a relevant system']}]})
it('an unlabelled packet cannot be treated as a passed human benchmark',()=>{
 const r=humanEvaluation([candidate(false)],{a:['1']});expect(r.promotion_ready).toBe(false);expect(r.judged_pool_recall_at_k).toBeNull()
})
it('unjudged retrieved jobs do not become negative labels',()=>{
 const r=humanEvaluation([candidate(true)],{a:['unjudged','1','other']});expect(r.precision_at_3).toBeNull();expect(r.judged_pool_recall_at_k).toBe(1);expect(r.precision_candidates).toBe(0)
})
it('duplicated ranking entries cannot inflate a metric',()=>{
 expect(humanEvaluation([candidate(true)],{a:['1','1','1']}).errors).toContain('duplicate ranking entry')
})

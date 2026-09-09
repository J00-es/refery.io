import {readFileSync} from 'node:fs'
import {humanEvaluation,type HumanCase} from '../../lib/engine/evaluation'
const packet=JSON.parse(readFileSync(process.argv[2],'utf8')) as {cases:HumanCase[]}
const rankings=process.argv[3]?JSON.parse(readFileSync(process.argv[3],'utf8')) as Record<string,string[]>:{}
const result=humanEvaluation(packet.cases,rankings)
console.log(JSON.stringify(result,null,2))
if(!result.labels_ready)process.exitCode=1

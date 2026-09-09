import { readFileSync } from 'node:fs'
const envFile = process.argv[2]
if (!process.env.OPENAI_API_KEY && envFile) {
  const line = readFileSync(envFile, 'utf8').split(/\r?\n/).find(s => /^OPENAI_API_KEY\s*=/.test(s))
  process.env.OPENAI_API_KEY = (line?.slice(line.indexOf('=') + 1).trim() ?? '').replace(/^(['"])(.*)\1$/, '$2')
}
if (!process.env.OPENAI_API_KEY) throw new Error('OpenAI key not configured')
const response = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, signal: AbortSignal.timeout(20000) })
if (!response.ok) { console.log(JSON.stringify({ status: response.status, authenticated: false })); process.exitCode = 1 }
else {
  const body = await response.json()
  const requested = ['gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.4-mini', 'gpt-5.6-sol']
  console.log(JSON.stringify({ status: response.status, available: requested.filter(id => body.data.some(m => m.id === id)) }))
}

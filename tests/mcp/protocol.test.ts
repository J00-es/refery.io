import { describe, expect, it } from 'vitest'
import { handleBody, handleMessage, INVALID_PARAMS, INVALID_REQUEST, METHOD_NOT_FOUND, ToolInputError, UnknownToolError, type ToolRegistry } from '@/lib/mcp/protocol'

const registry: ToolRegistry = {
  specs: () => [{ name: 'echo', kind: 'read', description: 'says it back', inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } }],
  async call(name, args) {
    if (name !== 'echo') throw new UnknownToolError(name)
    if (typeof args.text !== 'string') throw new ToolInputError('text: Required')
    if (args.text === 'refuse') return { text: 'no', isError: true }
    return { text: `you said ${args.text}`, data: { text: args.text } }
  },
}

const req = (method: string, params?: Record<string, unknown>, id: string | number = 1) => ({ jsonrpc: '2.0', id, method, params })

describe('desk MCP protocol', () => {
  it('initialize negotiates a supported version and declares tools only', async () => {
    const r = await handleMessage(req('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '0' } }), registry)
    expect(r?.result).toMatchObject({ protocolVersion: '2025-03-26', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'refery-desk' } })
    const newer = await handleMessage(req('initialize', { protocolVersion: '2099-01-01' }), registry)
    expect((newer?.result as { protocolVersion: string }).protocolVersion).toBe('2025-06-18')
  })

  it('a notification gets no reply, and a whole-notification body is a 202', async () => {
    expect(await handleMessage({ jsonrpc: '2.0', method: 'notifications/initialized' }, registry)).toBeNull()
    expect(await handleBody({ jsonrpc: '2.0', method: 'notifications/initialized' }, registry)).toEqual({ status: 202, body: null })
  })

  it('tools/list carries name, description and schema, never the kind', async () => {
    const r = await handleMessage(req('tools/list'), registry)
    const tools = (r?.result as { tools: Record<string, unknown>[] }).tools
    expect(tools).toHaveLength(1)
    expect(tools[0]).toEqual({ name: 'echo', description: 'says it back', inputSchema: expect.any(Object) })
  })

  it('tools/call returns text content and structured content', async () => {
    const r = await handleMessage(req('tools/call', { name: 'echo', arguments: { text: 'hi' } }), registry)
    expect(r?.result).toEqual({ content: [{ type: 'text', text: 'you said hi' }], structuredContent: { text: 'hi' } })
  })

  it('a refusal is a result with isError, not a protocol error', async () => {
    const r = await handleMessage(req('tools/call', { name: 'echo', arguments: { text: 'refuse' } }), registry)
    expect(r?.error).toBeUndefined()
    expect(r?.result).toMatchObject({ isError: true })
  })

  it('bad arguments and unknown tools are invalid-params errors', async () => {
    const bad = await handleMessage(req('tools/call', { name: 'echo', arguments: {} }), registry)
    expect(bad?.error).toMatchObject({ code: INVALID_PARAMS, message: 'text: Required' })
    const none = await handleMessage(req('tools/call', { name: 'nope', arguments: {} }), registry)
    expect(none?.error).toMatchObject({ code: INVALID_PARAMS })
  })

  it('unknown methods are method-not-found; malformed messages are invalid-request', async () => {
    expect((await handleMessage(req('resources/list'), registry))?.error?.code).toBe(METHOD_NOT_FOUND)
    expect((await handleMessage({ hello: 1 }, registry))?.error?.code).toBe(INVALID_REQUEST)
    expect((await handleBody({ hello: 1 }, registry)).status).toBe(400)
  })

  it('a batch answers every request and drops the notifications', async () => {
    const out = await handleBody([req('ping', undefined, 'a'), { jsonrpc: '2.0', method: 'notifications/initialized' }, req('ping', undefined, 'b')], registry)
    expect(out.status).toBe(200)
    expect((out.body as { id: string }[]).map(r => r.id)).toEqual(['a', 'b'])
  })

  it('a client response to a request we never sent is ignored', async () => {
    expect(await handleMessage({ jsonrpc: '2.0', id: 9, result: {} }, registry)).toBeNull()
  })
})

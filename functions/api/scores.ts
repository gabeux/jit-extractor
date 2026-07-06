// Cloudflare Pages Function: shared leaderboard backed by KV.
// GET    /api/scores            -> { profit: Entry[], time: Entry[] }
// POST   /api/scores            -> submit { name, profit, timeMs, quotaMet, ending, sig }
// DELETE /api/scores?id=&key=   -> admin removal (key = ADMIN_KEY secret)

interface Entry {
  id: string
  name: string
  profit: number
  timeMs: number
  quotaMet: boolean
  ending: string
  country: string
  ts: number
}

interface Env {
  SCORES?: KVNamespace
  ADMIN_KEY?: string
}

interface KVNamespace {
  get(key: string): Promise<string | null>
  put(key: string, value: string): Promise<void>
}

const BOARD_KEY = 'board:v1'
const MAX_KEPT = 100

// Same salted FNV-1a as the client. This is a speed bump, not security —
// a determined cheater can read the bundle. Sanity bounds below do the real work.
function sig(name: string, profit: number, timeMs: number, quotaMet: boolean): string {
  const s = `${name}|${profit}|${timeMs}|${quotaMet ? 1 : 0}|jit-extractor-v1`
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(36)
}

function sanitizeName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const name = raw.replace(/[^A-Za-z0-9 _\-.]/g, '').trim().slice(0, 10)
  return name.length >= 1 ? name : null
}

async function loadBoard(kv: KVNamespace): Promise<Entry[]> {
  try {
    const raw = await kv.get(BOARD_KEY)
    return raw ? (JSON.parse(raw) as Entry[]) : []
  } catch {
    return []
  }
}

function boardResponse(entries: Entry[]): Response {
  const profit = [...entries].sort((a, b) => b.profit - a.profit).slice(0, 50)
  const time = entries.filter((e) => e.quotaMet).sort((a, b) => a.timeMs - b.timeMs).slice(0, 50)
  const losses = entries.filter((e) => e.profit < 0).sort((a, b) => a.profit - b.profit).slice(0, 50)
  return json({ profit, time, losses })
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}

export const onRequestGet = async (ctx: { env: Env }) => {
  if (!ctx.env.SCORES) return json({ error: 'leaderboard not configured' }, 503)
  return boardResponse(await loadBoard(ctx.env.SCORES))
}

export const onRequestPost = async (ctx: { env: Env; request: Request }) => {
  const kv = ctx.env.SCORES
  if (!kv) return json({ error: 'leaderboard not configured' }, 503)
  let body: Record<string, unknown>
  try {
    body = await ctx.request.json() as Record<string, unknown>
  } catch {
    return json({ error: 'bad json' }, 400)
  }

  const name = sanitizeName(body.name)
  const profit = Math.round(Number(body.profit))
  const timeMs = Math.round(Number(body.timeMs))
  const quotaMet = body.quotaMet === true

  // sanity bounds: reject the impossible rather than trust the client
  if (!name) return json({ error: 'bad name' }, 400)
  if (!Number.isFinite(profit) || profit < -10000 || profit > 30000) return json({ error: 'bad profit' }, 400)
  if (!Number.isFinite(timeMs) || timeMs < 45000 || timeMs > 3_600_000) return json({ error: 'bad time' }, 400)
  if (body.sig !== sig(name, profit, timeMs, quotaMet)) return json({ error: 'bad sig' }, 400)
  const ending = typeof body.ending === 'string' ? body.ending.replace(/[^A-Z_]/g, '').slice(0, 32) : 'UNKNOWN'

  // cheap per-IP daily rate limit
  const ip = ctx.request.headers.get('cf-connecting-ip') ?? 'unknown'
  const day = new Date().toISOString().slice(0, 10)
  const rlKey = `rl:${ip}:${day}`
  const count = Number((await kv.get(rlKey)) ?? '0')
  if (count >= 40) return json({ error: 'rate limited' }, 429)
  await kv.put(rlKey, String(count + 1))

  const cf = (ctx.request as unknown as { cf?: { country?: string } }).cf
  const entry: Entry = {
    id: crypto.randomUUID(),
    name, profit, timeMs, quotaMet, ending,
    country: cf?.country ?? 'XX',
    ts: Date.now(),
  }

  const board = await loadBoard(kv)
  board.push(entry)
  // keep the union of the tops (and the glorious bottoms) so no tab starves
  const byProfit = [...board].sort((a, b) => b.profit - a.profit).slice(0, MAX_KEPT)
  const byTime = board.filter((e) => e.quotaMet).sort((a, b) => a.timeMs - b.timeMs).slice(0, MAX_KEPT)
  const byLoss = board.filter((e) => e.profit < 0).sort((a, b) => a.profit - b.profit).slice(0, MAX_KEPT)
  const kept = new Map<string, Entry>()
  for (const e of [...byProfit, ...byTime, ...byLoss]) kept.set(e.id, e)
  await kv.put(BOARD_KEY, JSON.stringify([...kept.values()]))

  const all = [...kept.values()]
  const rankProfit = all.filter((e) => e.profit > profit).length + 1
  const rankTime = quotaMet ? all.filter((e) => e.quotaMet && e.timeMs < timeMs).length + 1 : null
  return json({ ok: true, rankProfit, rankTime })
}

export const onRequestDelete = async (ctx: { env: Env; request: Request }) => {
  const kv = ctx.env.SCORES
  if (!kv) return json({ error: 'leaderboard not configured' }, 503)
  const url = new URL(ctx.request.url)
  if (!ctx.env.ADMIN_KEY || url.searchParams.get('key') !== ctx.env.ADMIN_KEY) {
    return json({ error: 'forbidden' }, 403)
  }
  const id = url.searchParams.get('id')
  const board = await loadBoard(kv)
  const next = id ? board.filter((e) => e.id !== id) : []
  await kv.put(BOARD_KEY, JSON.stringify(next))
  return json({ ok: true, removed: board.length - next.length })
}

// Anonymous run analytics: aggregate counters only, keyed by day+country+ending.
// No IPs, no cookies, no device ids stored — GDPR-friendly, no consent popup.
// POST /api/event { ending: "QUOTA_MET" }
// GET  /api/event?key=ADMIN_KEY&day=2026-07-06 -> that day's counters

interface Env {
  STATS?: { get(k: string): Promise<string | null>; put(k: string, v: string): Promise<void> }
  ADMIN_KEY?: string
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}

export const onRequestPost = async (ctx: { env: Env; request: Request }) => {
  const kv = ctx.env.STATS
  if (!kv) return json({ ok: false }, 503)
  let ending = 'UNKNOWN'
  try {
    const body = await ctx.request.json() as { ending?: string }
    if (typeof body.ending === 'string') ending = body.ending.replace(/[^A-Z_]/g, '').slice(0, 32) || 'UNKNOWN'
  } catch { /* count it as UNKNOWN */ }
  const cf = (ctx.request as unknown as { cf?: { country?: string } }).cf
  const country = cf?.country ?? 'XX'
  const day = new Date().toISOString().slice(0, 10)
  const key = `stats:${day}`
  const stats = JSON.parse((await kv.get(key)) ?? '{}') as Record<string, Record<string, number>>
  stats[country] = stats[country] ?? {}
  stats[country][ending] = (stats[country][ending] ?? 0) + 1
  await kv.put(key, JSON.stringify(stats))
  return json({ ok: true })
}

export const onRequestGet = async (ctx: { env: Env; request: Request }) => {
  const kv = ctx.env.STATS
  if (!kv) return json({ error: 'not configured' }, 503)
  const url = new URL(ctx.request.url)
  if (!ctx.env.ADMIN_KEY || url.searchParams.get('key') !== ctx.env.ADMIN_KEY) return json({ error: 'forbidden' }, 403)
  const day = url.searchParams.get('day') ?? new Date().toISOString().slice(0, 10)
  return json(JSON.parse((await kv.get(`stats:${day}`)) ?? '{}'))
}

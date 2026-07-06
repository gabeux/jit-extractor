// Leaderboard client. Talks to /api/scores (Cloudflare Pages Function);
// falls back to localStorage when offline / running without the backend.

export interface ScoreEntry {
  id?: string
  name: string
  profit: number
  timeMs: number
  quotaMet: boolean
  ending: string
  /** ISO 3166-1 alpha-2, set by the server from the connection */
  country?: string
}

export interface Board {
  profit: ScoreEntry[]
  time: ScoreEntry[]
  losses: ScoreEntry[]
  offline: boolean
}

const LOCAL_KEY = 'jit-board'
const NAME_KEY = 'jit-callsign'
const BEST_KEY = 'jit-best-profit'

// mirrors the server-side check — a nuisance for devtools tinkerers only
export function sig(name: string, profit: number, timeMs: number, quotaMet: boolean): string {
  const s = `${name}|${profit}|${timeMs}|${quotaMet ? 1 : 0}|jit-extractor-v1`
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(36)
}

export function getCallsign(): string {
  try { return localStorage.getItem(NAME_KEY) ?? '' } catch { return '' }
}

export function setCallsign(name: string) {
  try { localStorage.setItem(NAME_KEY, name) } catch { /* private mode */ }
}

export function personalBest(): number {
  try { return Number(localStorage.getItem(BEST_KEY) ?? '-Infinity') } catch { return -Infinity }
}

export function recordPersonalBest(profit: number): boolean {
  const prev = personalBest()
  if (profit > prev) {
    try { localStorage.setItem(BEST_KEY, String(profit)) } catch { /* ok */ }
    return true
  }
  return false
}

function localEntries(): ScoreEntry[] {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '[]') as ScoreEntry[] } catch { return [] }
}

function saveLocal(e: ScoreEntry) {
  const all = localEntries()
  all.push(e)
  all.sort((a, b) => b.profit - a.profit)
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(all.slice(0, 50))) } catch { /* ok */ }
}

function localBoard(): Board {
  const all = localEntries()
  return {
    profit: [...all].sort((a, b) => b.profit - a.profit).slice(0, 50),
    time: all.filter((e) => e.quotaMet).sort((a, b) => a.timeMs - b.timeMs).slice(0, 50),
    losses: all.filter((e) => e.profit < 0).sort((a, b) => a.profit - b.profit).slice(0, 50),
    offline: true,
  }
}

async function withTimeout<T>(p: Promise<T>, ms = 3500): Promise<T> {
  return await Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))])
}

export async function fetchBoard(): Promise<Board> {
  try {
    const res = await withTimeout(fetch('api/scores'))
    if (!res.ok) throw new Error(String(res.status))
    const data = await res.json() as { profit: ScoreEntry[]; time: ScoreEntry[]; losses: ScoreEntry[] }
    return { profit: data.profit ?? [], time: data.time ?? [], losses: data.losses ?? [], offline: false }
  } catch {
    return localBoard()
  }
}

export interface SubmitResult {
  ok: boolean
  offline: boolean
  rankProfit: number | null
  rankTime: number | null
}

export async function submitScore(e: ScoreEntry): Promise<SubmitResult> {
  saveLocal(e) // always keep a local copy
  try {
    const res = await withTimeout(fetch('api/scores', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...e, sig: sig(e.name, e.profit, e.timeMs, e.quotaMet) }),
    }))
    if (!res.ok) throw new Error(String(res.status))
    const data = await res.json() as { rankProfit?: number; rankTime?: number }
    return { ok: true, offline: false, rankProfit: data.rankProfit ?? null, rankTime: data.rankTime ?? null }
  } catch {
    const local = localBoard()
    const rankProfit = local.profit.filter((x) => x.profit > e.profit).length + 1
    return { ok: true, offline: true, rankProfit, rankTime: null }
  }
}

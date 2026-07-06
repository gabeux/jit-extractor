// Fire-and-forget anonymous run counter. The server aggregates by
// day+country+ending only — nothing identifiable leaves the browser.
export function sendRunEnd(ending: string) {
  try {
    const body = JSON.stringify({ ending })
    if (navigator.sendBeacon) {
      navigator.sendBeacon('api/event', new Blob([body], { type: 'application/json' }))
    } else {
      void fetch('api/event', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => {})
    }
  } catch { /* analytics must never break the game */ }
}

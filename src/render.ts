import { PAL } from './palette'

export const VIEW_W = 960
export const VIEW_H = 540

// Deterministic star field: hashed positions, drawn with parallax.
function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

export function drawStars(ctx: CanvasRenderingContext2D, camX: number, camY: number, alpha = 1, vw = VIEW_W, vh = VIEW_H) {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.fillStyle = PAL.pale
  for (let i = 0; i < 90; i++) {
    const px = (hash(i) * 2400 - camX * 0.25) % vw
    const py = (hash(i + 500) * 1600 - camY * 0.25) % vh
    const x = px < 0 ? px + vw : px
    const y = py < 0 ? py + vh : py
    const tw = 0.5 + hash(i + 900) * 1.4
    ctx.globalAlpha = alpha * (0.25 + hash(i + 300) * 0.75)
    ctx.fillRect(x, y, tw, tw)
  }
  ctx.restore()
}

/**
 * The top arc of the planet, seen from orbit, slowly rotating.
 * cx/cy = circle center in screen space, r = radius.
 */
export function drawPlanetArc(ctx: CanvasRenderingContext2D, time: number, cx: number, cy: number, r: number) {
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = PAL.planetFill
  ctx.fill()
  ctx.strokeStyle = PAL.planetEdge
  ctx.lineWidth = 2.5
  ctx.stroke()
  // Rotating surface speckle (continents / craters) clipped to the disc.
  ctx.clip()
  const rot = time * 0.045
  ctx.fillStyle = PAL.planetEdge
  for (let i = 0; i < 42; i++) {
    const a = hash(i + 40) * Math.PI * 2 + rot
    const rr = r * (0.55 + hash(i + 80) * 0.44)
    const x = cx + Math.cos(a) * rr
    const y = cy + Math.sin(a) * rr
    if (y < cy) {
      // only bother drawing on the visible (upper) half
      const s = 4 + hash(i + 120) * 16
      ctx.globalAlpha = 0.5
      ctx.beginPath()
      ctx.ellipse(x, y, s, s * 0.5, a, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  // Thin atmosphere glow along the limb.
  ctx.globalAlpha = 1
  ctx.strokeStyle = PAL.accent
  ctx.globalAlpha = 0.25
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.arc(cx, cy, r - 3, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

/** Space -> atmosphere gradient based on how deep the camera is. */
export function drawSky(ctx: CanvasRenderingContext2D, camY: number, groundLevel: number, vw = VIEW_W, vh = VIEW_H) {
  // altitude 0 = space, 1 = at ground
  const t = Math.min(1, Math.max(0, camY / Math.max(1, groundLevel - vh)))
  const g = ctx.createLinearGradient(0, 0, 0, vh)
  g.addColorStop(0, t < 0.5 ? PAL.bgSpace : PAL.bgSky)
  g.addColorStop(1, t < 0.25 ? PAL.bgSky : PAL.bgHorizon)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, vw, vh)
  if (t < 0.6) drawStars(ctx, 0, camY, 1 - t * 1.6, vw, vh)
}

export function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, opts: { size?: number; color?: string; align?: CanvasTextAlign; alpha?: number } = {}) {
  ctx.save()
  ctx.font = `${opts.size ?? 12}px "Courier New", monospace`
  ctx.fillStyle = opts.color ?? PAL.pale
  ctx.textAlign = opts.align ?? 'center'
  ctx.globalAlpha = opts.alpha ?? 1
  ctx.fillText(s, x, y)
  ctx.restore()
}

/** Centered multi-color line: [text, color] segments. */
export function textSegments(ctx: CanvasRenderingContext2D, segs: [string, string][], cx: number, y: number, size = 11) {
  ctx.save()
  ctx.font = `${size}px "Courier New", monospace`
  ctx.textAlign = 'left'
  const total = segs.reduce((acc, [t]) => acc + ctx.measureText(t).width, 0)
  let x = cx - total / 2
  for (const [t, c] of segs) {
    ctx.fillStyle = c
    ctx.fillText(t, x, y)
    x += ctx.measureText(t).width
  }
  ctx.restore()
}

/** Key-binding hint: "[E] USE · [Q] DROP" — bracketed keys pop in accent.
 * Centered on cx by default; align 'left' treats cx as the left edge
 * (translations run long — centering them off a margin clips the screen). */
export function drawKeyHint(ctx: CanvasRenderingContext2D, s: string, cx: number, y: number, size = 10, align: 'center' | 'left' = 'center') {
  const segs: [string, string][] = []
  for (const part of s.split(/(\[[^\]]+\])/)) {
    if (!part) continue
    if (part.startsWith('[')) segs.push([part.slice(1, -1), PAL.accent])
    else segs.push([part, PAL.pale])
  }
  if (align === 'left') {
    ctx.save()
    ctx.font = `${size}px "Courier New", monospace`
    const total = segs.reduce((acc, [t]) => acc + ctx.measureText(t).width, 0)
    ctx.restore()
    textSegments(ctx, segs, cx + total / 2, y, size)
    return
  }
  textSegments(ctx, segs, cx, y, size)
}

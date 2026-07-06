import { PAL } from '../palette'
import type { Rng } from '../rng'

// Terrain is a 1D destructible heightmap: one surface Y per 4px column.
// Larger Y = lower ground (canvas coords, y grows downward).
export const COL_W = 4

export class Terrain {
  cols: Float32Array
  width: number

  constructor(width: number, rng: Rng) {
    this.width = width
    const n = Math.ceil(width / COL_W) + 1
    this.cols = new Float32Array(n)
    // Layered sines with random phases: gentle rolling hills around a baseline.
    const base = 1560
    const p1 = rng() * 100, p2 = rng() * 100, p3 = rng() * 100
    const a1 = 40 + rng() * 50, a2 = 20 + rng() * 30, a3 = 6 + rng() * 10
    for (let i = 0; i < n; i++) {
      const x = i * COL_W
      this.cols[i] =
        base +
        Math.sin(x * 0.0016 + p1) * a1 +
        Math.sin(x * 0.006 + p2) * a2 +
        Math.sin(x * 0.021 + p3) * a3
    }
  }

  /** Surface Y at world x (interpolated). */
  heightAt(x: number): number {
    const fx = Math.min(Math.max(x, 0), this.width - 0.001) / COL_W
    const i = Math.floor(fx)
    const t = fx - i
    const a = this.cols[Math.min(i, this.cols.length - 1)]
    const b = this.cols[Math.min(i + 1, this.cols.length - 1)]
    return a + (b - a) * t
  }

  /** Approximate surface slope (dy/dx) at x. */
  slopeAt(x: number): number {
    return (this.heightAt(x + 8) - this.heightAt(x - 8)) / 16
  }

  /** Blast a crater: lowers nearby columns with a smooth falloff. */
  crater(cx: number, radius: number, depth: number) {
    const i0 = Math.max(0, Math.floor((cx - radius) / COL_W))
    const i1 = Math.min(this.cols.length - 1, Math.ceil((cx + radius) / COL_W))
    for (let i = i0; i <= i1; i++) {
      const dx = i * COL_W - cx
      const t = 1 - Math.abs(dx) / radius
      if (t > 0) this.cols[i] += depth * Math.sin(t * Math.PI * 0.5)
    }
  }

  /** Flatten a small pad (for buildings) so props sit nicely. */
  flatten(cx: number, halfW: number) {
    const y = this.heightAt(cx)
    const i0 = Math.max(0, Math.floor((cx - halfW) / COL_W))
    const i1 = Math.min(this.cols.length - 1, Math.ceil((cx + halfW) / COL_W))
    for (let i = i0; i <= i1; i++) this.cols[i] = y
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number, viewW: number, viewH: number) {
    const i0 = Math.max(0, Math.floor(camX / COL_W))
    const i1 = Math.min(this.cols.length - 1, Math.ceil((camX + viewW) / COL_W) + 1)
    ctx.beginPath()
    ctx.moveTo(i0 * COL_W - camX, this.cols[i0] - camY)
    for (let i = i0 + 1; i <= i1; i++) ctx.lineTo(i * COL_W - camX, this.cols[i] - camY)
    ctx.lineTo(i1 * COL_W - camX, viewH + 40)
    ctx.lineTo(i0 * COL_W - camX, viewH + 40)
    ctx.closePath()
    ctx.fillStyle = PAL.terrain
    ctx.fill()
    // Pale surface line, dino-game style.
    ctx.beginPath()
    ctx.moveTo(i0 * COL_W - camX, this.cols[i0] - camY)
    for (let i = i0 + 1; i <= i1; i++) ctx.lineTo(i * COL_W - camX, this.cols[i] - camY)
    ctx.strokeStyle = PAL.terrainEdge
    ctx.lineWidth = 2
    ctx.stroke()
  }
}

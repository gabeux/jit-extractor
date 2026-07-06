import type { World } from '../world/world'

// 'player' covers the player, turrets and the lander (one side).
export type Faction = 'player' | 'pirate' | 'native' | 'passive' | 'aggro' | 'neutral'

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay
  return Math.sqrt(dx * dx + dy * dy)
}

// x,y is the entity's FEET position; w is full width, h is height above feet.
export abstract class Entity {
  x = 0; y = 0
  vx = 0; vy = 0
  w = 12; h = 16
  hp = 10; maxHp = 10
  dead = false
  grounded = false
  faction: Faction = 'neutral'
  flashT = 0 // white hit-flash timer

  abstract update(w: World, dt: number): void
  abstract draw(ctx: CanvasRenderingContext2D, camX: number, camY: number, w: World): void

  get cx(): number { return this.x }
  get cy(): number { return this.y - this.h / 2 }

  containsPoint(px: number, py: number): boolean {
    return px > this.x - this.w / 2 && px < this.x + this.w / 2 && py > this.y - this.h && py < this.y
  }

  damage(w: World, amt: number, src: Entity | null = null) {
    if (this.dead) return
    this.hp -= amt
    this.flashT = 0.1
    w.reportDamage(this, src)
    this.onDamaged(w, src)
    if (this.hp <= 0) {
      this.dead = true
      this.onDeath(w, src)
      w.reportKill(this, src)
    }
  }

  protected onDamaged(_w: World, _src: Entity | null) {}
  protected onDeath(_w: World, _src: Entity | null) {}

  /** Gravity + move + terrain collision. Snaps up gentle slopes when grounded. */
  protected stepPhysics(w: World, dt: number, gravity = 900) {
    this.vy += gravity * dt
    this.x += this.vx * dt
    this.y += this.vy * dt
    this.x = clamp(this.x, 12, w.terrain.width - 12)
    const gy = w.terrain.heightAt(this.x)
    this.grounded = false
    if (this.y >= gy) {
      this.y = gy
      if (this.vy > 0) this.vy = 0
      this.grounded = true
    }
    if (this.flashT > 0) this.flashT -= dt
  }
}

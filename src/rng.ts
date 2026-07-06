// Seeded RNG (mulberry32) so each run's map is reproducible from one seed.
export type Rng = () => number

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function range(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min)
}

export function irange(rng: Rng, min: number, max: number): number {
  return Math.floor(range(rng, min, max + 1))
}

export function pick<T>(rng: Rng, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)]
}

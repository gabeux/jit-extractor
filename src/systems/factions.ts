import type { Faction } from '../entities/entity'

// Faction-level hostility. Animals are stateful (per-individual targets),
// so only human/turret sides live here. Pirates always hate the player;
// natives and pirate<->native only after a war flag flips (friendly fire).
export function warKey(a: Faction, b: Faction): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

export function factionsHostile(wars: Set<string>, a: Faction, b: Faction): boolean {
  if (a === b) return false
  if ((a === 'player' && b === 'pirate') || (a === 'pirate' && b === 'player')) return true
  return wars.has(warKey(a, b))
}

import { mulberry32, pick, irange, type Rng } from './rng'

// Star systems and their planets are different things, Extractor.
// Flavor lifted from the greats: Space Rangers, StarSector, Firefly, X4.
export interface Planet {
  system: string
  name: string
}

const STARS = [
  'CAPELLA', 'DANEBOA', 'ACHERNAR', 'VEGA', 'ANTARES', 'ARGON', 'MAGEC',
  'TORTUGA', 'ILIUM', 'PERSEPHONE', 'HERA', 'BOROS', 'KHIONE', 'TYRIS',
  'CORVUS', 'ASKONIA', 'EVENTIDE', 'NAKA', 'THOLIN', 'SINDRIA', 'GEMAR',
  'PROCYON', 'ALTAIR', 'MERIDIAN', 'OKHRA', 'VOLTURN', 'CASSILDA', 'ZENO',
]
const ROMANS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']
const PROPER = [
  'PROFIT CENTER ALPHA', 'NEW GETHSEMANE', "MIRANDA'S REST", 'HAZERON SHORE',
  'DUSTBALL', "CLERKE'S FOLLY", 'LAST LEDGER', 'THE COMPANY STORE',
]

export function generatePlanet(seed: number): Planet {
  const rng: Rng = mulberry32(seed ^ 0x9e3779b9)
  const system = pick(rng, STARS)
  const roll = rng()
  let name: string
  if (roll < 0.55) {
    // classic survey designation: CAPELLA II-b
    const body = `${system} ${pick(rng, ROMANS)}`
    name = rng() < 0.5 ? `${body}-${pick(rng, ['a', 'b', 'c', 'd'])}` : body
  } else if (roll < 0.75) {
    name = `${system} ${pick(rng, ['PRIME', 'MINOR', 'SECUNDUS'])}`
  } else if (roll < 0.9) {
    name = `${system} ${pick(rng, ROMANS)}`
  } else {
    // the rare properly-named rock
    name = pick(rng, PROPER)
  }
  void irange // (kept for future orbital counts)
  return { system, name }
}

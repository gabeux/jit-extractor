// Single source of truth for the color system.
// Near-monochrome: dark space bg, pale terrain/figures, few accents.
export const PAL = {
  bgSpace: '#06080d',
  bgSky: '#11161f',
  bgHorizon: '#1c232e',
  planetFill: '#141b26',
  planetEdge: '#2c3a4c',

  terrain: '#232c38',
  terrainEdge: '#8b98a6',
  terrainDeep: '#161d26',

  pale: '#c8d2dc',      // player, ship hull, main strokes
  dim: '#5a6672',       // secondary strokes, dead stuff
  faint: '#333d49',     // background props (trees, tents)

  accent: '#53d8e8',    // player lasers, UI highlight, consoles
  warm: '#ff9f43',      // thrusters, fuel, explosions
  danger: '#ff5a5a',    // damage, pirates, warnings
  good: '#7dd87d',      // grass, ore, quota done

  pirate: '#b06a6a',
  native: '#b09a5f',
  animalPassive: '#7a8f7a',
  animalAggro: '#8f6f8f',

  white: '#f2f6fa',
} as const

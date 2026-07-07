import type { DialogueNode } from './dialogue'
import type { Game } from '../game'

// All P.A.T. dialogue lives here — one place to write/edit and for the
// upcoming i18n pass to lift strings from. English only until the tutorial
// content is validated.

export const PAT_INTRO_KEY = 'jit-pat-intro-v1'
/** 'done' | 'skipped' | unset (unset = P.A.T. still offers the tutorial). */
export const TUTORIAL_KEY = 'jit-tutorial-v1'

export function tutorialState(): string | null {
  try { return localStorage.getItem(TUTORIAL_KEY) } catch { return null }
}
export function setTutorialState(v: 'done' | 'skipped') {
  try { localStorage.setItem(TUTORIAL_KEY, v) } catch { /* private mode */ }
}

/**
 * Main tree (Gabriel's script). `returning` swaps the greeting for players
 * who have been here before.
 */
export function patIntro(game: Game, returning: boolean): DialogueNode {
  const root: DialogueNode = {
    text: returning
      ? "Welcome back to space, Extractor! P.A.T. is here for you, ready to drop. Do you need a refresher?"
      : "Welcome to space, Extractor! I'm P.A.T., your company-issued travel companion. I cannot verify your past expeditions in my database - would you like me to guide you on your first drop?",
    choices: [
      {
        label: 'Teach me the ropes.',
        onPick: () => game.beginTutorial(),
        next: {
          text: "Excellent choice! Booting SIMULATED DROP: same planet, friendlier physics - you hit harder, bruise less, mine faster and sip fuel. None of it counts, so relax and follow my lead. To the launch console, Extractor!",
          choices: [{ label: "Let's do it." }],
        },
      },
      {
        label: 'Who am I? What is this place?',
        next: {
          text: "Oh no. Did they overtune the cryogenics again? You're an Extractor: a highly capable, multi-role planetary explorer tasked with filling quotas for spikes in demand from our clients. Without you, production would halt, empires would crumble, and what's worse: there'd be no more profits.",
          choices: [{ label: 'I see!', next: () => patIntro(game, returning) }],
        },
      },
      {
        label: "Thanks, PAT. I'll take it from here.",
        onPick: () => setTutorialState('skipped'),
      },
    ],
  }
  return root
}

// ---- Tutorial step texts (hints are non-blocking; keep them ~4 lines) ----

export const TUT = {
  board: "That console runs the pre-drop checks. Walk over and press [E] whenever you're ready, Extractor.",
  flightIntro: {
    text: "Lander controls: [W] burns the main thruster, [A]/[D] steer. Gravity is patient; your hull is not. Keep the ▼ speed number GREEN near the ground, and aim for flat terrain.",
    choices: [{ label: 'Got it.' }],
  } as DialogueNode,
  descent: "Easy does it - short taps of [W]. Green ▼ number = survivable landing. Flat ground = happy lander.",
  groundIntro: {
    text: "Textbook landing! Now, about this planet: pirates collect ore for their own agenda, and some of the wildlife bites. Rule one of extraction: we defend FIRST, mine second.",
    choices: [{ label: 'Understood.' }],
  } as DialogueNode,
  turretGrab: "Stand by the lander - its equipment rack pops up. Select the TURRET with [Q]/[E] and take it with [F].",
  turretBuild: "Now hold [B] to deploy it. Turrets shoot pirates and anything hunting you. Usually not you.",
  grenadeTalk: {
    text: "Personal defense 101: tap [G] to lob a timed grenade. HOLD [G] to aim an arc - those detonate on impact. Grenades solve groups. And friendships, if you're careless.",
    choices: [{ label: 'Noted.' }],
  } as DialogueNode,
  grenadeThrow: "Try one now: tap or hold [G]. Aim it away from the lander, please. I'm in the lander.",
  fuelgen: "Rack time: take the FUEL GEN and hold [B] to plant it. It slowly brews the fuel you need to fly home. No fuel gen, no ride.",
  drill: "The moneymaker: take an EXTRACTOR and build it ON an ore node - the rocks with the green glints. It fills itself with ore over time.",
  drone: "Deploy the PICKUP DRONE. It ferries full extractor loads to the lander so you don't have to. It is also fragile - tinfoil and optimism - keep it away from gunfire.",
  medikit: {
    text: "See the red-cross crate in the rack? MEDIKIT: instant full heal, single use, billed if wasted. Take it ONLY when you're actually hurt. Corporate audits everything.",
    choices: [{ label: 'Only when hurt. Got it.' }],
  } as DialogueNode,
  harvest: "When an extractor's bar is full, hold [E] on it to pack it into a crate, haul it to the lander and press [E] to store it. The ore banks toward your quota.",
  launch: "Fuel at 40+? Cargo aboard? Then use the rack's ▲ BOARD & LAUNCH slot. Real drops want 200 ore - but this is a sim, so leave whenever you're ready.",
  ascent: "Point up, hold [W], and don't stop until orbit. I'll handle the paperwork.",
}

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
          text: "Excellent choice! Booting SIMULATED DROP: conditions will be easier than what you'll encounter in the real world, but should be enough to get you started. To the launch console!",
          choices: [{ label: "Let's do this." }],
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
  board: "That console runs the pre-drop checks. Walk over and press [E] whenever you're ready.",
  flightIntro: {
    text: "Lander controls: [W] burns the main thruster, [A]/[D] to steer with reaction thrusters. To the right of your control dashboard, keep the ▼ speed number GREEN near the ground, and aim for flat terrain. Our lander won't survive a free fall.",
    choices: [{ label: 'I got this.' }, { label: "I'm scared." }],
  } as DialogueNode,
  descent: "Easy does it - short taps of [W]. Green ▼ number = survivable landing. Flat ground = happy lander.",
  groundIntro: {
    text: "Touchdown! Now, for some planetside information: we are here to collect ore, and leave. But..sometimes, you may encounter some resistance. Pirates sometimes collect ore for their own agenda, and some of the wildlife bite when they get hungry. A good rule for extraction: defend FIRST, mine second.",
    choices: [{ label: 'Makes sense.' }],
  } as DialogueNode,
  turretGrab: "Stand close to the lander. Its equipment rack will pop up. Select the TURRET with [MOUSE] or [Q]/[E] or and take one with [F].",
  turretBuild: "Now hold [B] to deploy it. Turrets shoot pirates and anything hunting you. They will, usually shoot at you too.",
  grenadeTalk: {
    text: "Personal defense 101: tap [G] to lob a timed grenade. HOLD [G] to aim an arc - those detonate on impact. Grenades end groups. And friendships, if you're careless.",
    choices: [{ label: 'Noted.' }, { label: "I wouldn't explode my friends." }],
  } as DialogueNode,
  grenadeThrow: "Try one now: tap or hold [G]. Aim it away from the lander, please. I'm in the lander.",
  wave: "Contacts! Sensors read a pirate party on one flank and some very upset locals on the other. Let the turret work, use your gun and grenades, and keep them off the lander!",
  waveDone: {
    text: "And that's how it goes out here: something always wants your ore, your lander, or you. Stay alert, Extractor - real drops don't schedule their ambushes.",
    choices: [{ label: 'Stay alert. Got it.' }],
  } as DialogueNode,
  fuelgen: "To ensure a safe return to orbit, take the FUEL GEN and hold [B] to deploy it. It slowly brews the fuel you need to fly home, in case you're running low. Return the generator to the lander to refuel. No fuel and no Fuel Gen means you're Stranded: Weekly reminder that your Survival is not covered by corporate insurance!",
  drill: "The moneymaker: take an EXTRACTOR and build it ON an ore node - the rocks with the green glints. It fills itself with ore over time.",
  drone: "Deploy the PICKUP DRONE. It will automatically pick up ore from extractors and return it to the lander so you don't have to. It is also fragile - tinfoil and optimism - keep it away from gunfire!",
  medikit: {
    text: "In case you get hurt: you can check your health status on the bottom left. The lander has a MEDIKIT in its cargo - the crate with a green-cross. Instant full heal, single use. Use it wisely, the company cannot heal you when you're dead. An early death hurts profits.",
    choices: [{ label: "Better to use it only when I'm hurt. Got it." }],
  } as DialogueNode,
  harvest: {
    text: "If you don't want to deploy your Cargo Drone, or in case you lose it, you can return your extractors to the lander to collect the ore. When an extractor's bar is full, hold [E] on it to pack it into a crate, haul it to the lander and press [E] to store it. You cannot shoot when you're holding crates, so press [Q] to drop them if needed!",
    choices: [{ label: 'Pack up, haul, store. Got it.' }],
  } as DialogueNode,
  launch: "Look at the top right of your interface: there we can see the your Current Ore and your Ore Quota for this drop, along with your available fuel. If your Quota is met, use the rack's ▲ BOARD & LAUNCH option. As this is a simulation, leave whenever you're ready. If your ship is too full, feel free to drop ore by holding Z if the flight is feeling dangerous - ore affects your lander's mass.",
  audits: {
    text: "A final note regarding Profits: once you dock back at the ship, everything you did on the field will be audited. To maximize profits, return your equipment to the lander. Corporate understands if you're in a hurry, but abandoned equipment will be billed from your run.",
    choices: [{ label: 'Leave nothing behind. Noted.' }],
  } as DialogueNode,
  ascent: "Point up, hold [W], and don't stop until orbit. I'll handle the paperwork.",
}

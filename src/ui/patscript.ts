import type { DialogueNode } from './dialogue'
import type { Game } from '../game'
import { S } from '../i18n'

// P.A.T. dialogue builders. All actual text lives in src/i18n.ts (four
// languages); this file only wires structure, choices and side effects.
// Everything is built lazily so the current language applies at show-time.

export const PAT_INTRO_KEY = 'jit-pat-intro-v1'
/** 'done' | 'skipped' | unset (unset = P.A.T. still offers the tutorial). */
export const TUTORIAL_KEY = 'jit-tutorial-v1'

export function tutorialState(): string | null {
  try { return localStorage.getItem(TUTORIAL_KEY) } catch { return null }
}
export function setTutorialState(v: 'done' | 'skipped') {
  try { localStorage.setItem(TUTORIAL_KEY, v) } catch { /* private mode */ }
}

/** Main tree. `returning` swaps the greeting for players who've been here. */
export function patIntro(game: Game, returning: boolean): DialogueNode {
  const t = S().pat
  return {
    text: returning ? t.welcomeBack : t.welcome,
    choices: [
      {
        label: t.teach,
        onPick: () => game.beginTutorial(),
        next: { text: t.simExplain, choices: [{ label: t.letsDo }] },
      },
      {
        label: t.whoAmI,
        next: {
          text: t.whoAnswer,
          choices: [{ label: t.iSee, next: () => patIntro(game, returning) }],
        },
      },
      {
        label: t.skip,
        onPick: () => setTutorialState('skipped'),
      },
    ],
  }
}

/** Tutorial step texts/dialogues, built fresh so language switches apply. */
export function TUT() {
  const t = S().pat
  return {
    board: t.board,
    flightIntro: { text: t.flightIntro, choices: [{ label: t.gotIt }, { label: t.scared }] } as DialogueNode,
    descent: t.descent,
    groundIntro: { text: t.groundIntro, choices: [{ label: t.makesSense }] } as DialogueNode,
    turretGrab: t.turretGrab,
    turretBuild: t.turretBuild,
    grenadeTalk: { text: t.grenadeTalk, choices: [{ label: t.noted }, { label: t.noFriends }] } as DialogueNode,
    grenadeThrow: t.grenadeThrow,
    wave: { text: t.wave, choices: [{ label: t.holdLine }] } as DialogueNode,
    waveFight: t.waveFight,
    death: { text: t.death, choices: [{ label: t.thanksPat }] } as DialogueNode,
    waveDone: { text: t.waveDone, choices: [{ label: t.stayAlert }] } as DialogueNode,
    fuelgen: t.fuelgen,
    drill: t.drill,
    drone: t.drone,
    medikit: { text: t.medikit, choices: [{ label: t.medikitOk }] } as DialogueNode,
    harvest: { text: t.harvest, choices: [{ label: t.harvestOk }] } as DialogueNode,
    launch: t.launch,
    audits: { text: t.audits, choices: [{ label: t.auditsOk }] } as DialogueNode,
    ascent: t.ascent,
  }
}

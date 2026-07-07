import type { DialogueNode } from './dialogue'

// All P.A.T. dialogue lives here — one place for Gabriel to write and for the
// upcoming i18n pass to lift strings from. Choice labels stay short; the
// choices console gives each one a single line.

export const PAT_INTRO_KEY = 'jit-pat-intro-v1'

const CLOSE = 'CLOSE CHANNEL'

/** First contact, shown once ever (see PAT_INTRO_KEY). */
export function patIntro(): DialogueNode {
  return {
    text: "Welcome to space, Extractor! I'm P.A.T., your company-issued travel companion. I cannot verify your past expeditions in my database - would you like me to guide you on your first drop?",
    choices: [
      {
        label: 'YES - GUIDE ME ON THE DROP',
        next: {
          // placeholder until the tutorial content lands
          text: 'Excellent! ...Ah. It appears my guidance module is still in transit from Company HQ. Stand by, Extractor - a full briefing will be available shortly.',
          choices: [{ label: CLOSE }],
        },
      },
      {
        label: "NO - I'VE DONE THIS BEFORE",
        next: {
          text: 'Confidence noted, logged, and forwarded to Actuarial. Try not to become a line item, Extractor.',
          choices: [{ label: CLOSE }],
        },
      },
      {
        label: 'WHAT EXACTLY ARE YOU?',
        next: {
          text: 'Personal Assistant Traveller: surplus parts, mandatory optimism, and a warranty that expired before you were hired. Further questions cost extra.',
          choices: [{ label: 'GOOD TO KNOW' }],
        },
      },
    ],
  }
}

/**
 * Returning-player greeting for the tutorial-restart console (roadmap item).
 * Not wired anywhere yet.
 */
export function patRefresher(): DialogueNode {
  return {
    text: 'Welcome back to space, Extractor! P.A.T. is here for you, ready to drop. Do you need a refresher?',
    choices: [
      { label: 'YES - RUN THE BRIEFING AGAIN' },
      { label: 'NO - JUST SAYING HI' },
    ],
  }
}

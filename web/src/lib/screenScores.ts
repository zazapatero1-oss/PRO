import type { Severity } from '../types'

/** Ratings at or below this are "low": listed first with what the patient said (matches the engine). */
export const SCREEN_LOW = 6

/** Same bands the engine uses when it turns a rating into evidence. */
export function severityForScore(score: number): Severity {
  if (score <= 3) return 'severe'
  if (score <= 5) return 'moderate'
  if (score <= 7) return 'mild'
  return 'none'
}

/** The rating itself is stored as an evidence "quote" ("3/10 — …"); it is not something the patient said. */
export const isScreenQuote = (text: string) => /^\d{1,2}\/10\b/.test(text)

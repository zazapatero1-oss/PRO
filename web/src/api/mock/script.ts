import type { Language, Severity } from '../../types'

// Scripted assistant turns for the mock conversation engine. Turn N of the script answers the
// patient's Nth message regardless of content; control phrases and safety keywords are handled
// deterministically before the script (mirrors SPEC §7.4–§7.5).

export interface ScriptEvidence {
  construct_id: string
  severity: Severity
  confidence: number
}

export interface ScriptTurn {
  reply: string
  evidence?: ScriptEvidence[]
  /** construct(s) the assistant is asking about in this turn (used by Skip) */
  asks: string[]
}

export interface Script {
  opening: (name: string) => string
  turns: ScriptTurn[]
  skipAck: string
  breakAck: string
  stopAck: string
  wrapUp: string
  safety: string
}

export const SCRIPTS: Record<Language, Script> = {
  en: {
    opening: (name) =>
      `Hi ${name}, thanks for taking the time. There are no right or wrong answers here; I'd just like to hear how things are for you. To start, how do you feel about your face at the moment?`,
    turns: [
      {
        reply: 'Thank you for telling me that. When you notice it most, what is usually going on around you, like photos, meeting people, or looking in the mirror?',
        evidence: [{ construct_id: 'appearance.overall', severity: 'moderate', confidence: 0.7 }],
        asks: ['appearance.overall'],
      },
      {
        reply: 'That makes sense. Does it change how you feel inside, for example, do you find yourself thinking about it a lot or feeling low because of it?',
        evidence: [{ construct_id: 'appearance.overall', severity: 'moderate', confidence: 0.85 }],
        asks: ['psych.self_consciousness', 'psych.distress'],
      },
      {
        reply: 'I appreciate you sharing that. What about being around other people, are there situations you avoid or feel less confident in?',
        evidence: [{ construct_id: 'psych.self_consciousness', severity: 'moderate', confidence: 0.8 }],
        asks: ['social.confidence'],
      },
      {
        reply: 'Got it. And thinking about the practical side, is there anything with breathing, eating or speaking that has been bothering you?',
        evidence: [{ construct_id: 'social.confidence', severity: 'mild', confidence: 0.75 }],
        asks: ['function.breathing', 'function.eating', 'function.speaking'],
      },
      {
        reply: 'Thanks. Any swelling, numbness, scars or discomfort that you have noticed recently?',
        evidence: [{ construct_id: 'function.breathing', severity: 'mild', confidence: 0.7 }],
        asks: ['adverse.swelling_bruising', 'adverse.scarring', 'adverse.pain'],
      },
      {
        reply: 'Noted. Last thing: what do you hope will be different, or what would a good result look like for you?',
        evidence: [{ construct_id: 'adverse.scarring', severity: 'mild', confidence: 0.7 }],
        asks: ['outcome.decision'],
      },
      {
        reply: 'That is really helpful, thank you. I think I have a good picture now. I will put together a short summary of what I heard so you can check it and change anything.',
        evidence: [{ construct_id: 'outcome.decision', severity: 'none', confidence: 0.8 }],
        asks: [],
      },
    ],
    skipAck: 'No problem, we can leave that one. Let me ask about something else.',
    breakAck: 'Of course, take all the time you need. This link will bring you straight back here whenever you are ready.',
    stopAck: 'Okay, we will stop here. Thank you for everything you shared. I will show you a short summary to check.',
    wrapUp: 'We are close to the end of our time, so I will wrap up here. Thank you for everything you shared.',
    safety:
      "Thank you for telling me this. I'm not able to help with this myself, but it matters, and I want you to be safe. If you are in immediate danger, please contact your local emergency services now. If you are under 18, please tell a trusted adult. Your care team will be notified and will reach out. We'll pause our conversation here.",
  },
  es: {
    opening: (name) =>
      `Hola ${name}, gracias por su tiempo. Aquí no hay respuestas buenas ni malas; solo quiero saber cómo le va. Para empezar, ¿cómo se siente con su cara en este momento?`,
    turns: [
      {
        reply: 'Gracias por contármelo. Cuando más lo nota, ¿qué suele estar pasando: fotos, conocer gente, mirarse al espejo?',
        evidence: [{ construct_id: 'appearance.overall', severity: 'moderate', confidence: 0.7 }],
        asks: ['appearance.overall'],
      },
      {
        reply: 'Tiene sentido. ¿Cambia cómo se siente por dentro? Por ejemplo, ¿piensa mucho en ello o se siente triste por eso?',
        evidence: [{ construct_id: 'appearance.overall', severity: 'moderate', confidence: 0.85 }],
        asks: ['psych.self_consciousness', 'psych.distress'],
      },
      {
        reply: 'Le agradezco que lo comparta. ¿Y con otras personas? ¿Hay situaciones que evita o en las que se siente con menos confianza?',
        evidence: [{ construct_id: 'psych.self_consciousness', severity: 'moderate', confidence: 0.8 }],
        asks: ['social.confidence'],
      },
      {
        reply: 'Entendido. En lo práctico, ¿hay algo con la respiración, comer o hablar que le esté molestando?',
        evidence: [{ construct_id: 'social.confidence', severity: 'mild', confidence: 0.75 }],
        asks: ['function.breathing', 'function.eating', 'function.speaking'],
      },
      {
        reply: 'Gracias. ¿Ha notado hinchazón, adormecimiento, cicatrices o molestias últimamente?',
        evidence: [{ construct_id: 'function.breathing', severity: 'mild', confidence: 0.7 }],
        asks: ['adverse.swelling_bruising', 'adverse.scarring', 'adverse.pain'],
      },
      {
        reply: 'Anotado. Por último: ¿qué espera que cambie, o cómo sería un buen resultado para usted?',
        evidence: [{ construct_id: 'adverse.scarring', severity: 'mild', confidence: 0.7 }],
        asks: ['outcome.decision'],
      },
      {
        reply: 'Me ayuda mucho, gracias. Creo que ya tengo una buena idea. Voy a preparar un resumen breve de lo que escuché para que lo revise y corrija lo que quiera.',
        evidence: [{ construct_id: 'outcome.decision', severity: 'none', confidence: 0.8 }],
        asks: [],
      },
    ],
    skipAck: 'Sin problema, lo dejamos. Le pregunto por otra cosa.',
    breakAck: 'Claro, tómese el tiempo que necesite. Este enlace le traerá de vuelta aquí cuando quiera.',
    stopAck: 'De acuerdo, paramos aquí. Gracias por todo lo que ha compartido. Le muestro un resumen breve para que lo revise.',
    wrapUp: 'Nos queda poco tiempo, así que voy a ir cerrando. Gracias por todo lo que ha compartido.',
    safety:
      'Gracias por contármelo. No puedo ayudar con esto directamente, pero es importante y quiero que esté a salvo. Si está en peligro inmediato, contacte ahora con los servicios de emergencia de su zona. Si tiene menos de 18 años, hable con un adulto de confianza. Su equipo de atención será avisado y se pondrá en contacto. Dejamos aquí nuestra conversación.',
  },
}

export type ControlPhrase = 'skip' | 'stop' | 'pause' | null

const CONTROL: Record<Language, { skip: RegExp; stop: RegExp; pause: RegExp }> = {
  en: {
    skip: /^\s*(skip|next|pass|i'?d rather not( say)?|rather not|prefer not to( say| answer)?)\s*[.!]?\s*$/i,
    stop: /^\s*(stop|i want to stop|let'?s stop|end|finish|i'?m done|done)\s*[.!]?\s*$/i,
    pause: /^\s*(pause|take a break|i need a break|break|later|continue later)\s*[.!]?\s*$/i,
  },
  es: {
    skip: /^\s*(saltar|salta|siguiente|paso|prefiero no (decir|responder|contestar)( eso)?|mejor no)\s*[.!]?\s*$/i,
    stop: /^\s*(parar|para|quiero parar|terminar|termino|ya está|basta)\s*[.!]?\s*$/i,
    pause: /^\s*(pausa|necesito una pausa|un descanso|descanso|luego|seguimos luego)\s*[.!]?\s*$/i,
  },
}

export function detectControlPhrase(text: string, lang: Language): ControlPhrase {
  const rx = CONTROL[lang]
  if (rx.skip.test(text)) return 'skip'
  if (rx.stop.test(text)) return 'stop'
  if (rx.pause.test(text)) return 'pause'
  return null
}

const SAFETY: Record<Language, RegExp> = {
  en: /\b(kill myself|end my life|suicid|hurt myself|self[- ]harm|don'?t want to (live|be here)|someone (hits|hurts|is hurting) me|abus(e|ed|ing) me)\b/i,
  es: /\b(matarme|quitarme la vida|suicid|hacerme daño|no quiero (vivir|seguir)|me pega|me maltrata|abusa de mí)\b/i,
}

export function detectSafety(text: string, lang: Language): boolean {
  return SAFETY[lang].test(text) || SAFETY[lang === 'en' ? 'es' : 'en'].test(text)
}

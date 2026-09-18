import type { Language, SessionPhase, Severity } from '../../types'

// Scripted assistant turns for the mock conversation engine. Turn N of the script answers the
// patient's Nth message regardless of content; control phrases and safety keywords are handled
// deterministically before the script (mirrors SPEC §7.4–§7.5).

export interface ScriptEvidence {
  construct_id: string
  severity: Severity
  confidence: number
  /** facet ids of the construct this answer speaks to (v1.1 §A) */
  facets?: string[]
  /** triage item this answer closes out, during the opening screen */
  triage_item?: string
}

export interface ScriptTurn {
  reply: string
  evidence?: ScriptEvidence[]
  /** construct(s) the assistant is asking about in this turn (used by Skip) */
  asks: string[]
  /** phase the session is in once this reply has been sent */
  phase: SessionPhase
  /** focus construct the assistant is working through, in `explore` */
  focus?: string | null
  /** set when the patient's message just confirmed the reflected-back summary of this construct */
  confirms?: string
}

export interface Script {
  opening: (name: string) => string
  turns: ScriptTurn[]
  /** focus constructs the tracker derived after triage; drives `focus_progress.total` */
  focusPlan: string[]
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
        reply: 'Thank you for telling me that. Which parts of your face are on your mind the most at the moment?',
        evidence: [{ construct_id: 'appearance.overall', severity: 'moderate', confidence: 0.7, triage_item: 'overall' }],
        asks: ['appearance.overall'],
        phase: 'triage',
      },
      {
        reply: 'That helps, thank you. Is there anything about your face that makes everyday things harder, like breathing, eating, speaking, or showing what you feel?',
        evidence: [{ construct_id: 'appearance.overall', severity: 'moderate', confidence: 0.85, triage_item: 'features' }],
        asks: ['function.breathing', 'function.eating'],
        phase: 'triage',
      },
      {
        reply: 'Got it. And how does all of this affect how you feel about yourself, or what you do around other people?',
        evidence: [{ construct_id: 'function.breathing', severity: 'mild', confidence: 0.7, triage_item: 'function', facets: ['daytime'] }],
        asks: ['psych.self_consciousness', 'psych.distress'],
        phase: 'triage',
      },
      {
        reply: 'That gives me a good picture of what matters to you. I would like to stay with your nose for a moment. When you look at it, is it more the shape from the front, or how it looks from the side?',
        evidence: [{ construct_id: 'psych.self_consciousness', severity: 'moderate', confidence: 0.8, triage_item: 'impact' }],
        asks: ['appearance.nose'],
        phase: 'explore',
        focus: 'appearance.nose',
      },
      {
        reply: 'Thank you. And do the two sides look the same to you, or does one sit differently?',
        evidence: [{ construct_id: 'appearance.nose', severity: 'moderate', confidence: 0.8, facets: ['shape', 'profile'] }],
        asks: ['appearance.nose'],
        phase: 'explore',
        focus: 'appearance.nose',
      },
      {
        reply: 'So the main things with your nose are the shape from the side, that the two sides do not quite match, and that it has been on your mind for a long time. Have I got that right?',
        evidence: [{ construct_id: 'appearance.nose', severity: 'moderate', confidence: 0.85, facets: ['symmetry', 'since_when'] }],
        asks: ['appearance.nose'],
        phase: 'explore',
        focus: 'appearance.nose',
      },
      {
        reply: 'Thank you for checking that with me. Now about breathing through your nose: is it harder on one side, or on both?',
        evidence: [{ construct_id: 'appearance.nose', severity: 'moderate', confidence: 0.9, facets: ['wanted_change'] }],
        asks: ['function.breathing'],
        phase: 'explore',
        focus: 'function.breathing',
        confirms: 'appearance.nose',
      },
      {
        reply: 'So with your breathing it is mainly one side, and it is worse at night. Is that right?',
        evidence: [{ construct_id: 'function.breathing', severity: 'mild', confidence: 0.8, facets: ['which_side', 'sleep'] }],
        asks: ['function.breathing'],
        phase: 'explore',
        focus: 'function.breathing',
      },
      {
        reply: 'That is really helpful, thank you. I think I have a good picture now. I will put together a short summary of what I heard so you can check it and change anything.',
        evidence: [{ construct_id: 'function.breathing', severity: 'mild', confidence: 0.85, facets: ['exercise'] }],
        asks: [],
        phase: 'wrap-up',
        focus: null,
        confirms: 'function.breathing',
      },
    ],
    focusPlan: ['appearance.nose', 'function.breathing', 'psych.self_consciousness'],
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
        reply: 'Gracias por contármelo. ¿Qué partes de su cara son las que más tiene en mente ahora mismo?',
        evidence: [{ construct_id: 'appearance.overall', severity: 'moderate', confidence: 0.7, triage_item: 'overall' }],
        asks: ['appearance.overall'],
        phase: 'triage',
      },
      {
        reply: 'Me ayuda, gracias. ¿Hay algo de su cara que le complique el día a día, como respirar, comer, hablar o expresar lo que siente?',
        evidence: [{ construct_id: 'appearance.overall', severity: 'moderate', confidence: 0.85, triage_item: 'features' }],
        asks: ['function.breathing', 'function.eating'],
        phase: 'triage',
      },
      {
        reply: 'Entendido. ¿Y cómo afecta todo esto a cómo se siente consigo misma, o a lo que hace con otras personas?',
        evidence: [{ construct_id: 'function.breathing', severity: 'mild', confidence: 0.7, triage_item: 'function', facets: ['daytime'] }],
        asks: ['psych.self_consciousness', 'psych.distress'],
        phase: 'triage',
      },
      {
        reply: 'Con esto me hago una buena idea de lo que le importa. Me gustaría quedarme un momento con la nariz. Cuando se la mira, ¿es más la forma de frente o cómo se ve de lado?',
        evidence: [{ construct_id: 'psych.self_consciousness', severity: 'moderate', confidence: 0.8, triage_item: 'impact' }],
        asks: ['appearance.nose'],
        phase: 'explore',
        focus: 'appearance.nose',
      },
      {
        reply: 'Gracias. ¿Y los dos lados le parecen iguales, o uno queda distinto?',
        evidence: [{ construct_id: 'appearance.nose', severity: 'moderate', confidence: 0.8, facets: ['shape', 'profile'] }],
        asks: ['appearance.nose'],
        phase: 'explore',
        focus: 'appearance.nose',
      },
      {
        reply: 'Entonces, con la nariz, lo principal es la forma de lado, que los dos lados no coinciden del todo y que lleva mucho tiempo dándole vueltas. ¿Lo he entendido bien?',
        evidence: [{ construct_id: 'appearance.nose', severity: 'moderate', confidence: 0.85, facets: ['symmetry', 'since_when'] }],
        asks: ['appearance.nose'],
        phase: 'explore',
        focus: 'appearance.nose',
      },
      {
        reply: 'Gracias por confirmármelo. Ahora, sobre respirar por la nariz: ¿le cuesta más por un lado o por los dos?',
        evidence: [{ construct_id: 'appearance.nose', severity: 'moderate', confidence: 0.9, facets: ['wanted_change'] }],
        asks: ['function.breathing'],
        phase: 'explore',
        focus: 'function.breathing',
        confirms: 'appearance.nose',
      },
      {
        reply: 'Entonces, con la respiración, es sobre todo un lado y por la noche va peor. ¿Es así?',
        evidence: [{ construct_id: 'function.breathing', severity: 'mild', confidence: 0.8, facets: ['which_side', 'sleep'] }],
        asks: ['function.breathing'],
        phase: 'explore',
        focus: 'function.breathing',
      },
      {
        reply: 'Me ayuda mucho, gracias. Creo que ya tengo una buena idea. Voy a preparar un resumen breve de lo que escuché para que lo revise y corrija lo que quiera.',
        evidence: [{ construct_id: 'function.breathing', severity: 'mild', confidence: 0.85, facets: ['exercise'] }],
        asks: [],
        phase: 'wrap-up',
        focus: null,
        confirms: 'function.breathing',
      },
    ],
    focusPlan: ['appearance.nose', 'function.breathing', 'psych.self_consciousness'],
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

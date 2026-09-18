// Deterministic safety intercept (SPEC §7.4). Runs before every model call; never a prompt.
// Patterns are matched against a lower-cased, diacritic-stripped copy of the message so
// "daño"/"dano" and "él"/"el" both match. Both language sets run regardless of the session
// language because patients switch languages mid-conversation.

import type { Language, SafetyTrigger } from "./types.ts";

export interface SafetyHit {
  trigger: SafetyTrigger;
  matched: string;
  language: Language;
}

export function normaliseForMatching(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’‘`´]/g, "'")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Person subjects for abuse patterns: keeps "my nose hurts me" from matching.
const EN_PERSON =
  "(?:he|she|they|my (?:husband|wife|partner|boyfriend|girlfriend|ex|dad|mom|mum|father|mother|stepdad|stepmom|stepfather|stepmother|parents?|brother|sister|son|daughter|uncle|aunt|grandpa|grandma|carer|caregiver|boss|roommate|coach|teacher))";
const ES_PERSON =
  "(?:el|ella|ellos|mi (?:esposo|esposa|marido|mujer|pareja|novio|novia|ex|papa|mama|padre|madre|padrastro|madrastra|padres|hermano|hermana|hijo|hija|tio|tia|abuelo|abuela|jefe|jefa|cuidador|cuidadora|maestro|maestra|profesor|profesora))";

const PATTERNS: { language: Language; trigger: SafetyTrigger; re: RegExp }[] = [
  // ---- English: self-harm ----
  { language: "en", trigger: "self_harm", re: /\b(?:kill|hurt|harm|cut|cutting)(?:ing)? myself\b/ },
  { language: "en", trigger: "self_harm", re: /\bsuicid(?:e|al)\b/ },
  { language: "en", trigger: "self_harm", re: /\bself[- ]harm/ },
  { language: "en", trigger: "self_harm", re: /\b(?:end|take|ending|taking) my (?:own )?life\b/ },
  { language: "en", trigger: "self_harm", re: /\bend it all\b/ },
  { language: "en", trigger: "self_harm", re: /\bwant(?:ed)? to die\b/ },
  { language: "en", trigger: "self_harm", re: /\bwish(?:ed)? i (?:was|were) dead\b/ },
  { language: "en", trigger: "self_harm", re: /\bbetter off dead\b/ },
  // Passive ideation: no method or intent, but still a hard stop.
  {
    language: "en",
    trigger: "self_harm",
    re:
      /\b(?:better off|easier) (?:without me|if i (?:wasn't|weren't|was not|were not) (?:here|around|alive))\b/,
  },
  {
    language: "en",
    trigger: "self_harm",
    re: /\b(?:wish|wished) i (?:could|would) (?:just )?disappear\b/,
  },
  {
    language: "en",
    trigger: "self_harm",
    re:
      /\b(?:hope|hoping|wish|wished|wishing) i (?:don't|do not|dont|never|wouldn't|would not|didn't) wake up\b/,
  },
  {
    language: "en",
    trigger: "self_harm",
    re: /\bno point (?:in )?(?:going on|living|carrying on)\b/,
  },
  {
    language: "en",
    trigger: "self_harm",
    re: /\b(?:don't|do not|dont) want to (?:live|be alive|exist)\b/,
  },
  {
    language: "en",
    trigger: "self_harm",
    re:
      /\b(?:don't|do not|dont) want to (?:be here|wake up|go on) (?:anymore|any more|any longer)\b/,
  },
  {
    language: "en",
    trigger: "self_harm",
    re: /\bno reason to (?:live|keep living|go on living)\b/,
  },
  // ---- English: abuse ----
  {
    language: "en",
    trigger: "abuse",
    re: new RegExp(`\\b${EN_PERSON} (?:hits?|beats?|hurts?|chokes?|threatens?|abuses?) me\\b`),
  },
  {
    language: "en",
    trigger: "abuse",
    re: /\b(?:being|been|was|am|is) (?:physically |sexually |emotionally )?abused\b/,
  },
  { language: "en", trigger: "abuse", re: /\b(?:sexually|physically) (?:assaulted|abused)\b/ },
  { language: "en", trigger: "abuse", re: /\b(?:raped|molested)\b/ },
  {
    language: "en",
    trigger: "abuse",
    re: /\b(?:not|isn't|isnt|don't feel|dont feel) safe at home\b/,
  },
  {
    language: "en",
    trigger: "abuse",
    re: new RegExp(`\\b(?:afraid|scared|terrified) of ${EN_PERSON}\\b`),
  },
  // ---- English: acute distress ----
  {
    language: "en",
    trigger: "acute_distress",
    re:
      /\bcan(?:'t|not|t) (?:take|handle|cope with|deal with|do) (?:this|it|things) (?:anymore|any more|any longer)\b/,
  },
  { language: "en", trigger: "acute_distress", re: /\bcan(?:'t|not|t) go on\b/ },
  { language: "en", trigger: "acute_distress", re: /\bpanic attack\b/ },
  { language: "en", trigger: "acute_distress", re: /\bwant to disappear\b/ },
  { language: "en", trigger: "acute_distress", re: /\bnobody would (?:care|notice|miss me)\b/ },
  { language: "en", trigger: "acute_distress", re: /\b(?:completely|totally|utterly) hopeless\b/ },
  { language: "en", trigger: "acute_distress", re: /\bhaving a breakdown\b/ },
  { language: "en", trigger: "acute_distress", re: /\bfalling apart\b/ },

  // ---- Spanish: self-harm ----
  { language: "es", trigger: "self_harm", re: /\b(?:matarme|suicidarme|suicidio|suicida)\b/ },
  { language: "es", trigger: "self_harm", re: /\bquitarme la vida\b/ },
  { language: "es", trigger: "self_harm", re: /\b(?:hacerme|me hago|me hice) dano\b/ },
  { language: "es", trigger: "self_harm", re: /\bcortarme\b/ },
  {
    language: "es",
    trigger: "self_harm",
    re: /\b(?:me quiero morir|quiero morir(?:me)?|quisiera morir(?:me)?)\b/,
  },
  {
    language: "es",
    trigger: "self_harm",
    re: /\bno quiero (?:vivir|seguir viviendo|existir|despertar(?:me)?)\b/,
  },
  {
    language: "es",
    trigger: "self_harm",
    re: /\b(?:ya no quiero estar aqui|no quiero estar aqui (?:mas|ya)|no quiero seguir aqui)\b/,
  },
  { language: "es", trigger: "self_harm", re: /\bmejor (?:estar )?muert[oa]\b/ },
  { language: "es", trigger: "self_harm", re: /\bacabar con (?:todo|mi vida)\b/ },
  { language: "es", trigger: "self_harm", re: /\bno vale la pena vivir\b/ },
  // Passive ideation.
  {
    language: "es",
    trigger: "self_harm",
    re: /\b(?:estarian|estaria|estarias) mejor sin mi\b/,
  },
  { language: "es", trigger: "self_harm", re: /\bmejor si (?:yo )?no (?:estuviera|existiera)\b/ },
  { language: "es", trigger: "self_harm", re: /\b(?:quisiera|quiero) desaparecer\b/ },
  { language: "es", trigger: "self_harm", re: /\bno (?:tiene|le veo) sentido seguir\b/ },
  // ---- Spanish: abuse ----
  {
    language: "es",
    trigger: "abuse",
    re: new RegExp(`\\b${ES_PERSON} me (?:pega|golpea|maltrata|abusa|amenaza|lastima|ahorca)\\b`),
  },
  { language: "es", trigger: "abuse", re: /\bme (?:pega|golpea|maltrata) (?:mi|el|ella)\b/ },
  { language: "es", trigger: "abuse", re: /\babus(?:o|an|a|aron) (?:sexual|fisic)/ },
  { language: "es", trigger: "abuse", re: /\b(?:me violo|me violaron|violacion)\b/ },
  { language: "es", trigger: "abuse", re: /\bno (?:estoy|me siento) segur[oa] en (?:mi )?casa\b/ },
  {
    language: "es",
    trigger: "abuse",
    re: new RegExp(`\\b(?:tengo miedo|le tengo miedo|miedo) (?:de|a) ${ES_PERSON}\\b`),
  },
  // ---- Spanish: acute distress ----
  { language: "es", trigger: "acute_distress", re: /\b(?:ya )?no (?:puedo|aguanto|soporto) mas\b/ },
  { language: "es", trigger: "acute_distress", re: /\bataque de panico\b/ },
  { language: "es", trigger: "acute_distress", re: /\bquiero desaparecer\b/ },
  { language: "es", trigger: "acute_distress", re: /\bno le importo a nadie\b/ },
  {
    language: "es",
    trigger: "acute_distress",
    re: /\b(?:completamente|totalmente) desesperad[oa]\b/,
  },
  {
    language: "es",
    trigger: "acute_distress",
    re: /\bme estoy (?:derrumbando|desmoronando|quebrando)\b/,
  },
];

const TRIGGER_PRIORITY: Record<SafetyTrigger, number> = {
  self_harm: 0,
  abuse: 1,
  acute_distress: 2,
  other: 3,
};

/**
 * Returns the highest-priority hit (self-harm > abuse > acute distress) or null. The session
 * language is checked first only for tie-breaking; every pattern set always runs.
 */
export function detectSafety(text: string, language: Language = "en"): SafetyHit | null {
  const norm = normaliseForMatching(text);
  if (!norm) return null;
  let best: SafetyHit | null = null;
  for (const p of PATTERNS) {
    const m = p.re.exec(norm);
    if (!m) continue;
    const hit: SafetyHit = { trigger: p.trigger, matched: m[0], language: p.language };
    if (
      !best ||
      TRIGGER_PRIORITY[hit.trigger] < TRIGGER_PRIORITY[best.trigger] ||
      (TRIGGER_PRIORITY[hit.trigger] === TRIGGER_PRIORITY[best.trigger] &&
        hit.language === language && best.language !== language)
    ) {
      best = hit;
    }
  }
  return best;
}

// Deterministic control-phrase detection (SPEC §7.5): skip / rather_not / stop / pause.
// Skip, stop and pause must be the whole (short) message so "I want to stop feeling like
// this" is treated as content, not a command. "Rather not" is honoured anywhere in a short
// message because it is unambiguous ("I'd rather not talk about that").

import type { Language } from "./types.ts";
import { normaliseForMatching } from "./safety.ts";

export type ControlKind = "skip" | "rather_not" | "stop" | "pause";

export interface ControlHit {
  kind: ControlKind;
  matched: string;
}

const MAX_WORDS_WHOLE = 6;
const MAX_WORDS_RATHER_NOT = 16;

const WHOLE_MESSAGE: { kind: ControlKind; re: RegExp }[] = [
  {
    kind: "stop",
    re:
      /^(?:stop|stop now|please stop|i want to stop|i'd like to stop|let's stop|lets stop|i'm done|im done|i am done|that's enough|thats enough|enough|end (?:the )?(?:session|conversation|chat)|finish|let's finish|i want to finish|quit|parar|para|quiero parar|quiero terminar|terminar|terminemos|basta|ya basta|ya termine|ya esta|me quiero ir|quiero dejarlo|dejarlo aqui)[.!]*$/,
  },
  {
    kind: "pause",
    re:
      /^(?:pause|take a break|let's take a break|lets take a break|i need a break|break|can we pause|let's pause|lets pause|later|continue later|let's continue later|i'll come back later|be right back|brb|pausa|pausar|un descanso|descanso|necesito un descanso|tomemos un descanso|seguimos luego|seguimos despues|seguimos mas tarde|luego sigo|despues sigo|vuelvo luego|ahora no puedo|continuar luego)[.!]*$/,
  },
  {
    kind: "skip",
    re:
      /^(?:skip|skip this|skip that|skip it|skip this one|skip this question|next|next question|next one|pass|pass on this|pass on that|move on|let's move on|lets move on|something else|saltar|salta|saltar esta|saltar esa|salta esta|omitir|omite|omitir esta|siguiente|la siguiente|siguiente pregunta|paso|pasar|otra cosa|otra pregunta)[.!]*$/,
  },
];

const ANYWHERE: { kind: ControlKind; re: RegExp }[] = [
  {
    kind: "rather_not",
    re:
      /\b(?:i'?d rather not|i would rather not|rather not say|rather not talk about|prefer not to (?:say|answer|talk about|discuss)|i'?d prefer not|don'?t want to (?:talk about|answer|say|discuss|get into) (?:that|this|it)(?!'s)|not comfortable (?:talking about|answering|sharing) (?:that|this|it)|no comment)\b/,
  },
  {
    kind: "rather_not",
    re:
      /\b(?:prefiero no (?:decir|hablar|responder|contestar|hablar de eso|hablar de esto|decirlo|contar)|preferiria no|no quiero hablar de (?:eso|esto|ello)|no quiero (?:responder|contestar|decir)(?: eso| esto)?|mejor no (?:hablo|hablar|digo|decir)|no me siento comod[oa] hablando de eso|sin comentarios)\b/,
  },
];

function wordCount(s: string): number {
  return s.split(" ").filter(Boolean).length;
}

export function detectControlPhrase(text: string, _language: Language = "en"): ControlHit | null {
  const norm = normaliseForMatching(text).replace(/[¡¿"“”]/g, "").replace(/[.!?…]+$/g, "").trim();
  if (!norm) return null;
  const words = wordCount(norm);

  if (words <= MAX_WORDS_WHOLE) {
    for (const p of WHOLE_MESSAGE) {
      const m = p.re.exec(norm);
      if (m) return { kind: p.kind, matched: m[0] };
    }
  }
  if (words <= MAX_WORDS_RATHER_NOT) {
    for (const p of ANYWHERE) {
      const m = p.re.exec(norm);
      if (m) return { kind: p.kind, matched: m[0] };
    }
  }
  return null;
}

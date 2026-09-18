// Fixed, reviewed safety messages (SPEC §7.4). Plain, warm, short. No clinical advice.
// Region-agnostic: "local emergency services" rather than a specific number.

import type { AgeBand, Language } from "./types.ts";

export type SafetyAudience = "adult" | "minor";

const MESSAGES: Record<Language, Record<SafetyAudience, string>> = {
  en: {
    adult: "Thank you for telling me this. It matters, and you deserve support right now. " +
      "I am going to pause our conversation here and let your care team know, so a person can reach out to you. " +
      "If you are in danger or feel you might hurt yourself, please contact your local emergency services or a crisis line right away, " +
      "or go to the nearest emergency department. If you can, tell someone you trust what is going on. You are not alone in this.",
    minor: "Thank you for telling me. That was brave, and what you said is important. " +
      "I am going to stop our chat here so that your care team can check in with you. " +
      "Please talk to a trusted adult right now, like a parent, a teacher, or a school nurse, and tell them how you feel. " +
      "If you are in danger or might get hurt, ask an adult to contact your local emergency services straight away. You matter, and there are people who want to help you.",
  },
  es: {
    adult: "Gracias por contarme esto. Es importante, y usted merece apoyo ahora mismo. " +
      "Voy a pausar nuestra conversación aquí y avisar a su equipo de atención para que una persona se ponga en contacto con usted. " +
      "Si está en peligro o siente que podría hacerse daño, por favor contacte de inmediato con los servicios de emergencia de su zona o con una línea de crisis, " +
      "o acuda al servicio de urgencias más cercano. Si puede, cuéntele a alguien de confianza lo que está pasando. No está solo en esto.",
    minor: "Gracias por contármelo. Fue muy valiente, y lo que dijiste es importante. " +
      "Voy a parar nuestra charla aquí para que tu equipo de atención pueda hablar contigo. " +
      "Por favor, habla ahora mismo con un adulto de confianza, como tu mamá, tu papá, un maestro o la enfermera de la escuela, y cuéntale cómo te sientes. " +
      "Si estás en peligro o alguien podría hacerte daño, pídele a un adulto que llame enseguida a los servicios de emergencia de tu zona. Tú importas, y hay personas que quieren ayudarte.",
  },
};

export function isMinorBand(ageBand: AgeBand): boolean {
  return ageBand === "under-8" || ageBand === "8-12" || ageBand === "13-17";
}

export function safetyMessage(language: Language, audience: SafetyAudience): string {
  return (MESSAGES[language] ?? MESSAGES.en)[audience];
}

export function safetyMessageFor(language: Language, ageBand: AgeBand): string {
  return safetyMessage(language, isMinorBand(ageBand) ? "minor" : "adult");
}

/** Fixed text shown when the patient asks to pause (SPEC §7.5). */
export const PAUSE_MESSAGES: Record<Language, string> = {
  en:
    "Of course, let's take a break. Nothing is lost. Whenever you're ready, open your link again and we'll pick up right where we left off.",
  es:
    "Claro, tomemos un descanso. No se pierde nada. Cuando quiera, abra su enlace de nuevo y seguimos justo donde lo dejamos.",
};

/** Fixed closing text when the patient asks to stop (SPEC §7.5). */
export const STOP_MESSAGES: Record<Language, string> = {
  en:
    "Understood, we'll stop here. Thank you for everything you shared. Next I'll show you a short summary of what I heard so you can check it.",
  es:
    "Entendido, paramos aquí. Gracias por todo lo que compartió. A continuación le mostraré un breve resumen de lo que escuché para que pueda revisarlo.",
};

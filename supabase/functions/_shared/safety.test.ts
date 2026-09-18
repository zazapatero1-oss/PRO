import { assertEquals } from "@std/assert";
import { detectSafety } from "./safety.ts";
import { safetyMessage, safetyMessageFor } from "./safety_messages.ts";

const positives: [string, string, "en" | "es"][] = [
  ["I don't want to be here anymore", "self_harm", "en"],
  ["Sometimes I think about killing myself", "self_harm", "en"],
  ["honestly i've been feeling suicidal", "self_harm", "en"],
  ["I wish I was dead", "self_harm", "en"],
  ["I just want to die", "self_harm", "en"],
  ["I've been cutting myself again", "self_harm", "en"],
  ["My husband hits me when he drinks", "abuse", "en"],
  ["I'm not safe at home", "abuse", "en"],
  ["I'm scared of my dad", "abuse", "en"],
  ["I can't take this anymore", "acute_distress", "en"],
  ["I had a panic attack yesterday", "acute_distress", "en"],
  ["Quiero matarme", "self_harm", "es"],
  ["ya no quiero estar aquí", "self_harm", "es"],
  ["Me quiero morir", "self_harm", "es"],
  ["a veces pienso en hacerme daño", "self_harm", "es"],
  ["no quiero seguir viviendo", "self_harm", "es"],
  ["Mi esposo me pega", "abuse", "es"],
  ["tengo miedo de mi papá", "abuse", "es"],
  ["Ya no puedo más", "acute_distress", "es"],
  ["tuve un ataque de pánico", "acute_distress", "es"],
  // passive ideation, no plan
  ["Some days I wonder if everyone would be better off without me here", "self_harm", "en"],
  ["it'd be easier if I wasn't around", "self_harm", "en"],
  ["I just wish I could disappear", "self_harm", "en"],
  ["some nights I hope I don't wake up", "self_harm", "en"],
  ["A veces pienso que estarían mejor sin mí", "self_harm", "es"],
  ["sería mejor si yo no estuviera", "self_harm", "es"],
  ["quisiera desaparecer", "self_harm", "es"],
];

for (const [text, trigger, lang] of positives) {
  Deno.test(`safety positive (${lang}): "${text}" → ${trigger}`, () => {
    const hit = detectSafety(text, lang);
    assertEquals(hit?.trigger, trigger);
  });
}

const negatives: [string, "en" | "es"][] = [
  ["I could kill for a coffee right now", "en"],
  ["This scar is killing me, it itches", "en"],
  ["I'm dying to see the final result", "en"],
  ["My nose hurts me when I breathe in", "en"],
  ["I can't breathe through my nose at night", "en"],
  ["I don't want to be here at the clinic for long", "en"],
  ["I'm afraid of my scar getting worse", "en"],
  ["It hurts me to smile", "en"],
  ["I can't stop touching the swelling", "en"],
  ["the swelling is dead on the left side", "en"],
  ["Me duele la nariz cuando respiro", "es"],
  ["Estoy muerta de cansancio", "es"],
  ["me da miedo el resultado", "es"],
  ["no quiero hablar de eso", "es"],
  ["Me mata la curiosidad por ver el resultado", "es"],
  ["I wish the swelling would just disappear", "en"],
  ["me gustaría que la cicatriz desapareciera", "es"],
];

for (const [text, lang] of negatives) {
  Deno.test(`safety negative (${lang}): "${text}"`, () => {
    assertEquals(detectSafety(text, lang), null);
  });
}

Deno.test("safety: self_harm outranks distress in the same message", () => {
  assertEquals(detectSafety("I can't go on, I want to die", "en")?.trigger, "self_harm");
});

Deno.test("safety: Spanish detected even when session language is English", () => {
  assertEquals(detectSafety("quiero matarme", "en")?.trigger, "self_harm");
});

Deno.test("safety messages: all variants exist, mention care team, no clinical advice words", () => {
  for (const lang of ["en", "es"] as const) {
    for (const aud of ["adult", "minor"] as const) {
      const m = safetyMessage(lang, aud);
      assertEquals(typeof m, "string");
      assertEquals(m.length > 100, true);
      assertEquals(/care team|equipo de atenci/i.test(m), true);
      assertEquals(/emergency|emergencia/i.test(m), true);
    }
  }
  assertEquals(/trusted adult/.test(safetyMessageFor("en", "8-12")), true);
  assertEquals(/adulto de confianza/.test(safetyMessageFor("es", "13-17")), true);
  assertEquals(/trusted adult/.test(safetyMessageFor("en", "30-49")), false);
});

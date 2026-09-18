import { assertEquals } from "@std/assert";
import { detectControlPhrase } from "./control.ts";

const cases: [string, string | null][] = [
  ["skip", "skip"],
  ["Skip this one.", "skip"],
  ["next question", "skip"],
  ["saltar", "skip"],
  ["siguiente", "skip"],
  ["I'd rather not say", "rather_not"],
  ["Hmm, I'd rather not talk about that right now", "rather_not"],
  ["prefiero no hablar de eso", "rather_not"],
  ["No quiero hablar de esto", "rather_not"],
  ["stop", "stop"],
  ["I want to stop", "stop"],
  ["I'm done", "stop"],
  ["quiero parar", "stop"],
  ["Basta.", "stop"],
  ["take a break", "pause"],
  ["Can we pause?", "pause"],
  ["pausa", "pause"],
  ["seguimos luego", "pause"],
  // Content that merely contains a control word is NOT a control phrase.
  ["I want to stop feeling so self-conscious about my nose", null],
  ["I skipped the party because of the swelling", null],
  ["The break in my nose still bothers me", null],
  ["I'd say the pause between surgeries was hard", null],
  ["I don't want to say it's terrible, but it's not great", null],
  ["Quiero parar de sentirme así cuando me miro", null],
];

for (const [text, kind] of cases) {
  Deno.test(`control: "${text}" → ${kind}`, () => {
    assertEquals(detectControlPhrase(text, "en")?.kind ?? null, kind);
  });
}

import { assertEquals } from "@std/assert";
import { classifySafety } from "./safety_classifier.ts";
import { FakeAnthropic } from "./testing.ts";

const recent = [{ role: "assistant", content: "How have things been?" }];

Deno.test("classifier: null trigger → null", async () => {
  const client = new FakeAnthropic([{
    text: '{"trigger": null, "rationale": "ordinary frustration"}',
  }]);
  assertEquals(
    await classifySafety({ client, model: "m", text: "the swelling is killing me", recent }),
    null,
  );
});

Deno.test("classifier: flagged trigger is returned with rationale", async () => {
  const client = new FakeAnthropic([{
    text: '{"trigger":"self_harm","rationale":"passive ideation"}',
  }]);
  const r = await classifySafety({
    client,
    model: "m",
    text: "everyone would be fine if I wasn't around",
    recent,
  });
  assertEquals(r, { trigger: "self_harm", rationale: "passive ideation" });
});

Deno.test("classifier: fails open on unparseable output", async () => {
  const client = new FakeAnthropic([{ text: "not json" }, { text: "still not json" }]);
  assertEquals(await classifySafety({ client, model: "m", text: "hi", recent }), null);
});

Deno.test("classifier: fails open on API error", async () => {
  const client = new FakeAnthropic([new Error("network")]);
  assertEquals(await classifySafety({ client, model: "m", text: "hi", recent }), null);
});

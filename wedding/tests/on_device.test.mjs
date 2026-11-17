// Checks the no-key mode: js/on-device-ai.js answers the runtime's model requests with
// Chrome's built-in AI. A scripted stand-in for the Prompt API replaces the real model, and
// the runtime's own LlmClient reads the replies, so the whole path is tested end to end.
// Run: node --test "wedding/tests/*.test.mjs"
import assert from "node:assert/strict";
import test from "node:test";
import { LlmClient } from "../runtime/llm.js";
import { OnDeviceAI } from "../js/on-device-ai.js";

/**
 * A stand-in for one Prompt API session. Each prompt takes the next scripted output.
 */
class ScriptedSession {
  /**
   * :param script: the shared list of outputs, consumed in order
   * :param log: the shared list the session records each prompt in
   */
  constructor(script, log) {
    this.script = script;
    this.log = log;
    this.destroyed = false;
  }

  async clone() {
    return new ScriptedSession(this.script, this.log);
  }

  /**
   * Stream the next output in small pieces, stopping when the signal aborts.
   *
   * :param text: the prompt
   * :param options: responseConstraint and signal
   */
  async *promptStreaming(text, options = {}) {
    this.log.push({ text: text, schema: options.responseConstraint || null });
    const output = this.script.shift();
    if (output === undefined) throw new Error("The script ran out.");
    if (output === "THROW") throw new Error("An unknown error occurred: kErrorUnknown");
    for (let start = 0; start < output.length; start += 5) {
      if (options.signal && options.signal.aborted) {
        const error = new Error("aborted");
        error.name = "AbortError";
        throw error;
      }
      yield output.slice(start, start + 5);
    }
  }

  destroy() {
    this.destroyed = true;
  }
}

/**
 * A stand-in for the LanguageModel global.
 */
class ScriptedModel {
  static script = [];

  static log = [];

  static created = [];

  static async availability() {
    return "available";
  }

  static async create(options) {
    ScriptedModel.created.push(options);
    return new ScriptedSession(ScriptedModel.script, ScriptedModel.log);
  }

  /**
   * Start a test with these outputs.
   *
   * :param outputs: what the model says, in order
   */
  static reset(outputs) {
    ScriptedModel.script = [...outputs];
    ScriptedModel.log = [];
    ScriptedModel.created = [];
    OnDeviceAI.baseSessions.clear();
  }
}

globalThis.LanguageModel = ScriptedModel;
// Anything that is not the on-device router must not be fetched in these tests.
globalThis.fetch = async (input) => {
  throw new Error(`Unexpected network request: ${input}`);
};
OnDeviceAI.install();

const TOOLS = [
  {
    type: "function",
    function: {
      name: "website_look_up_invitation",
      description: "Find an invitation by code and last name.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["code", "lastName"],
        properties: {
          code: { type: "string", maxLength: 12, description: "The code." },
          lastName: { type: "string", description: "The last name." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "render_cruse",
      description: "Show a form.",
      parameters: { type: "object", properties: { version: { type: "integer" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "harborline_cabs",
      description: "Hand off to the Harborline Cabs network.",
      parameters: { type: "object", required: ["request"], properties: { request: { type: "string" } } },
    },
  },
];

/**
 * Send one chat request through the runtime's client to the on-device router.
 *
 * :param messages: the conversation
 * :return: the client's result: content, toolCalls and finishReason
 */
function chat(messages) {
  const client = new LlmClient({ baseUrl: OnDeviceAI.ROUTER, apiKey: OnDeviceAI.KEY });
  return client.chat({ model: OnDeviceAI.MODEL, messages: messages, tools: TOOLS });
}

const SYSTEM = { role: "system", content: "You are the guest concierge." };

test("a new visitor message must start with a tool, and the call reaches the runtime", async () => {
  ScriptedModel.reset(['{"next":"website_look_up_invitation"}', '{"code":"MP-4821","lastName":"Pell"}']);
  const result = await chat([SYSTEM, { role: "user", content: "Look up MP-4821, Pell." }]);
  assert.equal(result.finishReason, "tool_calls");
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0].function.name, "website_look_up_invitation");
  assert.deepEqual(JSON.parse(result.toolCalls[0].function.arguments), { code: "MP-4821", lastName: "Pell" });
  // Step 1 offered only tools: "answer" is left out after a visitor message.
  const first = ScriptedModel.log[0].schema;
  assert.deepEqual(first.properties.next.enum, ["website_look_up_invitation", "harborline_cabs"]);
  // render_cruse is too much for a small model, so it is never offered.
  assert.ok(!JSON.stringify(ScriptedModel.log).includes("render_cruse"));
  // Step 2 is constrained to that tool's arguments, without descriptions, with caps.
  const second = ScriptedModel.log[1].schema;
  assert.deepEqual(second.required, ["code", "lastName"]);
  assert.equal(second.properties.code.maxLength, 12);
  assert.equal(second.properties.lastName.maxLength, 300);
  assert.equal(second.properties.code.description, undefined);
});

test("after a tool result the model may answer, in plain text", async () => {
  ScriptedModel.reset(['{"next":"answer"}', "Your invitation covers Iris, Owen and Juniper.\\nAll three are invited."]);
  const result = await chat([
    SYSTEM,
    { role: "user", content: "Who is on MP-4821?" },
    { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "website_look_up_invitation", arguments: '{"code":"MP-4821","lastName":"Pell"}' } }] },
    { role: "tool", tool_call_id: "c1", content: '{"ok":true,"invitation":{"guests":["Iris","Owen","Juniper"]}}' },
  ]);
  assert.equal(result.finishReason, "stop");
  assert.deepEqual(result.toolCalls, []);
  assert.equal(result.content, "Your invitation covers Iris, Owen and Juniper.\nAll three are invited.");
  assert.ok(ScriptedModel.log[0].schema.properties.next.enum.includes("answer"));
  assert.equal(ScriptedModel.log[1].schema, null);
  // The tool result reaches the model in the transcript.
  assert.match(ScriptedModel.log[0].text, /TOOL RESULT: \{"ok":true/);
});

test("a runaway answer is cut off instead of holding the model", async () => {
  ScriptedModel.reset(['{"next":"answer"}', `Fine.${" again".repeat(2000)}`]);
  const result = await chat([SYSTEM, { role: "user", content: "Hi" }, { role: "assistant", content: "Hello!" }, { role: "tool", tool_call_id: "x", content: "{}" }]);
  assert.ok(result.content.length <= 1500, `The answer was ${result.content.length} characters.`);
  assert.ok(result.content.startsWith("Fine."));
});

test("cut-off tool arguments fall back to an answer, never a broken call", async () => {
  ScriptedModel.reset(['{"next":"website_look_up_invitation"}', `{"code":"MP-4821","lastName":"${"P".repeat(4000)}`, "Sorry, could you give me your code and last name again?"]);
  const result = await chat([SYSTEM, { role: "user", content: "RSVP please" }]);
  assert.deepEqual(result.toolCalls, []);
  assert.equal(result.content, "Sorry, could you give me your code and last name again?");
});

test("when Chrome cannot apply a schema, the arguments are read from a plain reply", async () => {
  // "THROW" makes the scripted session fail the way Chrome does on some nested schemas.
  ScriptedModel.reset(['{"next":"website_look_up_invitation"}', "THROW", 'Sure! {"code":"MP-4821","lastName":"Pell"} is the call.']);
  const result = await chat([SYSTEM, { role: "user", content: "Look up MP-4821, Pell." }]);
  assert.equal(result.toolCalls[0].function.name, "website_look_up_invitation");
  assert.deepEqual(JSON.parse(result.toolCalls[0].function.arguments), { code: "MP-4821", lastName: "Pell" });
  // The retry ran without a constraint, with the schema written into the prompt.
  assert.equal(ScriptedModel.log[2].schema, null);
  assert.match(ScriptedModel.log[2].text, /fits this schema/);
});

test("a step-1 choice that is not offered gets one retry", async () => {
  ScriptedModel.reset(['{"next":"send_everything"}', '{"next":"website_look_up_invitation"}', '{"code":"MP-2294","lastName":"Reyes"}']);
  const result = await chat([SYSTEM, { role: "user", content: "Look up MP-2294, Reyes." }]);
  assert.deepEqual(JSON.parse(result.toolCalls[0].function.arguments), { code: "MP-2294", lastName: "Reyes" });
});

test("after two tool results in a turn, the model answers instead of calling more", async () => {
  ScriptedModel.reset(["Your RSVP form is filled in. Press Send RSVP when you're ready."]);
  const call = (id) => ({ role: "assistant", content: null, tool_calls: [{ id: id, type: "function", function: { name: "website_look_up_invitation", arguments: "{}" } }] });
  const result = await chat([
    SYSTEM,
    { role: "user", content: "Fill in our RSVP." },
    call("a"), { role: "tool", tool_call_id: "a", content: '{"ok":true}' },
    call("b"), { role: "tool", tool_call_id: "b", content: '{"ok":true}' },
  ]);
  assert.deepEqual(result.toolCalls, []);
  assert.equal(result.content, "Your RSVP form is filled in. Press Send RSVP when you're ready.");
  // Only the answer step ran: no step 1.
  assert.equal(ScriptedModel.log.length, 1);
  assert.equal(ScriptedModel.log[0].schema, null);
});

test("a partner already asked in this turn is not offered again", async () => {
  ScriptedModel.reset(['{"next":"answer"}', "The guesthouse has four rooms; book on its site."]);
  await chat([
    SYSTEM,
    { role: "user", content: "Where can we stay?" },
    { role: "assistant", content: null, tool_calls: [{ id: "p", type: "function", function: { name: "harborline_cabs", arguments: '{"request":"What do you offer?"}' } }] },
    { role: "tool", tool_call_id: "p", content: '{"cruse":1,"text":"Cab rides."}' },
  ]);
  assert.deepEqual(ScriptedModel.log[0].schema.properties.next.enum, ["website_look_up_invitation", "answer"]);
});

test("running for another site (no website tools), it answers directly with no made-up links", async () => {
  ScriptedModel.reset(["We have four rooms by the harbor. Book on our [booking page](https://made.up/book) or call 555-0147."]);
  const client = new LlmClient({ baseUrl: OnDeviceAI.ROUTER, apiKey: OnDeviceAI.KEY });
  const result = await client.chat({
    model: OnDeviceAI.MODEL,
    messages: [SYSTEM, { role: "user", content: "What does the guesthouse offer?" }],
    tools: [TOOLS[2]],
  });
  assert.equal(ScriptedModel.log.length, 1, "It asked its own partner instead of answering.");
  assert.equal(result.content, "We have four rooms by the harbor. Book on our booking page or call 555-0147.");
});

test("stray markup after an answer is trimmed", () => {
  assert.equal(OnDeviceAI.tidy("All set.\\n- Iris: chicken</div></body></html> />}"), "All set.\n- Iris: chicken");
  assert.equal(OnDeviceAI.tidy("  Plain answer.  "), "Plain answer.");
});

test("the system prompt is prepared once and reused for the next request", async () => {
  ScriptedModel.reset(['{"next":"answer"}', "One.", '{"next":"answer"}', "Two."]);
  const after = [SYSTEM, { role: "user", content: "Hi" }, { role: "assistant", content: "Hello" }, { role: "tool", tool_call_id: "x", content: "{}" }];
  await chat(after);
  await chat(after);
  assert.equal(ScriptedModel.created.length, 1, "The base session was created twice.");
  assert.match(ScriptedModel.created[0].initialPrompts[0].content, /^You are the guest concierge\./);
});

test("the router answers only its own address", async () => {
  const models = await fetch(`${OnDeviceAI.ROUTER}/models`);
  assert.equal((await models.json()).data[0].id, OnDeviceAI.MODEL);
  const manifest = await fetch(`${new URL(OnDeviceAI.ROUTER).origin}/agent-manifest.json`);
  assert.equal(manifest.status, 404);
  await assert.rejects(fetch("https://example.com/"), /Unexpected network request/);
});

test("long transcripts keep the newest turns", () => {
  const messages = [SYSTEM];
  for (let index = 0; index < 60; index += 1) {
    messages.push({ role: "user", content: `Question ${index} ${"x".repeat(400)}` });
  }
  const { transcript } = OnDeviceAI.prompt(messages, []);
  assert.ok(transcript.length <= OnDeviceAI.TRANSCRIPT_BUDGET + 500);
  assert.match(transcript, /Question 59/);
  assert.doesNotMatch(transcript, /Question 0 /);
});

/**
 * Runs the assistant on Chrome's built-in AI (the Prompt API, Gemini Nano), so a visitor
 * can try the concierge with no key and no account. Nothing they type leaves the device.
 *
 * The agent runtime talks to any OpenAI-compatible /chat/completions router. This module
 * answers requests to OnDeviceAI.ROUTER inside the page: it turns the request's messages
 * and tools into one Prompt API call, constrains the reply to JSON that is either an
 * answer or one tool call with valid arguments, and sends that back as the stream the
 * runtime expects. Agents, site actions and partner calls work unchanged.
 *
 * Visitors who add their own key in the settings use their own provider instead.
 */
export class OnDeviceAI {
  /** A router address that never resolves (.invalid is reserved), answered in the page. */
  static ROUTER = "https://on-device.invalid/v1";

  static MODEL = "chrome-built-in-ai";

  /** The runtime needs some key to send a request. This one never leaves the page. */
  static KEY = "on-device-no-key";

  /** Characters of transcript to keep, newest first. Nano's context is small. */
  static TRANSCRIPT_BUDGET = 12000;

  /** Tool results in one visitor turn before the model must answer. */
  static MAX_TOOL_RESULTS = 2;

  /** The longest one step may take before the model is stopped. */
  static STEP_MS = 120000;

  static LANGUAGES = [{ type: "text", languages: ["en"] }];

  /** Tools a small model handles badly. The answer is plain text instead. */
  static SKIPPED_TOOLS = new Set(["render_cruse"]);

  /** One prepared session per system prompt, cloned for each request. */
  static baseSessions = new Map();

  /** The model's latest replies, newest last. */
  static recent = [];

  /** The raw output of the latest steps, newest last. */
  static steps = [];

  /** The browser's fetch, kept when the router is installed. */
  static realFetch = null;

  /**
   * Say whether this browser can run the built-in model.
   *
   * :return: "available", "downloadable", "downloading" or "unavailable"
   */
  static async availability() {
    const model = globalThis.LanguageModel;
    if (!model) return "unavailable";
    try {
      // Some browsers never answer this. The page must not wait on it.
      const answer = model.availability({
        expectedInputs: OnDeviceAI.LANGUAGES,
        expectedOutputs: OnDeviceAI.LANGUAGES,
      });
      const timeout = new Promise((resolve) => setTimeout(resolve, 3000, "unavailable"));
      return await Promise.race([answer, timeout]);
    } catch {
      return "unavailable";
    }
  }

  /**
   * Download the model. Chrome allows this only after a click.
   *
   * :param onProgress: called with a number from 0 to 1
   */
  static async download(onProgress) {
    const session = await globalThis.LanguageModel.create({
      expectedInputs: OnDeviceAI.LANGUAGES,
      expectedOutputs: OnDeviceAI.LANGUAGES,
      monitor(monitor) {
        monitor.addEventListener("downloadprogress", (event) => onProgress(event.loaded));
      },
    });
    session.destroy();
  }

  /** Answer requests to ROUTER in the page. Every other request goes out as usual. */
  static install() {
    if (OnDeviceAI.realFetch) return;
    OnDeviceAI.realFetch = globalThis.fetch.bind(globalThis);
    globalThis.fetch = OnDeviceAI.fetch;
  }

  /**
   * The patched fetch.
   *
   * :param input: a URL, string or Request
   * :param init: the request options
   * :return: the response
   */
  static async fetch(input, init = {}) {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const routerOrigin = new URL(OnDeviceAI.ROUTER).origin;
    if (!url.startsWith(routerOrigin)) {
      return OnDeviceAI.realFetch(input, init);
    }
    if (url === `${OnDeviceAI.ROUTER}/chat/completions`) {
      const body = typeof init.body === "string" ? init.body : await new Request(input, init).text();
      try {
        return await OnDeviceAI.complete(JSON.parse(body), init.signal);
      } catch (error) {
        if (error && error.name === "AbortError") throw error;
        const message = `Chrome's built-in AI could not answer: ${error && error.message ? error.message : error}`;
        return new Response(JSON.stringify({ error: { message: message } }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }
    if (url === `${OnDeviceAI.ROUTER}/models`) {
      return Response.json({ object: "list", data: [{ id: OnDeviceAI.MODEL, object: "model" }] });
    }
    // The runtime looks for a manifest at a router's origin. There is none here.
    return new Response("Not found", { status: 404 });
  }

  /**
   * Run one chat completion on the device.
   *
   * :param request: the OpenAI-style request body
   * :param signal: aborts the call when the visitor stops the turn
   * :return: an OpenAI-style event stream
   */
  static async complete(request, signal) {
    const tools = (request.tools || []).filter((tool) => !OnDeviceAI.SKIPPED_TOOLS.has(OnDeviceAI.toolOf(tool).name));
    const { system, transcript } = OnDeviceAI.prompt(request.messages || [], tools);
    const base = await OnDeviceAI.baseSession(system, signal);
    // A new visitor message must start with a tool call: a small model otherwise
    // answers from memory. Site tools are read first, so the answer is grounded.
    const last = (request.messages || []).at(-1);
    const siteTools = tools.some((tool) => OnDeviceAI.toolOf(tool).name.startsWith("website_"));
    const mustCall = Boolean(last && last.role === "user") && siteTools;
    // Small steps, each with a short, capped output: a small model given one large
    // schema can write without end and hold the device's model for every tab. Each step
    // runs in its own copy of the base session: Chrome fails a second constrained
    // prompt in one session.
    // A small model can keep calling tools. After MAX_TOOL_RESULTS results in this turn,
    // it answers from what it has.
    const messages = request.messages || [];
    const turnStart = messages.map((message) => message.role).lastIndexOf("user");
    const results = messages.slice(turnStart + 1).filter((message) => message.role === "tool").length;
    // Each partner at most once per visitor message, as the partner rules say. When this
    // network runs for another site (no website_* tools), it answers directly: a small
    // model that asks its own partners in turn only adds cards and waiting.
    const called = new Set();
    for (const message of messages.slice(turnStart + 1)) {
      for (const call of message.tool_calls || []) called.add(call.function.name);
    }
    // A small model also tends to chain partners, so after one partner call in this
    // turn, only the site's own tools stay on offer.
    const askedPartner = [...called].some((name) => !name.startsWith("website_"));
    const allowed = siteTools
      ? tools.map((tool) => OnDeviceAI.toolOf(tool).name).filter((name) => name.startsWith("website_") || !askedPartner)
      : [];
    // A new visitor message starts with the site's own tools: the page's data says which
    // partner fits, and gives the link to pass on. Partners come after that read.
    const firstStep = mustCall ? allowed.filter((name) => name.startsWith("website_")) : allowed;
    const names = results >= OnDeviceAI.MAX_TOOL_RESULTS ? [] : firstStep;
    const choices = mustCall && names.length ? names : names.length ? [...names, "answer"] : [];
    let reply = null;
    if (choices.length) {
      const stepOne = {
        type: "object",
        additionalProperties: false,
        properties: { next: { type: "string", enum: choices } },
        required: ["next"],
      };
      const choose = `${transcript}\n\nStep 1: choose the next step.`;
      let next = (OnDeviceAI.json(await OnDeviceAI.step(base, choose, stepOne, 600, signal)) || {}).next;
      if (!choices.includes(next)) {
        next = (OnDeviceAI.json(await OnDeviceAI.step(base, `${choose} Reply with {"next": one of ${choices.join(", ")}}.`, stepOne, 600, signal)) || {}).next;
      }
      if (names.includes(next)) {
        reply = await OnDeviceAI.callArguments(base, transcript, OnDeviceAI.toolOf(tools[names.indexOf(next)]), signal);
      }
    }
    if (!reply) {
      let text = OnDeviceAI.tidy(await OnDeviceAI.step(base, `${transcript}\n\nWrite your reply to the visitor now: say what the tool results show was done or found, in two or three plain sentences. Do not mention tool names, and give only links that a tool result contains.`, null, 1500, signal));
      if (!siteTools) {
        // Answering for another site with no tool results: any link would be made up.
        text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/\s*\(?https?:\/\/\S+\)?/g, "");
      }
      reply = { kind: "answer", text: text || "Sorry, I couldn't work that out. Could you ask another way?" };
    }
    // The last few replies, for checking what the model did (console: OnDeviceAI.recent).
    OnDeviceAI.recent.push(reply);
    if (OnDeviceAI.recent.length > 20) OnDeviceAI.recent.shift();
    return OnDeviceAI.stream(reply);
  }

  /**
   * Write the arguments for the chosen tool: constrained to its schema, or, when Chrome
   * cannot apply that schema, as plain text with the schema written out.
   *
   * :param base: the base session
   * :param transcript: the conversation
   * :param fn: the chosen tool's function definition
   * :param signal: the visitor's abort signal
   * :return: {kind: "tool", tool, arguments}, or null when no usable call came back
   */
  static async callArguments(base, transcript, fn, signal) {
    // A tool that takes no arguments needs no step: Chrome's model tends to fill an empty
    // object with blank lines until the length limit.
    if (!fn.parameters || !Object.keys(fn.parameters.properties || {}).length) {
      return { kind: "tool", tool: fn.name, arguments: {} };
    }
    const schema = fn.parameters && fn.parameters.type === "object"
      ? OnDeviceAI.capped(OnDeviceAI.bare(fn.parameters))
      : { type: "object", properties: {} };
    const ask = `${transcript}\n\nStep 2: you call ${fn.name}. Give its arguments as JSON, using only what the visitor and the tool results said.`;
    let raw = "";
    try {
      raw = await OnDeviceAI.step(base, ask, schema, 2500, signal);
    } catch (error) {
      if (signal && signal.aborted) throw error;
      OnDeviceAI.steps.push(`[constrained arguments failed: ${error.message}]`);
      raw = await OnDeviceAI.step(base, `${ask} Reply with only one JSON object that fits this schema:\n${JSON.stringify(schema)}`, null, 2500, signal);
    }
    const args = OnDeviceAI.withoutNulls(OnDeviceAI.json(raw));
    // Arguments missing a required field (or a copy of step 1) are no call at all.
    const required = (fn.parameters && fn.parameters.required) || [];
    const known = (fn.parameters && fn.parameters.properties) || {};
    const usable = Boolean(args) && required.every((key) => args[key] !== undefined) && !("next" in args && !("next" in known));
    return usable ? { kind: "tool", tool: fn.name, arguments: args } : null;
  }

  /**
   * Run one step in a fresh copy of the base session.
   *
   * :param base: the base session
   * :param text: the prompt
   * :param schema: a JSON schema, or null for plain text
   * :param limit: the most characters to accept
   * :param signal: the visitor's abort signal
   * :return: the output
   */
  static async step(base, text, schema, limit, signal) {
    const session = await base.clone({ signal: signal });
    try {
      return await OnDeviceAI.ask(session, text, schema, limit, signal);
    } finally {
      session.destroy();
    }
  }

  /**
   * Drop null values, which small models write for "not given" and schemas refuse.
   *
   * :param value: parsed JSON
   * :return: the same data without nulls
   */
  static withoutNulls(value) {
    if (Array.isArray(value)) return value.filter((item) => item !== null).map(OnDeviceAI.withoutNulls);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== null).map(([key, item]) => [key, OnDeviceAI.withoutNulls(item)]));
  }

  /**
   * Prompt the session and stop the model once its output passes a length or time limit.
   *
   * :param session: the Prompt API session
   * :param text: the prompt
   * :param schema: a JSON schema the output must follow, or null for plain text
   * :param limit: the most characters to accept
   * :param signal: the visitor's abort signal
   * :return: the output, cut at the limit
   */
  static async ask(session, text, schema, limit, signal) {
    const stop = new AbortController();
    const abort = () => stop.abort();
    if (signal) signal.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, OnDeviceAI.STEP_MS);
    let output = "";
    try {
      const options = { signal: stop.signal };
      if (schema) options.responseConstraint = schema;
      for await (const piece of session.promptStreaming(text, options)) {
        output += piece;
        // A long run of blank space means the model is stuck padding: stop it.
        if (output.length >= limit || /\s{60,}$/.test(output)) {
          stop.abort();
          break;
        }
      }
    } catch (error) {
      // The visitor stopped the turn: pass that on. A cap that fired keeps the output.
      if (signal && signal.aborted) throw error;
      if (!stop.signal.aborted) throw error;
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener("abort", abort);
    }
    // The raw output of the last few steps, for checking (console: OnDeviceAI.steps).
    OnDeviceAI.steps.push(output.slice(0, 300));
    if (OnDeviceAI.steps.length > 30) OnDeviceAI.steps.shift();
    return output.slice(0, limit);
  }

  /**
   * Read JSON output, or null when it is cut off or malformed.
   *
   * :param raw: the output
   * :return: the object, or null
   */
  static json(raw) {
    const text = String(raw).trim().replace(/^```(?:json)?/i, "").replace(/```$/, "");
    // The whole text, or else the first complete {...} in it (plain-text replies may
    // add words around the JSON).
    const candidates = [text];
    const start = text.indexOf("{");
    if (start >= 0) {
      let depth = 0;
      let quoted = false;
      for (let index = start; index < text.length; index += 1) {
        const char = text[index];
        if (quoted) {
          if (char === "\\") index += 1;
          else if (char === '"') quoted = false;
        } else if (char === '"') {
          quoted = true;
        } else if (char === "{") {
          depth += 1;
        } else if (char === "}" && --depth === 0) {
          candidates.push(text.slice(start, index + 1));
          break;
        }
      }
    }
    for (const candidate of candidates) {
      try {
        const value = JSON.parse(candidate);
        if (value && typeof value === "object" && !Array.isArray(value)) return value;
      } catch {
        // Try the next candidate.
      }
    }
    return null;
  }

  /**
   * Give every string a length limit and every list an item limit, so the model's
   * arguments stay short even where the tool's own schema sets none.
   *
   * :param schema: a bare JSON schema
   * :return: the same schema, capped
   */
  static capped(schema) {
    if (!schema || typeof schema !== "object") return schema;
    const copy = { ...schema };
    if (copy.type === "string" && !copy.enum && copy.maxLength === undefined) copy.maxLength = 300;
    if (copy.type === "array" && copy.maxItems === undefined) copy.maxItems = 8;
    if (copy.properties) {
      copy.properties = Object.fromEntries(Object.entries(copy.properties).map(([name, inner]) => [name, OnDeviceAI.capped(inner)]));
    }
    if (copy.items) copy.items = OnDeviceAI.capped(copy.items);
    return copy;
  }

  /**
   * Return a session that holds the system prompt, creating it the first time.
   *
   * :param system: the system prompt
   * :param signal: the abort signal
   * :return: the base session, never prompted itself
   */
  static async baseSession(system, signal) {
    let base = OnDeviceAI.baseSessions.get(system);
    if (!base) {
      base = await globalThis.LanguageModel.create({
        initialPrompts: [{ role: "system", content: system }],
        expectedInputs: OnDeviceAI.LANGUAGES,
        expectedOutputs: OnDeviceAI.LANGUAGES,
        signal: signal,
      });
      // Keep a few: the concierge and each partner agent have their own prompt.
      if (OnDeviceAI.baseSessions.size >= 4) {
        const [oldest] = OnDeviceAI.baseSessions.keys();
        OnDeviceAI.baseSessions.get(oldest).destroy();
        OnDeviceAI.baseSessions.delete(oldest);
      }
      OnDeviceAI.baseSessions.set(system, base);
    }
    return base;
  }

  /**
   * Turn the request into a system prompt and a transcript.
   *
   * :param messages: OpenAI-style messages
   * :param tools: the tools the model may call
   * :return: {system, transcript}
   */
  static prompt(messages, tools) {
    const system = [];
    const rest = [];
    for (const message of messages) {
      if (message.role === "system") system.push(OnDeviceAI.text(message.content));
      else rest.push(message);
    }
    if (tools.length) {
      system.push([
        "HOW TO REPLY: you work in steps. Step 1: choose the next step, a tool to call or \"answer\". Step 2: give that tool's arguments as JSON, or write your answer.",
        "Call one tool at a time. You then see its result and choose again. When the visitor asked for an action, such as filling in a form, call the tool that does it before you answer.",
        "Write answers in short, plain sentences. Use Markdown lists only when they help.",
        "Read facts with a tool before you state them. Never make up a tool result, and never say you did something no tool result shows.",
        "Answer only what the visitor asked, and give every detail the tool result has for it, such as when to arrive.",
        "TOOLS:",
        ...tools.map(OnDeviceAI.describeTool),
      ].join("\n"));
    } else {
      system.push("HOW TO REPLY: write your answer in short, plain sentences.");
    }
    // Keep the newest turns that fit. The first visitor message stays too.
    const lines = [];
    let used = 0;
    for (let index = rest.length - 1; index >= 0; index -= 1) {
      const line = OnDeviceAI.line(rest[index]);
      if (lines.length && used + line.length > OnDeviceAI.TRANSCRIPT_BUDGET) break;
      lines.unshift(line);
      used += line.length;
    }
    return { system: system.join("\n\n"), transcript: lines.join("\n\n") };
  }

  /**
   * Write one tool for the system prompt: its name, what it does and its arguments.
   *
   * :param tool: an OpenAI-style tool
   * :return: one line
   */
  static describeTool(tool) {
    const fn = OnDeviceAI.toolOf(tool);
    const props = (fn.parameters && fn.parameters.properties) || {};
    const required = new Set((fn.parameters && fn.parameters.required) || []);
    const args = Object.entries(props).map(([name, schema]) => {
      let type = schema.type || "value";
      if (schema.enum) type = schema.enum.join("|");
      if (schema.type === "array" && schema.items && schema.items.enum) type = `list of ${schema.items.enum.join("|")}`;
      if (schema.type === "array" && schema.items && schema.items.properties) type = `list of {${Object.keys(schema.items.properties).join(", ")}}`;
      return `${name}${required.has(name) ? "" : "?"}: ${type}`;
    });
    return `- ${fn.name}(${args.join("; ")}): ${OnDeviceAI.clip(fn.description || "", 400)}`;
  }

  /**
   * Write one message of the transcript.
   *
   * :param message: an OpenAI-style message
   * :return: one block of text
   */
  static line(message) {
    if (message.role === "user") return `VISITOR: ${OnDeviceAI.text(message.content)}`;
    if (message.role === "tool") return `TOOL RESULT: ${OnDeviceAI.clip(OnDeviceAI.text(message.content), 6000)}`;
    if (message.role === "assistant") {
      const calls = (message.tool_calls || []).map((call) => `${call.function.name}(${OnDeviceAI.clip(call.function.arguments, 500)})`);
      const said = OnDeviceAI.text(message.content);
      return `YOU: ${said}${calls.length ? ` [called ${calls.join(", ")}]` : ""}`;
    }
    return `${String(message.role).toUpperCase()}: ${OnDeviceAI.text(message.content)}`;
  }

  /**
   * Copy a schema without descriptions and other words that do not constrain the JSON.
   *
   * :param schema: a JSON schema
   * :return: the smaller schema
   */
  static bare(schema) {
    if (Array.isArray(schema)) return schema.map(OnDeviceAI.bare);
    if (!schema || typeof schema !== "object") return schema;
    const copy = {};
    for (const [key, value] of Object.entries(schema)) {
      if (key === "description" || key === "title" || key === "x-ui" || key === "format") continue;
      copy[key] = key === "properties"
        ? Object.fromEntries(Object.entries(value).map(([name, inner]) => [name, OnDeviceAI.bare(inner)]))
        : OnDeviceAI.bare(value);
    }
    return copy;
  }

  /**
   * Send a reply back as the event stream the runtime reads.
   *
   * :param reply: the parsed reply
   * :return: a streaming Response
   */
  static stream(reply) {
    const id = `ondevice-${Date.now().toString(36)}`;
    const chunk = (delta, finish = null) => ({
      id: id,
      object: "chat.completion.chunk",
      created: Math.floor(Date.now() / 1000),
      model: OnDeviceAI.MODEL,
      choices: [{ index: 0, delta: delta, finish_reason: finish }],
    });
    const chunks = [];
    if (reply.kind === "tool") {
      chunks.push(chunk({
        role: "assistant",
        content: null,
        tool_calls: [{
          index: 0,
          id: `call_${id}`,
          type: "function",
          function: { name: reply.tool, arguments: JSON.stringify(reply.arguments) },
        }],
      }));
      chunks.push(chunk({}, "tool_calls"));
    } else {
      chunks.push(chunk({ role: "assistant" }));
      // A few words at a time, so the chat fills in like any other model's.
      const words = reply.text.split(/(\s+)/);
      for (let start = 0; start < words.length; start += 12) {
        chunks.push(chunk({ content: words.slice(start, start + 12).join("") }));
      }
      chunks.push(chunk({}, "stop"));
    }
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      start(controller) {
        for (const item of chunks) controller.enqueue(encoder.encode(`data: ${JSON.stringify(item)}\n\n`));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });
    return new Response(body, {
      status: 200,
      headers: { "Content-Type": "text/event-stream", "X-Nsdeploy-LLM-Route": "chrome-built-in-ai" },
    });
  }

  /**
   * Clean up a small model's answer: real line breaks, and nothing after stray markup.
   *
   * :param text: the answer
   * :return: the cleaned answer
   */
  static tidy(text) {
    let value = String(text || "").replace(/\\n/g, "\n");
    // A small model sometimes writes a tool name as a link or a placeholder.
    value = value.replace(/\[?\bwebsite_[a-z_]+\b(?: link)?\]?/gi, "");
    // ...and placeholders such as "[the hosts' email]": square brackets that are not a link.
    value = value.replace(/\s*\[[^\]\n]{1,60}\](?!\()/g, "").replace(/[ \t]+([.,!?])/g, "$1");
    const junk = value.search(/<\/?(div|body|html|table|span|p)\b|\/>|\}>/i);
    if (junk >= 0) value = value.slice(0, junk);
    return value.trim();
  }

  static toolOf(tool) {
    return tool.function || tool;
  }

  static text(content) {
    if (content == null) return "";
    if (typeof content === "string") return content;
    if (Array.isArray(content)) return content.map((part) => (typeof part === "string" ? part : part.text || "")).join("");
    return String(content);
  }

  static clip(text, limit) {
    const value = String(text || "");
    return value.length > limit ? `${value.slice(0, limit)} …` : value;
  }
}

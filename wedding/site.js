// Mounts the assistant inside the existing page. Load it with:
//   <script type="module" src="site.js"></script>
// The page needs the mount markup from assistant-section.html.
// reviewDetails() below reads the running page, imported by the URL index.html uses.
import { App } from "./js/app.js";
import { EventData } from "./js/event-data.js";
import { OnDeviceAI } from "./js/on-device-ai.js";

/**
 * Boots the browser runtime in the page's assistant section.
 *
 * It points the runtime at this folder, so the manifest, network and actions load from
 * the same place as the page. Before each irreversible action, it shows its own
 * confirmation dialog, written for the visitor.
 */
export class AssistantMount {
  /**
   * The first chat message once the visitor has a key: what the assistant can do here.
   */
  static GREETING = AssistantMount.greeting();

  /**
   * The confirmation dialog's words for each irreversible action. Name each button after
   * what it does, so that "Cancel" never has two meanings. With no irreversible action,
   * leave this empty.
   */
  static DIALOGS = {
    "send_rsvp": {
      title: `Send this RSVP to ${EventData.HOSTS_PLAIN}?`,
      sentence: `We will send the answers below to ${EventData.HOSTS_PLAIN}. You can change them on this page until the RSVP deadline.`,
      confirm: "Send RSVP",
      decline: "Don't send",
    },
  };

  /**
   * Write the first chat message from event.json: what the concierge can do, and which
   * partner sites it can ask.
   *
   * :return: The greeting.
   */
  static greeting() {
    const names = EventData.PARTNERS.map((partner) => partner.name);
    let partners = "";
    if (names.length === 1) partners = names[0];
    if (names.length > 1) partners = `${names.slice(0, -1).join(", ")} or ${names.at(-1)}`;
    const ask = partners ? `, and, if you agree, ask ${partners} for you` : "";
    return `Hi! I can answer questions about ${EventData.HOSTS_PLAIN}'s ${EventData.EVENT.kind || "event"}, fill in or send your RSVP${ask}.`;
  }

  /**
   * Boot the runtime and report the result in the status line.
   *
   * :return: The runtime engine, or null when boot failed.
   */
  static async start() {
    const status = document.querySelector("#assistant-status");
    const siteBase = new URL("./", import.meta.url).href;
    try {
      // Load the runtime here, so a missing or broken runtime is reported too.
      const { boot } = await import("./runtime/index.js");
      const onDevice = await AssistantMount.chooseOnDevice();
      const booted = await boot("#agent-app", {
        originUrl: siteBase,
        sandboxWorkerUrl: new URL("runtime/sandbox-worker.js", siteBase).href,
        ...onDevice,
      });
      AssistantMount.engine = booted.engine;
      AssistantMount.defaultReview = booted.engine.onActionConfirm;
      booted.engine.onActionConfirm = AssistantMount.review;
      AssistantMount.defaultConsent = booted.engine.onConsent;
      booted.engine.onConsent = AssistantMount.consent;
      // Without a key the chat cannot answer yet. This is the same test as the
      // runtime's "API key required" badge in runtime/ui.js.
      const needsKey = !booted.engine.mockLLM
        && (!booted.engine.byokKey || booted.engine.byokKey === "demo");
      if (onDevice.router) {
        status.textContent = "Running on Chrome's built-in AI, on your device: no key needed, and nothing you type leaves your computer. It is slower than a cloud model. For faster answers, add your own key in AI model settings below.";
      } else {
        status.textContent = needsKey
          ? "Assistant needs your AI provider key. Add it in AI model settings below."
          : "Assistant connected to this page.";
      }
      if (!needsKey) {
        AssistantMount.greet();
      }
      return booted.engine;
    } catch (error) {
      // The page must keep working without the assistant.
      status.textContent = "The assistant could not load. You can still use the page directly.";
      console.error("Assistant startup failed", error);
      return null;
    }
  }

  /**
   * Choose Chrome's built-in AI when the visitor has not set up their own key, so the
   * concierge works with no key. When the model is not downloaded yet, offer a button
   * that downloads it (Chrome allows that only after a click), then reloads the page.
   *
   * :return: The router, model and key to boot with, or {} for the visitor's own setup.
   */
  static async chooseOnDevice() {
    const { loadTabByokSetup } = await import("./runtime/byok.js");
    if (loadTabByokSetup().key) {
      return {};
    }
    const bar = document.querySelector("#ondevice");
    const state = await OnDeviceAI.availability();
    if (state === "available") {
      OnDeviceAI.install();
      OnDeviceAI.setPartnerHints(AssistantMount.partnerHints());
      return { router: OnDeviceAI.ROUTER, model: OnDeviceAI.MODEL, byokKey: OnDeviceAI.KEY };
    }
    if (state === "downloadable" || state === "downloading") {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Try it with no key: use Chrome's built-in AI";
      button.addEventListener("click", AssistantMount.downloadOnDevice.bind(null, button));
      const note = document.createElement("span");
      note.textContent = " One-time download by Chrome. Runs on your device.";
      bar.replaceChildren(button, note);
      bar.hidden = false;
    }
    return {};
  }

  /**
   * The words that make each partner relevant, from event.json: its keywords, or else
   * the words of its topic. The on-device model is offered a partner only then.
   *
   * :return: Partner tool name to a list of words.
   */
  static partnerHints() {
    const hints = {};
    for (const partner of EventData.PARTNERS) {
      const tool = new URL(partner.network).pathname.replace(/^\/+|\/+$/g, "").replace(/[^A-Za-z0-9_]+/g, "_");
      hints[tool] = partner.keywords || String(partner.topic || "").split(/\W+/).filter((word) => word.length > 3);
    }
    return hints;
  }

  /**
   * Download Chrome's built-in model, showing progress on the button, then reload.
   *
   * :param button: The button the visitor pressed.
   */
  static async downloadOnDevice(button) {
    button.disabled = true;
    try {
      await OnDeviceAI.download((share) => {
        button.textContent = `Downloading Chrome's built-in AI… ${Math.round(share * 100)}%`;
      });
      button.textContent = "Ready. Starting the concierge…";
      location.reload();
    } catch (error) {
      button.disabled = false;
      button.textContent = "The download did not finish. Try again";
      console.error("Built-in AI download failed", error);
    }
  }

  /**
   * Replace the runtime's general first chat message with GREETING. "New chat" keeps the
   * first message, so the greeting stays for the whole visit.
   */
  static greet() {
    const first = document.querySelector("#ns-msgs .ns-msg.bot");
    if (first) {
      first.textContent = AssistantMount.GREETING;
    }
  }

  /**
   * Ask the visitor to confirm actions before they run. One of this page's actions listed
   * in DIALOGS gets this page's dialog. Anything else, such as a partner site's action,
   * gets the runtime's own dialog.
   *
   * :param items: The actions waiting for confirmation, each with action, origin, effect
   *   and arguments.
   * :return: True when the visitor confirms.
   * :raises Error: The site's reason, when its own check refuses the action, or when a
   *   chat form bundles one of this page's DIALOGS actions with other actions.
   */
  static async review(items) {
    let confirmed = false;
    const pageOrigin = new URL(document.URL).origin;
    // This page's dialog shows one action with its details and runs the site's own check.
    // A chat form that bundles such an action with others would skip both, so nothing
    // runs.
    if (items.length > 1) {
      for (const item of items) {
        if (item.origin === pageOrigin && Object.hasOwn(AssistantMount.DIALOGS, item.action)) {
          throw new Error(`Nothing ran. "${AssistantMount.DIALOGS[item.action].confirm}" needs its own confirmation, so ask the assistant to do that on its own.`);
        }
      }
    }
    // A partner's action can have the same name as one of this page's. It gets the
    // runtime's dialog, which names the partner's origin, and this page's check never runs.
    const own = items.length === 1 && items[0].origin === pageOrigin;
    if (own && Object.hasOwn(AssistantMount.DIALOGS, items[0].action)) {
      const content = AssistantMount.dialogContent(items[0]);
      if (content.refusal) {
        // A dialog would offer a button that cannot work. The runtime runs nothing
        // and gives the agent this reason as an "Error from tool" message.
        throw new Error(content.refusal);
      }
      confirmed = await new Promise(AssistantMount.openDialog.bind(null, content));
    } else {
      confirmed = await AssistantMount.defaultReview(items);
    }
    AssistantMount.keepFocusInChat();
    return confirmed;
  }

  /**
   * Ask the visitor, with the runtime's consent card, whether to contact a partner site.
   * Focus the card while it waits, then put focus back in the chat.
   *
   * :param info: What the card shows, such as the partner's label and host and the request.
   * :return: The card's answer, unchanged: "allow", "always" or "decline". The runtime
   *   allows the call when this returns nothing.
   */
  static async consent(info) {
    // defaultConsent() adds the card at once. The card has no role, and the stylesheet
    // hides the status line while it waits, so name the card and focus its title.
    const answer = AssistantMount.defaultConsent(info);
    AssistantMount.focusConsentCard();
    const decision = await answer;
    // Answering the card removes its buttons, so focus may fall to the page body.
    AssistantMount.keepFocusInChat();
    return decision;
  }

  /**
   * Name the newest consent card after its title, for screen readers. Move focus to that
   * title when focus is in the chat or on the page body, not from the page's own form.
   */
  static focusConsentCard() {
    const cards = document.querySelectorAll("#ns-msgs .ns-consent");
    const card = cards[cards.length - 1];
    const title = card ? card.querySelector(".ns-consent-title") : null;
    if (!title) {
      return;
    }
    card.setAttribute("role", "group");
    card.setAttribute("aria-label", title.textContent);
    // A visitor typing in the page's own form keeps focus, and their keystrokes.
    const active = document.activeElement;
    if (active && active !== document.body && !active.closest("#agent-app")) {
      return;
    }
    // tabIndex -1 lets the title take focus. Enter cannot activate a title, so a stray
    // Enter answers nothing.
    title.tabIndex = -1;
    title.focus();
  }

  /**
   * Work out what the dialog says for one action: its words from DIALOGS, the readable
   * details and the exact call. This is plain data, so tests can check it.
   *
   * :param item: An action waiting for confirmation, with action, origin, effect and
   *   arguments.
   * :return: The title, sentence, button labels, details, exact call text and the
   *   site's refusal, if any.
   */
  static dialogContent(item) {
    let details = {};
    try {
      details = AssistantMount.reviewDetails(item.action, item.arguments) || {};
    } catch (error) {
      // The dialog then opens the exact call, and the visitor decides.
      console.error("Could not add details to the confirmation dialog", error);
    }
    return {
      ...AssistantMount.DIALOGS[item.action],
      details: details,
      refusal: details.refusal,
      exact: `${item.action} on ${item.origin} (${item.effect})\n${JSON.stringify(item.arguments, null, 2)}`,
    };
  }

  /**
   * Give the readable details of one irreversible action, such as items, total, name,
   * email and what undoing it would cost, from the page's own read-only operations, so
   * no rule is copied here. When the operation's own check refuses the call, return
   * {refusal: reason}, and review() opens no dialog.
   *
   * :param action: The action name.
   * :param args: The action's arguments.
   * :return: Details by label, {refusal: reason}, or {} when the action has none.
   */
  static reviewDetails(action, args) {
    if (action !== "send_rsvp") {
      return {};
    }
    const check = App.page.checkRsvp(args);
    if (!check.ok) {
      return { refusal: check.reason };
    }
    const rsvp = check.rsvp;
    const details = {};
    for (const guest of rsvp.guests) {
      details[guest.name] = guest.attending
        ? `Coming · ${AssistantMount.mealName(guest.meal)}`
        : "Not coming";
    }
    if (rsvp.plusOne) {
      details[`Guest: ${rsvp.plusOne.name}`] = `Coming · ${AssistantMount.mealName(rsvp.plusOne.meal)}`;
    }
    const events = rsvp.events.map((id) => EventData.EVENTS.find((event) => event.id === id).name);
    details["Also attending"] = events.length ? events.join(", ") : "None";
    details["Shuttle seats"] = rsvp.shuttle ? "Yes" : "No";
    if (rsvp.notes) {
      details["Notes"] = rsvp.notes;
    }
    if (check.earlier) {
      details["Earlier answer"] = `Sent on ${check.earlier.sentOn}. This replaces it.`;
    }
    return details;
  }

  /**
   * Name a dinner choice for the dialog.
   *
   * :param id: The meal id.
   * :return: The meal's name.
   */
  static mealName(id) {
    const meal = EventData.MEALS.find((item) => item.id === id);
    return meal ? meal.name : id;
  }

  /**
   * Open the confirmation dialog: a question, a plain sentence, the readable details,
   * the exact call under "Technical details", and two buttons.
   *
   * :param content: What the dialog says, from dialogContent().
   * :param resolve: Receives true when the visitor confirms, and false otherwise.
   */
  static openDialog(content, resolve) {
    const dialog = document.createElement("dialog");
    dialog.className = "assistant-review";
    dialog.setAttribute("aria-labelledby", "assistant-review-title");
    const heading = document.createElement("h2");
    heading.id = "assistant-review-title";
    heading.textContent = content.title;
    // Start on the heading, which Enter cannot activate, so a stray Enter confirms nothing.
    heading.tabIndex = -1;
    heading.autofocus = true;
    const sentence = document.createElement("p");
    sentence.textContent = content.sentence;
    dialog.append(heading, sentence);
    const exact = document.createElement("details");
    const exactLabel = document.createElement("summary");
    exactLabel.textContent = "Technical details";
    const exactText = document.createElement("pre");
    exactText.textContent = content.exact;
    exact.append(exactLabel, exactText);
    const entries = Object.entries(content.details);
    if (entries.length) {
      const list = document.createElement("dl");
      for (const [label, value] of entries) {
        const term = document.createElement("dt");
        term.textContent = label;
        const description = document.createElement("dd");
        description.textContent = String(value);
        list.append(term, description);
      }
      dialog.append(list);
    } else {
      // Without readable details, open the exact call, so the visitor still sees it.
      exact.open = true;
    }
    const confirmButton = document.createElement("button");
    confirmButton.textContent = content.confirm;
    confirmButton.addEventListener("click", dialog.close.bind(dialog, "confirm"));
    const declineButton = document.createElement("button");
    declineButton.className = "assistant-decline";
    declineButton.textContent = content.decline;
    declineButton.addEventListener("click", dialog.close.bind(dialog, "decline"));
    // Escape also closes the dialog, without "confirm".
    dialog.addEventListener("close", AssistantMount.finishDialog.bind(null, dialog, resolve));
    dialog.append(exact, confirmButton, declineButton);
    document.body.append(dialog);
    dialog.showModal();
  }

  /**
   * Remove the closed dialog and report the visitor's choice.
   *
   * :param dialog: The dialog that just closed.
   * :param resolve: Receives true when the visitor pressed the confirm button.
   */
  static finishDialog(dialog, resolve) {
    dialog.remove();
    resolve(dialog.returnValue === "confirm");
  }

  /**
   * Put focus back in the chat input when a dialog or the consent card left it on the
   * page body. A chat form disables its controls when it is sent, so focus can fall to
   * the body, and the next Tab would start at the top of the page.
   */
  static keepFocusInChat() {
    if (document.activeElement === document.body || document.activeElement === null) {
      document.querySelector("#ns-input")?.focus();
    }
  }
}

// Boot only in a browser. Node tests import this file to check the dialog's words.
if (typeof window !== "undefined") {
  await AssistantMount.start();
}

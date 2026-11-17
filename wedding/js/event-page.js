import { Calendar } from "./calendar.js";
import { RsvpBook } from "./rsvp-book.js";
import { EventData } from "./event-data.js";

/**
 * The event page: it renders everything from event.json (through EventData) and runs the
 * RSVP form.
 *
 * Each operation here serves both the page's own forms and the assistant's actions, so a
 * guest gets the same rules and the same messages either way.
 */
export class EventPage {
  /**
   * :param doc: the page's document
   * :param book: the RsvpBook that holds invitations and answers
   */
  constructor(doc, book) {
    this.doc = doc;
    this.book = book;
    /** The invitation loaded in the RSVP form, or null. */
    this.loaded = null;
    /** The latest RSVP sent from this tab, or null. */
    this.latest = null;
    /** Each invited guest's controls in the form: {yes, no, meal}. */
    this.guestControls = [];
    /** The optional events' checkboxes in the form. */
    this.eventBoxes = [];
  }

  /** Render every section and connect the forms. */
  start() {
    this.renderHero();
    this.renderEvents();
    this.renderShuttle();
    this.renderTravel();
    this.renderPartners();
    this.renderFaq();
    this.byId("rsvp-deadline").textContent = this.book.isOpen()
      ? `Please reply by ${Calendar.long(EventData.RSVP_DEADLINE)}. Find your invitation with the code on your card and your last name.`
      : `RSVPs closed on ${Calendar.long(EventData.RSVP_DEADLINE)}. Please email ${EventData.CONTACT_EMAIL}.`;
    this.byId("find-form").addEventListener("submit", this.onFind.bind(this));
    this.byId("rsvp-form").addEventListener("submit", this.onSend.bind(this));
  }

  // ----- Reading -------------------------------------------------------------------------

  /**
   * Everything the page shows, plus the RSVP form and the latest RSVP sent in this tab.
   *
   * :return: plain data
   */
  readState() {
    const today = Calendar.today();
    return {
      today: today,
      hosts: EventData.HOSTS,
      kind: EventData.EVENT.kind,
      place: EventData.PLACE,
      date: EventData.DATE,
      daysUntil: Calendar.daysBetween(today, EventData.DATE),
      rsvpDeadline: EventData.RSVP_DEADLINE,
      rsvpOpen: this.book.isOpen(),
      events: EventData.EVENTS.map((event) => ({ ...event })),
      shuttle: EventData.SHUTTLE ? { ...EventData.SHUTTLE } : null,
      meals: EventData.MEALS.map((meal) => ({ ...meal })),
      faq: EventData.FAQ.map((item) => ({ question: item.question, answer: item.answer })),
      partners: EventData.PARTNERS.map((partner) => ({ name: partner.name, offers: partner.topic, url: partner.url, note: partner.note })),
      contactEmail: EventData.CONTACT_EMAIL,
      demoNote: this.text("demo-note"),
      rsvpForm: this.formState(),
      latestRsvp: this.latest ? structuredClone(this.latest) : null,
    };
  }

  /**
   * Find an invitation, as "Find my invitation" does, without changing the page.
   *
   * :param code: the invitation code
   * :param lastName: the last name on it
   * :return: {ok: true, invitation} or {ok: false, reason, field}
   */
  lookUpInvitation(code, lastName) {
    const invitation = this.book.find(code, lastName);
    if (!invitation) {
      return RsvpBook.refuse(RsvpBook.NOT_FOUND, "code");
    }
    return { ok: true, invitation: this.book.describe(invitation), rsvpOpen: this.book.isOpen() };
  }

  /**
   * Check an RSVP without sending it, for the confirmation dialog.
   *
   * :param rsvp: as for RsvpBook.check()
   * :return: the check's result, with the earlier answer when there is one
   */
  checkRsvp(rsvp) {
    const checked = this.book.check(rsvp);
    if (!checked.ok) return checked;
    const earlier = this.book.answers.get(checked.rsvp.code) || null;
    return { ...checked, earlier: earlier ? structuredClone(earlier) : null };
  }

  // ----- Writing -------------------------------------------------------------------------

  /**
   * Put an RSVP in the page's form for the guest to finish and send themselves. It may be
   * incomplete. Sends nothing.
   *
   * :param rsvp: as for RsvpBook.check()
   * :return: {ok: true, form} or {ok: false, reason, field}, changing nothing
   */
  fillRsvpForm(rsvp) {
    const checked = this.book.check(rsvp, true);
    if (!checked.ok) return checked;
    this.loadForm(checked.invitation, checked.rsvp);
    this.announce("The RSVP form is filled in. Check it and press Send RSVP.");
    return { ok: true, form: this.formState(), note: "Not sent yet. The guest can send it from the form, or ask to send it." };
  }

  /**
   * Send an RSVP, as the form's Send RSVP button does.
   *
   * :param rsvp: as for RsvpBook.check()
   * :return: {ok: true, receipt} or {ok: false, reason, field}, changing nothing
   */
  sendRsvp(rsvp) {
    const sent = this.book.send(rsvp);
    if (!sent.ok) return sent;
    this.latest = sent.receipt;
    const invitation = this.book.find(rsvp.code, rsvp.lastName);
    this.loadForm(invitation, sent.receipt);
    this.showConfirmation(sent.receipt);
    return sent;
  }

  // ----- Page events ---------------------------------------------------------------------

  onFind(event) {
    event.preventDefault();
    const error = this.byId("find-error");
    const found = this.book.find(this.byId("find-code").value, this.byId("find-lastName").value);
    if (!found) {
      error.textContent = this.lookUpInvitation("", "").reason;
      return;
    }
    error.textContent = "";
    this.loadForm(found, this.book.answers.get(found.code) || null);
    this.byId("rsvp-party").focus();
  }

  onSend(event) {
    event.preventDefault();
    const state = this.formState();
    const result = this.sendRsvp(state);
    this.byId("rsvp-error").textContent = result.ok ? "" : result.reason;
    // Only the page's own button moves focus, to the thank-you note.
    if (result.ok) this.byId("rsvp-confirmation").focus();
  }

  // ----- The RSVP form ---------------------------------------------------------------------

  /**
   * Show the RSVP form for an invitation, filled from an answer when one is given.
   *
   * :param invitation: an invitation from RsvpBook.INVITATIONS
   * :param answer: an RSVP to show, or null for a blank form
   */
  loadForm(invitation, answer) {
    this.loaded = invitation;
    const info = this.book.describe(invitation);
    const form = this.byId("rsvp-form");
    form.hidden = false;
    this.byId("find-code").value = invitation.code;
    this.byId("find-lastName").value = invitation.lastName;
    const party = this.byId("rsvp-party");
    party.textContent = `Invitation ${invitation.code} · ${RsvpBook.names(invitation)}`;
    party.tabIndex = -1;
    this.byId("rsvp-current").textContent = info.currentRsvp
      ? `You answered on ${Calendar.long(info.currentRsvp.sentOn)}. Sending again replaces that answer.`
      : "You haven't answered yet.";
    this.byId("rsvp-error").textContent = "";

    const guestBox = this.byId("rsvp-guests");
    guestBox.replaceChildren();
    this.guestControls = [];
    invitation.guests.forEach((guest, index) => {
      const given = answer ? answer.guests.find((item) => item.name === guest.name) : null;
      guestBox.append(this.guestFieldset(guest, index, given));
    });

    const plus = this.byId("rsvp-plusone");
    plus.hidden = !invitation.plusOne;
    this.fillMealSelect(this.byId("plusone-meal"), false, answer && answer.plusOne ? answer.plusOne.meal : null);
    this.byId("plusone-name").value = answer && answer.plusOne ? answer.plusOne.name : "";

    const boxes = this.byId("rsvp-event-boxes");
    boxes.replaceChildren();
    this.eventBoxes = [];
    for (const id of info.optionalEvents) {
      const event = EventData.eventById(id);
      const label = this.doc.createElement("label");
      label.className = "check";
      const box = this.doc.createElement("input");
      box.type = "checkbox";
      box.value = id;
      box.checked = Boolean(answer && answer.events.includes(id));
      this.eventBoxes.push(box);
      label.append(box, ` ${event.name} · ${Calendar.long(event.date).split(",")[0]} ${Calendar.time(event.start)}`);
      boxes.append(label);
    }
    this.byId("rsvp-shuttle").checked = Boolean(answer && answer.shuttle);
    this.byId("rsvp-notes").value = answer ? answer.notes || "" : "";
  }

  /**
   * Build one guest's yes/no and dinner choice.
   */
  guestFieldset(guest, index, given) {
    const set = this.doc.createElement("fieldset");
    set.className = "guest";
    set.dataset.name = guest.name;
    const legend = this.doc.createElement("legend");
    legend.textContent = guest.child ? `${guest.name} (child)` : guest.name;
    set.append(legend);
    const choices = this.doc.createElement("div");
    choices.className = "choices";
    const controls = {};
    for (const [value, text] of [["yes", "Joyfully accepts"], ["no", "Regretfully declines"]]) {
      const label = this.doc.createElement("label");
      label.className = "check";
      const radio = this.doc.createElement("input");
      radio.type = "radio";
      radio.name = `attending-${index}`;
      radio.value = value;
      radio.checked = Boolean(given) && given.attending === (value === "yes");
      controls[value] = radio;
      label.append(radio, ` ${text}`);
      choices.append(label);
    }
    set.append(choices);
    const mealLabel = this.doc.createElement("label");
    mealLabel.textContent = "Dinner";
    const select = this.doc.createElement("select");
    select.id = `meal-${index}`;
    mealLabel.htmlFor = select.id;
    this.fillMealSelect(select, guest.child, given ? given.meal : null);
    set.append(mealLabel, select);
    controls.meal = select;
    this.guestControls[index] = controls;
    return set;
  }

  /** Fill a dinner drop-down. Children-only meals are offered only to children. */
  fillMealSelect(select, child, chosen) {
    select.replaceChildren();
    const blank = this.doc.createElement("option");
    blank.value = "";
    blank.textContent = "Choose a dinner";
    select.append(blank);
    for (const meal of EventData.MEALS) {
      if (meal.childrenOnly && !child) continue;
      const option = this.doc.createElement("option");
      option.value = meal.id;
      option.textContent = `${meal.name} (${meal.note})`;
      select.append(option);
    }
    // Set the value itself: a select reads its own value, and a refused dish clears it.
    select.value = chosen || "";
  }

  /**
   * Read the RSVP form back as an RSVP.
   *
   * :return: the RSVP in the form, or null when no invitation is loaded
   */
  formState() {
    if (!this.loaded) return null;
    const guests = [];
    this.loaded.guests.forEach((guest, index) => {
      const controls = this.guestControls[index];
      let attending = null;
      if (controls.yes.checked) attending = true;
      if (controls.no.checked) attending = false;
      const meal = controls.meal.value || null;
      const entry = { name: guest.name, attending: attending, meal: meal };
      guests.push(entry);
    });
    const plusName = this.byId("plusone-name").value.trim();
    const plusMeal = this.byId("plusone-meal").value || null;
    const events = [];
    for (const box of this.eventBoxes) {
      if (box.checked) events.push(box.value);
    }
    return {
      code: this.loaded.code,
      lastName: this.loaded.lastName,
      guests: guests,
      plusOne: this.loaded.plusOne && (plusName || plusMeal) ? { name: plusName, meal: plusMeal } : null,
      events: events,
      shuttle: this.byId("rsvp-shuttle").checked,
      notes: this.byId("rsvp-notes").value.trim(),
    };
  }

  /** Show the thank-you note after a send. */
  showConfirmation(receipt) {
    const box = this.byId("rsvp-confirmation");
    box.hidden = false;
    box.replaceChildren();
    const heading = this.doc.createElement("h3");
    heading.textContent = receipt.coming
      ? `Thank you! ${receipt.coming} ${receipt.coming === 1 ? "seat" : "seats"} saved.`
      : "Thank you for letting us know. You'll be missed!";
    const note = this.doc.createElement("p");
    note.textContent = receipt.note;
    box.append(heading, note);
    this.announce(heading.textContent);
  }

  // ----- Static sections -----------------------------------------------------------------

  renderHero() {
    const event = EventData.EVENT;
    this.doc.title = `${event.hosts} · ${event.place} · ${Calendar.long(event.date).replace(/^\w+, /, "")}`;
    this.byId("hero-eyebrow").textContent = event.eyebrow || "";
    this.renderTitle(this.byId("names"), event.title || event.hosts);
    this.renderTitle(this.byId("monogram"), event.monogram || EventPage.monogram(event.title || event.hosts));
    this.byId("monogram").setAttribute("aria-label", `${event.title || event.hosts}, home`);
    this.byId("nav-schedule").textContent = event.scheduleHeading || "Schedule";
    this.byId("nav-stay").hidden = !EventData.PARTNERS.length;
    this.byId("find-code").placeholder = EventData.CODE_PREFIX ? `${EventData.CODE_PREFIX}-XXXX` : "Code";
    this.byId("assistant-heading").textContent = `Ask the ${event.kind || "event"} concierge`;
    const partnerNames = EventData.PARTNERS.map((partner) => partner.name);
    this.byId("assistant-intro").textContent = `It knows the schedule, the menu and the FAQ, and can fill in or send your RSVP.${partnerNames.length ? ` With your OK, it can also ask ${partnerNames.join(", ").replace(/, ([^,]*)$/, " and $1")} for you.` : ""}`;
    this.byId("network-link").href = `${event.slug}.network.json`;
    if (event.theme && event.theme.primary) {
      this.doc.documentElement?.style?.setProperty("--sea", event.theme.primary);
    }
    this.byId("hero-date").textContent = `${Calendar.long(event.date).replace(/, (\d{4})$/, ", $1")} · ${event.place}`;
    this.byId("demo-note").textContent = event.demoNote || "";
    this.byId("demo-note").hidden = !event.demoNote;
    this.byId("rsvp-cta").textContent = `RSVP by ${Calendar.long(event.rsvpDeadline).split(", ")[1]}`;
    this.byId("weekend-heading").textContent = event.scheduleHeading || "Schedule";
    this.byId("weekend-lede").textContent = event.scheduleLede || "";
    this.byId("contact").replaceChildren(`Questions the concierge can't answer? Email ${EventData.HOSTS_PLAIN} at `, this.mailLink(event.contactEmail), ".");
    const days = Calendar.daysBetween(Calendar.today(), EventData.DATE);
    this.byId("countdown").textContent = days > 1 ? `${days} days to go` : days === 1 ? "Tomorrow!" : days === 0 ? "Today!" : "Just married";
  }

  renderEvents() {
    const list = this.byId("event-list");
    list.replaceChildren();
    for (const event of EventData.EVENTS) {
      const item = this.doc.createElement("li");
      item.className = "event";
      item.id = `event-${event.id}`;
      const when = this.doc.createElement("p");
      when.className = "when";
      when.textContent = `${Calendar.long(event.date).replace(/, \d{4}$/, "")} · ${Calendar.time(event.start)} to ${Calendar.time(event.end)}`;
      const name = this.doc.createElement("h3");
      name.textContent = event.name;
      const place = this.doc.createElement("p");
      place.className = "place";
      place.textContent = `${event.place}, ${event.address}`;
      const details = this.doc.createElement("p");
      details.textContent = event.details;
      item.append(when, name, place, details);
      if (event.inviteOnly) {
        const tag = this.doc.createElement("span");
        tag.className = "tag";
        tag.textContent = "By invitation";
        name.append(" ", tag);
      }
      list.append(item);
    }
  }

  renderShuttle() {
    const s = EventData.SHUTTLE;
    const box = this.byId("shuttle");
    this.byId("shuttle-block").hidden = !s;
    this.byId("rsvp-shuttle-row").hidden = !s;
    if (!s) return;
    box.replaceChildren();
    const intro = this.doc.createElement("p");
    intro.textContent = `Free, on ${Calendar.long(s.day)}, from ${s.stop}.`;
    const table = this.doc.createElement("table");
    table.className = "times";
    const head = table.insertRow();
    for (const text of [s.outboundLabel || "There", s.returnLabel || "Back"]) {
      const th = this.doc.createElement("th");
      th.scope = "col";
      th.textContent = text;
      head.append(th);
    }
    const body = table;
    const rows = Math.max(s.outbound.length, s.return.length);
    for (let i = 0; i < rows; i += 1) {
      const row = body.insertRow();
      row.insertCell().textContent = s.outbound[i] ? Calendar.time(s.outbound[i]) : "";
      row.insertCell().textContent = s.return[i] ? Calendar.time(s.return[i]) : "";
    }
    const note = this.doc.createElement("p");
    note.className = "note";
    note.textContent = s.note;
    box.append(intro, table, note);
  }

  renderTravel() {
    this.byId("travel-note").textContent = this.faqAnswer("airport");
    this.byId("parking-note").textContent = this.faqAnswer("parking");
  }

  renderPartners() {
    const list = this.byId("partner-list");
    list.replaceChildren();
    this.byId("stay").hidden = !EventData.PARTNERS.length;
    for (const partner of EventData.PARTNERS) {
      const card = this.doc.createElement("article");
      card.className = `partner partner-${partner.id}`;
      const name = this.doc.createElement("h3");
      const link = this.doc.createElement("a");
      link.href = partner.url;
      link.textContent = partner.name;
      name.append(link);
      const kindLine = this.doc.createElement("p");
      kindLine.className = "eyebrow";
      kindLine.textContent = partner.kindLabel || "Nearby";
      const note = this.doc.createElement("p");
      note.textContent = partner.note;
      const badge = this.doc.createElement("p");
      badge.className = "agent-badge";
      badge.textContent = "Has its own assistant. Our concierge can ask it for you.";
      card.append(kindLine, name, note, badge);
      list.append(card);
    }
  }

  renderFaq() {
    const list = this.byId("faq-list");
    list.replaceChildren();
    for (const item of EventData.FAQ) {
      const details = this.doc.createElement("details");
      details.id = `faq-${item.id}`;
      const summary = this.doc.createElement("summary");
      summary.textContent = item.question;
      const answer = this.doc.createElement("p");
      answer.textContent = item.answer;
      details.append(summary, answer);
      list.append(details);
    }
  }

  // ----- Helpers -------------------------------------------------------------------------

  /**
   * Write a title, setting any "&" in the brass italic style.
   *
   * :param element: the element to fill
   * :param text: the title
   */
  renderTitle(element, text) {
    const parts = String(text).split("&");
    element.replaceChildren();
    parts.forEach((part, index) => {
      if (index > 0) {
        const amp = this.doc.createElement("span");
        amp.className = "amp";
        amp.textContent = "&";
        element.append(amp);
      }
      element.append(part);
    });
  }

  /**
   * Make a monogram from a title: "Nora & Theo" gives "N&T", "Ruth turns 80" gives "R".
   *
   * :param text: the title
   * :return: the monogram
   */
  static monogram(text) {
    return String(text).split("&").map((part) => part.trim().charAt(0).toUpperCase()).join("&");
  }

  mailLink(address) {
    const link = this.doc.createElement("a");
    link.href = `mailto:${address}`;
    link.textContent = address;
    return link;
  }

  faqAnswer(id) {
    return EventData.faqAnswer(id);
  }

  byId(id) {
    return this.doc.getElementById(id);
  }

  text(id) {
    return this.byId(id).textContent.replace(/\s+/g, " ").trim();
  }

  announce(message) {
    this.byId("status").textContent = message;
  }
}

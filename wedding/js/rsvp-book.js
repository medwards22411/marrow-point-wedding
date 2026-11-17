import { Calendar } from "./calendar.js";
import { EventData } from "./event-data.js";

/**
 * The guest list and the RSVPs, with every rule an RSVP must follow.
 *
 * The page's own form and the assistant both call check() and send(), so the rules live
 * only here. RSVPs are kept in page memory: this is a demo, and nothing leaves the page.
 * Every name and code is fictional.
 */
export class RsvpBook {
  static NOTES_MAX = 400;

  /** The message when no invitation matches. */
  static NOT_FOUND = `We can't find an invitation with that code and last name. The code is on the card in your invitation${EventData.CODE_PREFIX ? `, such as ${EventData.CODE_PREFIX}-1234` : ""}.`;

  constructor() {
    /** Sent RSVPs by invitation code. Each send replaces the last one. */
    this.answers = new Map();
    // event.json can hold one answer already sent, so "change my RSVP" can be tried.
    const sample = EventData.EVENT.sampleAnswer;
    if (sample) {
      this.answers.set(sample.code, structuredClone(sample));
    }
  }

  /**
   * Find the invited guest a name means: the full name, or a first name that only one
   * guest on the invitation has ("Owen" for Owen Pell). Case and spaces don't matter.
   *
   * :param invitation: an invitation from event.json
   * :param name: the name the guest gave
   * :return: the invited guest, or undefined
   */
  static guestNamed(invitation, name) {
    const wanted = String(name || "").trim().toLowerCase().replace(/\s+/g, " ");
    const full = invitation.guests.find((guest) => guest.name.toLowerCase() === wanted);
    if (full) return full;
    const byFirst = invitation.guests.filter((guest) => guest.name.toLowerCase().split(" ")[0] === wanted);
    return byFirst.length === 1 ? byFirst[0] : undefined;
  }

  /**
   * Say whether an invitation includes an invitation-only event.
   *
   * :param invitation: an invitation from event.json
   * :param id: the event id
   * :return: true when it is listed in the invitation's inviteOnlyEvents
   */
  static invitedTo(invitation, id) {
    return (invitation.inviteOnlyEvents || []).includes(id);
  }

  /**
   * Find an invitation by its code and the last name on it. Case and spaces don't matter.
   *
   * :param code: the code the guest gave, such as "MP-4821"
   * :param lastName: the last name on the invitation
   * :return: the invitation, or null when nothing matches
   */
  find(code, lastName) {
    // Guests often type the code without its prefix or with a space: "4821", "MP 4821".
    const prefix = EventData.CODE_PREFIX;
    let wanted = String(code || "").trim().toUpperCase();
    if (prefix) {
      wanted = `${prefix}-${wanted.replace(new RegExp(`^${prefix}\\s*-?\\s*`), "")}`;
    }
    const name = String(lastName || "").trim().toLowerCase();
    for (const invitation of EventData.INVITATIONS) {
      if (invitation.code === wanted && invitation.lastName.toLowerCase() === name) {
        return invitation;
      }
    }
    return null;
  }

  /**
   * Describe an invitation for the page and the assistant: who is invited, what to, and
   * the RSVP already sent, if any.
   *
   * :param invitation: an invitation from INVITATIONS
   * :return: plain data
   */
  describe(invitation) {
    const events = [];
    for (const event of EventData.EVENTS) {
      if (!event.inviteOnly || RsvpBook.invitedTo(invitation, event.id)) {
        events.push(event.id);
      }
    }
    const answer = this.answers.get(invitation.code);
    return {
      code: invitation.code,
      lastName: invitation.lastName,
      guests: invitation.guests.map((guest) => ({ name: guest.name, child: guest.child })),
      plusOneAllowed: invitation.plusOne,
      invitedTo: events,
      optionalEvents: EventData.optionalEventIds().filter((id) => events.includes(id)),
      currentRsvp: answer ? structuredClone(answer) : null,
    };
  }

  /**
   * Is the RSVP deadline still ahead?
   *
   * :return: true until the end of the deadline day
   */
  isOpen() {
    return Calendar.today() <= EventData.RSVP_DEADLINE;
  }

  /**
   * Check an RSVP against every rule, without changing anything.
   *
   * :param rsvp: code, lastName, guests [{name, attending, meal}], plusOne {name, meal}
   *   or null, events (optional event ids), shuttle and notes
   * :param partial: true for a form the guest will finish on the page: unanswered guests
   *   and missing meals are then allowed
   * :return: {ok: true, invitation, rsvp} with the RSVP cleaned up, or
   *   {ok: false, reason, field}
   */
  check(rsvp, partial = false) {
    const invitation = this.find(rsvp.code, rsvp.lastName);
    if (!invitation) {
      return RsvpBook.refuse(RsvpBook.NOT_FOUND, "code");
    }
    if (!this.isOpen()) {
      return RsvpBook.refuse(`RSVPs closed on ${Calendar.long(EventData.RSVP_DEADLINE)}. Please email ${EventData.CONTACT_EMAIL}.`, "code");
    }
    const meals = EventData.MEALS.map((meal) => meal.id);
    const childrenOnly = EventData.MEALS.filter((meal) => meal.childrenOnly);
    const given = Array.isArray(rsvp.guests) ? rsvp.guests : [];
    const guests = [];
    for (const answer of given) {
      const invited = RsvpBook.guestNamed(invitation, answer.name);
      if (!invited) {
        return RsvpBook.refuse(`${answer.name} is not on this invitation. It lists ${RsvpBook.names(invitation)}.`, "guests");
      }
      if (guests.some((guest) => guest.name === invited.name)) {
        return RsvpBook.refuse(`${invited.name} is listed twice.`, "guests");
      }
      if (typeof answer.attending !== "boolean") {
        if (partial) continue;
        return RsvpBook.refuse(`Please say whether ${invited.name} is coming.`, "guests");
      }
      let meal = answer.meal || null;
      if (!answer.attending) {
        meal = null;
      } else if (meal === null) {
        if (!partial) {
          return RsvpBook.refuse(`Please choose a dinner for ${invited.name}.`, "guests");
        }
      } else if (!meals.includes(meal)) {
        return RsvpBook.refuse(`"${meal}" is not on the menu.`, "guests");
      } else if (!invited.child && childrenOnly.some((item) => item.id === meal)) {
        return RsvpBook.refuse(RsvpBook.childrenOnlyReason(meal), "guests");
      }
      guests.push({ name: invited.name, attending: answer.attending, meal: meal });
    }
    if (!partial) {
      for (const guest of invitation.guests) {
        if (!guests.some((answer) => answer.name === guest.name)) {
          return RsvpBook.refuse(`Please say whether ${guest.name} is coming.`, "guests");
        }
      }
    }
    let plusOne = null;
    if (rsvp.plusOne && (rsvp.plusOne.name || rsvp.plusOne.meal)) {
      if (!invitation.plusOne) {
        return RsvpBook.refuse(`This invitation doesn't include a guest. Please email ${EventData.HOSTS_PLAIN} if you'd like to ask.`, "plusOne");
      }
      const name = String(rsvp.plusOne.name || "").trim();
      const meal = rsvp.plusOne.meal || null;
      if (!name && !partial) {
        return RsvpBook.refuse("Please give your guest's full name.", "plusOne");
      }
      if (meal === null && !partial) {
        return RsvpBook.refuse("Please choose a dinner for your guest.", "plusOne");
      }
      if (meal !== null && (!meals.includes(meal) || childrenOnly.some((item) => item.id === meal))) {
        return RsvpBook.refuse("Please choose an adult dinner for your guest.", "plusOne");
      }
      plusOne = { name: name.slice(0, 80), meal: meal };
    }
    const anyoneComing = guests.some((guest) => guest.attending);
    if (plusOne && !anyoneComing && !partial) {
      return RsvpBook.refuse("A guest can come only with someone on the invitation.", "plusOne");
    }
    const events = [];
    for (const id of rsvp.events || []) {
      const event = EventData.eventById(id);
      if (!event || !event.optional) {
        const main = EventData.EVENTS.filter((item) => item.main).map((item) => item.name.toLowerCase());
        return RsvpBook.refuse(`"${id}" is not an event you can choose. The ${main.join(" and ")} come with saying yes.`, "events");
      }
      if (event.inviteOnly && !RsvpBook.invitedTo(invitation, id)) {
        return RsvpBook.refuse(`${event.inviteOnlyReason || `The ${event.name.toLowerCase()} is by invitation`}, and this invitation doesn't include it.`, "events");
      }
      if (!events.includes(id)) events.push(id);
    }
    if (!anyoneComing && !partial && (events.length || rsvp.shuttle)) {
      return RsvpBook.refuse("No one on this invitation is coming, so there are no events or shuttle seats to choose.", "events");
    }
    const notes = String(rsvp.notes || "").trim();
    if (notes.length > RsvpBook.NOTES_MAX) {
      return RsvpBook.refuse(`Please keep notes under ${RsvpBook.NOTES_MAX} characters.`, "notes");
    }
    return {
      ok: true,
      invitation: invitation,
      rsvp: {
        code: invitation.code,
        guests: guests,
        plusOne: plusOne,
        events: events,
        shuttle: Boolean(rsvp.shuttle) && anyoneComing && Boolean(EventData.SHUTTLE),
        notes: notes,
      },
    };
  }

  /**
   * Check and save an RSVP, replacing any earlier one for the invitation.
   *
   * :param rsvp: as for check()
   * :return: {ok: true, receipt} or {ok: false, reason, field}
   */
  send(rsvp) {
    const checked = this.check(rsvp);
    if (!checked.ok) return checked;
    const replaced = this.answers.has(checked.rsvp.code);
    const saved = { ...checked.rsvp, sentOn: Calendar.today() };
    this.answers.set(saved.code, saved);
    return {
      ok: true,
      receipt: {
        ...structuredClone(saved),
        replacedEarlierAnswer: replaced,
        coming: RsvpBook.headcount(saved),
        note: `${EventData.HOSTS_PLAIN} have your answer. You can change it on this page until ${Calendar.long(EventData.RSVP_DEADLINE)}.`,
      },
    };
  }

  /**
   * Count the people coming on an RSVP, plus-one included.
   *
   * :param rsvp: a checked RSVP
   * :return: the number of people
   */
  static headcount(rsvp) {
    let count = rsvp.guests.filter((guest) => guest.attending).length;
    if (rsvp.plusOne) count += 1;
    return count;
  }

  /**
   * List the names on an invitation, for messages.
   *
   * :param invitation: an invitation
   * :return: the names, joined
   */
  static names(invitation) {
    return invitation.guests.map((guest) => guest.name).join(", ");
  }

  /**
   * The message for a children-only meal chosen for an adult, from event.json.
   *
   * :param id: the meal id
   * :return: the message
   */
  static childrenOnlyReason(id) {
    const meal = EventData.MEALS.find((item) => item.id === id);
    return `The ${meal.short || meal.name} is for ${meal.onlyFor || "children"}.`;
  }

  /**
   * Build a refusal.
   *
   * :param reason: the message for the guest
   * :param field: the field it is about
   * :return: {ok: false, reason, field}
   */
  static refuse(reason, field) {
    return { ok: false, reason: reason, field: field };
  }
}

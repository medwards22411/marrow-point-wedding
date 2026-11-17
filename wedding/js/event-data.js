import event from "../event.json" with { type: "json" };

/**
 * The event, read from event.json: the one file a planner edits to make a new site.
 * The page renders from it and the assistant reads it through the page's state reader,
 * so the two never disagree.
 */
export class EventData {
  /** The whole event.json. */
  static EVENT = event;

  /** Display name of the hosts, such as "Nora & Theo". */
  static HOSTS = event.hosts;

  /** The hosts in a sentence, such as "Nora and Theo". */
  static HOSTS_PLAIN = event.hostsPlain || event.hosts;

  /** The main day, "YYYY-MM-DD". */
  static DATE = event.date;

  static RSVP_DEADLINE = event.rsvpDeadline;

  static PLACE = event.place;

  static CONTACT_EMAIL = event.contactEmail;

  /** Prefix of invitation codes, such as "MP" in MP-4821. */
  static CODE_PREFIX = event.codePrefix || "";

  /** The schedule. "optional" events are ticked on the RSVP; "inviteOnly" ones only by invited parties. */
  static EVENTS = event.events;

  /** The shuttle, or null when there is none. */
  static SHUTTLE = event.shuttle || null;

  /** Dinner choices. "childrenOnly" meals are offered only to children. */
  static MEALS = event.meals || [];

  static FAQ = event.faq || [];

  /** Partner sites, each with its page and its agent network URL. */
  static PARTNERS = event.partners || [];

  static INVITATIONS = event.invitations || [];

  /**
   * The ids of the events a party can tick on the RSVP.
   *
   * :return: event ids, in schedule order
   */
  static optionalEventIds() {
    return EventData.EVENTS.filter((item) => item.optional).map((item) => item.id);
  }

  /**
   * Find an event by id.
   *
   * :param id: the event id
   * :return: the event, or undefined
   */
  static eventById(id) {
    return EventData.EVENTS.find((item) => item.id === id);
  }

  /**
   * Find a FAQ answer by id.
   *
   * :param id: the FAQ id
   * :return: the answer, or ""
   */
  static faqAnswer(id) {
    const item = EventData.FAQ.find((entry) => entry.id === id);
    return item ? item.answer : "";
  }
}

// Registers this website's operations with the agent runtime.
// agent-manifest.json loads this module through "actions.module". Only the names in
// "actions.agentTools" become model tools, called website_<name>.
//
// Each action wraps an operation of the running event page (App.page). The RSVP rules
// stay in js/rsvp-book.js. Operations return {ok: false, reason, field} when they refuse
// input, before changing anything. A throw is reported as "unknown".
// js/app.js is imported by the same URL that index.html uses, so there is one page state.
import { App } from "./js/app.js";
import { EventData } from "./js/event-data.js";

/**
 * Describes the event site's operations as actions the agents can call.
 *
 * Each action wraps a function the page already uses, so the assistant and the page's own
 * forms share one set of rules. The runtime validates arguments against inputSchema before
 * execute runs, and asks the visitor to confirm "irreversible" actions first.
 */
class SiteActions {
  /**
   * Register every site action with the runtime.
   *
   * :param actions: The runtime registry facade with a register(definition) method.
   */
  static registerActions(actions) {
    actions.register(SiteActions.readInfoAction());
    actions.register(SiteActions.lookUpInvitationAction());
    actions.register(SiteActions.fillRsvpFormAction());
    actions.register(SiteActions.sendRsvpAction());
  }

  /**
   * Describe the RSVP's fields, shared by filling the form and sending.
   *
   * :return: The schema's properties.
   */
  static rsvpProperties() {
    const mealIds = EventData.MEALS.map((meal) => meal.id);
    const adultMealIds = EventData.MEALS.filter((meal) => !meal.childrenOnly).map((meal) => meal.id);
    return {
      code: {
        type: "string",
        minLength: 1,
        maxLength: 12,
        description: "Invitation code the guest gave, such as MP-1234.",
      },
      lastName: {
        type: "string",
        minLength: 1,
        maxLength: 60,
        description: "The last name on the invitation, as the guest gave it.",
      },
      guests: {
        type: "array",
        maxItems: 8,
        description: "One entry per invited guest the guest answered for, using the names from website_look_up_invitation.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name"],
          properties: {
            name: { type: "string", maxLength: 80, description: "Guest name exactly as the invitation lists it." },
            attending: { type: "boolean", description: "true if this guest is coming. Leave out if the guest has not said." },
            meal: { type: "string", enum: mealIds, description: "Dinner for a guest who is coming. Leave out if not chosen. Children-only meals are for children only." },
          },
        },
      },
      plusOne: {
        type: "object",
        additionalProperties: false,
        description: "Only when plusOneAllowed is true and the guest is bringing someone. Leave out otherwise.",
        properties: {
          name: { type: "string", maxLength: 80, description: "The plus-one's full name." },
          meal: { type: "string", enum: adultMealIds, description: "The plus-one's dinner." },
        },
      },
      events: {
        type: "array",
        maxItems: 3,
        items: { type: "string", enum: EventData.optionalEventIds() },
        description: "Optional events the party will come to, from the invitation's optionalEvents. The main events come with saying yes.",
      },
      shuttle: { type: "boolean", description: "true to save seats on the shuttle." },
      notes: { type: "string", maxLength: 400, description: "Notes for the couple the guest gave, such as allergies or access needs. Optional." },
    };
  }

  /**
   * Describe the read action for the page's facts and state.
   *
   * :return: The action definition.
   */
  static readInfoAction() {
    return {
      name: "get_event_info",
      description: "Read today's date, the event date and RSVP deadline, the schedule (times, places, which events are by invitation), the shuttle, the dinner menu, the FAQ, the partner sites with what they offer and their links, the hosts' email, the RSVP form on the page and the latest RSVP sent in this tab. It does not show who is invited.",
      effect: "read",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      execute: SiteActions.readInfo,
    };
  }

  static readInfo() {
    return App.page.readState();
  }

  /**
   * Describe the invitation lookup.
   *
   * :return: The action definition.
   */
  static lookUpInvitationAction() {
    return {
      name: "look_up_invitation",
      description: "Find an invitation by its code and last name, as Find my invitation does: the invited guests (and which are children), whether a plus-one is allowed, the events it covers and the RSVP already sent, if any. Changes nothing. Returns ok false when nothing matches.",
      effect: "read",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["code", "lastName"],
        properties: {
          code: SiteActions.rsvpProperties().code,
          lastName: SiteActions.rsvpProperties().lastName,
        },
      },
      execute: SiteActions.lookUpInvitation,
    };
  }

  static lookUpInvitation(args) {
    return App.page.lookUpInvitation(args.code, args.lastName);
  }

  /**
   * Describe filling the RSVP form, which the guest finishes and sends on the page.
   *
   * :return: The action definition.
   */
  static fillRsvpFormAction() {
    return {
      name: "fill_rsvp_form",
      description: "Put an RSVP in the form on the page, so the guest can check it and press Send RSVP. It may be incomplete. Replaces what the form held. Sends nothing. Returns the form, or ok false with the site's reason, changing nothing.",
      // "write" runs immediately. The guest can change the form or leave it unsent.
      effect: "write",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["code", "lastName"],
        properties: SiteActions.rsvpProperties(),
      },
      execute: SiteActions.fillRsvpForm,
    };
  }

  static fillRsvpForm(args) {
    return App.page.fillRsvpForm(args);
  }

  /**
   * Describe sending the RSVP, which the guest confirms first.
   *
   * :return: The action definition.
   */
  static sendRsvpAction() {
    return {
      name: "send_rsvp",
      description: "Send the RSVP to the couple, replacing any earlier answer for the invitation. Every invited guest needs attending, and each guest who is coming needs a meal. The browser asks the guest to confirm first. Returns the receipt.",
      // "irreversible" makes the runtime open a confirmation dialog before execute runs.
      effect: "irreversible",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["code", "lastName", "guests"],
        properties: SiteActions.rsvpProperties(),
      },
      execute: SiteActions.sendRsvp,
    };
  }

  static sendRsvp(args) {
    return App.page.sendRsvp(args);
  }
}

// The runtime calls the module's registerActions export.
export const registerActions = SiteActions.registerActions;

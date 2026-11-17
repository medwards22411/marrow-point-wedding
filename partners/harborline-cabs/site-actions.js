// Registers this website's operations with the agent runtime.
// agent-manifest.json loads this module through "actions.module". Only the names in
// "actions.agentTools" become model tools, called website_<name>.
//
// Each action wraps an operation of the running ride page (App.page). The business rules
// stay in js/ride-book.js, js/ride-rules.js and js/fare-calculator.js.
// Operations return {ok: false, reason, field, errors} when they refuse input, before
// changing anything. A throw is reported as "unknown".
// js/app.js is imported by the same URL that index.html uses, so there is one page state.
import { App } from "./js/app.js";
import { CabData } from "./js/cab-data.js";

/**
 * Describes Harborline Cabs' operations as actions the agents can call.
 *
 * Each action wraps a function the page already uses, so the assistant and the manual
 * UI share one set of rules. The runtime validates arguments against inputSchema before
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
    actions.register(SiteActions.quoteRideAction());
    actions.register(SiteActions.fillRideFormAction());
    actions.register(SiteActions.lookUpRideAction());
    actions.register(SiteActions.bookRideAction());
    actions.register(SiteActions.cancelRideAction());
  }

  /**
   * List the ids of one of the site's catalogs, for an enum.
   *
   * :param list: CabData.ZONES or CabData.CAR_TYPES.
   * :return: The ids.
   */
  static ids(list) {
    const ids = [];
    for (const item of list) {
      ids.push(item.id);
    }
    return ids;
  }

  /**
   * Describe a text argument with the same limit as the page's field.
   *
   * :param maxLength: The page field's maxlength.
   * :param description: What the text is.
   * :return: The schema.
   */
  static textField(maxLength, description) {
    return {
      type: "string",
      maxLength: maxLength,
      description: description,
    };
  }

  /**
   * Describe a ride: zones, pick-up date and time, passengers, car and child seats.
   * The bounds on counts are looser than the site's, so the site's own message
   * explains a party that no car takes.
   *
   * :return: The schema's properties.
   */
  static rideProperties() {
    return {
      from: {
        type: "string",
        enum: SiteActions.ids(CabData.ZONES),
        description: "Pick-up zone id from website_get_cab_info.",
      },
      to: {
        type: "string",
        enum: SiteActions.ids(CabData.ZONES),
        description: "Drop-off zone id from website_get_cab_info.",
      },
      date: {
        type: "string",
        format: "date",
        description: "Pick-up date, YYYY-MM-DD.",
      },
      time: {
        type: "string",
        maxLength: 5,
        description: "Pick-up time as HH:MM, 24-hour, on a quarter hour.",
      },
      passengers: {
        type: "integer",
        minimum: 0,
        maximum: 20,
        description: "Number of people riding, children included.",
      },
      carType: {
        type: "string",
        enum: SiteActions.ids(CabData.CAR_TYPES),
        description: "Car id from website_get_cab_info, as the visitor chose.",
      },
      childSeats: {
        type: "integer",
        minimum: 0,
        maximum: 10,
        description: "Child seats the visitor asked for. Leave out for none.",
      },
    };
  }

  /**
   * Describe the ride's two addresses.
   *
   * :return: The schema's properties.
   */
  static placeProperties() {
    return {
      fromPlace: SiteActions.textField(CabData.LIMITS.place, "Pick-up address or place the visitor gave."),
      toPlace: SiteActions.textField(CabData.LIMITS.place, "Drop-off address or place the visitor gave."),
    };
  }

  /**
   * Describe the read action that returns the site's data and the page's state.
   *
   * :return: The action definition.
   */
  static readInfoAction() {
    return {
      name: "get_cab_info",
      description: "Read the zones, fixed fares, cars (passengers, extra charge, luggage), terms (night surcharge, child seats, pick-up times, the van's hourly limit, booking window, cancellation, payment), today's date and time, the earliest pick-up and last bookable date, the page's facts (contact, payment, changes, travel, what we don't do, demo note, with link hrefs) and the page's state: the ride in the booking form with its fare, the latest ride booked in this tab and the ride Manage my ride shows. It does not show other people's rides.",
      effect: "read",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      execute: SiteActions.readInfo,
    };
  }

  /**
   * Return a fresh copy of the page state.
   *
   * :return: The page state as plain JSON data.
   */
  static readInfo() {
    return App.page.readState();
  }

  /**
   * Describe the fare quote, which reads and changes nothing.
   *
   * :return: The action definition.
   */
  static quoteRideAction() {
    return {
      name: "quote_ride",
      description: "Price a ride line by line and check that it can be booked: route, booking window, quarter-hour time, party size, child seats and whether the accessible van is free that hour. Changes nothing on the page. Returns ok false with the site's reason otherwise.",
      effect: "read",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["from", "to", "date", "time", "passengers", "carType"],
        properties: SiteActions.rideProperties(),
      },
      execute: SiteActions.quoteRide,
    };
  }

  /**
   * Price a ride through the site's own quote.
   *
   * :param args: The validated ride.
   * :return: The priced ride, or ok false with a reason.
   */
  static quoteRide(args) {
    return App.page.quoteRide(args);
  }

  /**
   * Describe a reversible write the agent may run without a confirmation dialog.
   *
   * :return: The action definition.
   */
  static fillRideFormAction() {
    return {
      name: "fill_ride_form",
      description: "Put a ride in the booking form on the page and show its fare there, so the visitor can finish booking on the page. Replaces the ride in the form; addresses left out stay as they are, and the visitor's name, phone and notes are kept. It does not book. Returns the form's ride and fare, or ok false with the site's reason, changing nothing.",
      // "write" runs immediately. The visitor can change or clear the form on the page.
      effect: "write",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["from", "to", "date", "time", "passengers", "carType"],
        properties: Object.assign(SiteActions.rideProperties(), SiteActions.placeProperties()),
      },
      execute: SiteActions.fillRideForm,
    };
  }

  /**
   * Fill the booking form through the page's own draft function.
   *
   * :param args: The validated ride.
   * :return: The booking form's new ride and fare, or ok false with a reason.
   */
  static fillRideForm(args) {
    return App.page.fillDraft(args);
  }

  /**
   * Describe the ride look-up, which reads and changes nothing.
   *
   * :return: The action definition.
   */
  static lookUpRideAction() {
    return {
      name: "look_up_ride",
      description: "Find a booked ride by its code and the last name on it, as Manage my ride does. Returns the ride, its status and whether it can still be cancelled for free (cancellation.freeNow, freeUntil), or ok false when no ride matches. Changes nothing on the page.",
      effect: "read",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["code", "lastName"],
        properties: {
          code: SiteActions.textField(CabData.LIMITS.code, "Booking code the visitor gave, such as HC-XXXX."),
          lastName: SiteActions.textField(CabData.LIMITS.name, "The last name on the booking, as the visitor gave it."),
        },
      },
      execute: SiteActions.lookUpRide,
    };
  }

  /**
   * Look up a ride through the site's own check of code and last name.
   *
   * :param args: The validated arguments with code and lastName.
   * :return: The ride and its cancellation terms, or ok false with a reason.
   */
  static lookUpRide(args) {
    return App.page.lookUpRide(args.code, args.lastName);
  }

  /**
   * Describe the booking, which the visitor must confirm.
   *
   * :return: The action definition.
   */
  static bookRideAction() {
    const properties = Object.assign(SiteActions.rideProperties(), SiteActions.placeProperties(), {
      firstName: SiteActions.textField(CabData.LIMITS.name, "The rider's first name, as the visitor gave it."),
      lastName: SiteActions.textField(CabData.LIMITS.name, "The rider's last name, as the visitor gave it."),
      phone: SiteActions.textField(CabData.LIMITS.phone, "The phone number the visitor gave, for the driver."),
      notes: SiteActions.textField(CabData.LIMITS.notes, "Notes for the driver the visitor gave, such as a flight number or luggage. Optional."),
    });
    return {
      name: "book_ride",
      description: "Book a ride. The browser asks the visitor to confirm first. Nothing is paid online: the rider pays in the cab. Returns the booking with its code and free-cancellation deadline.",
      // "irreversible" makes the runtime open a confirmation dialog before execute runs.
      effect: "irreversible",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["from", "fromPlace", "to", "toPlace", "date", "time", "passengers", "carType", "firstName", "lastName", "phone"],
        properties: properties,
      },
      execute: SiteActions.bookRide,
    };
  }

  /**
   * Book through the same function the page's own booking form uses.
   *
   * :param args: The validated, visitor-confirmed arguments.
   * :return: The booking with its code, or {ok: false, reason} when the site refuses it.
   * :raises Error: Only on an unexpected failure; the runtime then reports "unknown".
   */
  static bookRide(args) {
    return App.page.placeRide(args);
  }

  /**
   * Describe the cancellation, which the visitor must confirm.
   *
   * :return: The action definition.
   */
  static cancelRideAction() {
    return {
      name: "cancel_ride",
      description: "Cancel a booked ride, free, up to 2 hours before pick-up. The site refuses later or already cancelled rides. The browser asks the visitor to confirm first. Returns the cancelled ride.",
      effect: "irreversible",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["code", "lastName"],
        properties: {
          code: SiteActions.textField(CabData.LIMITS.code, "Booking code the visitor gave."),
          lastName: SiteActions.textField(CabData.LIMITS.name, "The last name on the booking, as the visitor gave it."),
        },
      },
      execute: SiteActions.cancelRide,
    };
  }

  /**
   * Cancel through the same function the page's own cancel button uses.
   *
   * :param args: The validated, visitor-confirmed arguments.
   * :return: The cancelled ride, or {ok: false, reason} when the site refuses it.
   * :raises Error: Only on an unexpected failure; the runtime then reports "unknown".
   */
  static cancelRide(args) {
    return App.page.cancelRide(args.code, args.lastName);
  }
}

// The runtime calls the module's registerActions export.
export const registerActions = SiteActions.registerActions;

import { CabData } from "./cab-data.js";
import { Calendar } from "./calendar.js";
import { FareCalculator } from "./fare-calculator.js";
import { RideBook } from "./ride-book.js";
import { RideFacts } from "./ride-facts.js";
import { RideRules } from "./ride-rules.js";

/**
 * Connects index.html to the ride book. The page's forms and buttons call
 * these methods, which run an operation and show its result, any validation
 * messages and a short status announcement.
 *
 * The operations (quoteRide, fillDraft, placeRide, lookUpRide and cancelRide)
 * are also what the assistant calls. They return plain JSON: a refusal is
 * {ok: false, reason, field, errors} and changes nothing. Focus moves and form
 * resets stay in the form and button handlers.
 */
export class RidePage {
  /** Page-only facts the assistant reads, by topic, with the id of the element that holds each. */
  static FACTS = {
    about: "about",
    demo: "demo-note",
    fares: "fares-note",
    luggage: "luggage-note",
    payment: "payment-note",
    changes: "changes-note",
    travel: "travel-note",
    notOffered: "not-offered",
    contact: "contact",
    phoneHours: "phone-hours",
  };

  /** The Manage my ride form's fields, in page order. */
  static MANAGE_FIELDS = ["code", "lastName"];

  /**
   * Create the page controller.
   *
   * :param doc: the page's document
   * :param book: the ride book that runs the operations
   */
  constructor(doc, book) {
    this.doc = doc;
    this.book = book;
    // The code of the ride in the confirmation box, if it is showing one.
    this.confirmedCode = null;
    // The code of the ride in the Manage my ride panel, if it is showing one.
    this.managedCode = null;
  }

  /**
   * Render the fares, cars and terms and the form's choices, then connect the forms.
   */
  start() {
    for (const fare of RideFacts.fares()) {
      const row = this.byId("fare-rows").insertRow();
      row.insertCell().textContent = fare.route;
      row.insertCell().textContent = `${fare.driveMinutes} min`;
      row.insertCell().textContent = fare.fare;
    }
    for (const car of RideFacts.cars()) {
      const item = this.element("li", "", "car");
      item.append(
        this.element("h4", car.name),
        this.element("p", `Up to ${car.passengers} passengers · ${car.extra}`, "facts"),
        this.element("p", car.luggage, "note"),
      );
      this.byId("car-list").append(item);
      this.byId("ride-carType").append(new Option(`${car.name} (up to ${car.passengers})`, car.id));
    }
    const terms = RideFacts.terms();
    for (const text of [terms.nightSurcharge.rule, terms.childSeats, terms.pickUpTimes, terms.bookAhead, terms.van, terms.cancellation]) {
      this.byId("terms-list").append(this.element("li", text));
    }
    for (const zone of CabData.ZONES) {
      this.byId("ride-from").append(new Option(zone.name, zone.id));
      this.byId("ride-to").append(new Option(zone.name, zone.id));
    }
    for (let minutes = 0; minutes < 1440; minutes += CabData.SLOT_MINUTES) {
      const time = `${Calendar.pad(Math.floor(minutes / 60))}:${Calendar.pad(minutes % 60)}`;
      const label = FareCalculator.isNight(time) ? `${time} (night fare)` : time;
      this.byId("ride-time").append(new Option(label, time));
    }
    for (let count = 1; count <= CabData.MAX_PASSENGERS; count += 1) {
      this.byId("ride-passengers").append(new Option(String(count), String(count)));
    }
    for (let count = 0; count <= CabData.MAX_CHILD_SEATS; count += 1) {
      this.byId("ride-childSeats").append(new Option(count === 0 ? "None" : String(count), String(count)));
    }
    this.byId("ride-date").min = Calendar.today();
    this.byId("ride-date").max = RideRules.lastBookableDate();
    this.byId("ride-fields").addEventListener("change", this.updateDraft.bind(this));
    this.byId("ride-form").addEventListener("submit", this.submitBooking.bind(this));
    this.byId("manage-form").addEventListener("submit", this.findRide.bind(this));
    this.updateDraft();
  }

  /**
   * Read the page's data and state for the assistant: today and the booking
   * window, zones, fares, cars, terms, the page-only facts, the ride in the
   * booking form, the latest ride booked in this tab and the ride Manage my
   * ride shows. It leaves out other people's rides.
   *
   * :return: the state as plain JSON
   */
  readState() {
    return {
      today: RideFacts.day(Calendar.today()),
      bookingWindow: RideFacts.bookingWindow(),
      zones: RideFacts.zones(),
      fares: RideFacts.fares(),
      cars: RideFacts.cars(),
      terms: RideFacts.terms(),
      pageFacts: this.pageFacts(),
      rideForm: this.draftState(),
      latestRide: this.latestRide(),
      managedRide: this.managedRide(),
    };
  }

  /**
   * Read the facts that only the page's HTML holds, such as contact details and
   * payment, with each link's address.
   *
   * :return: the facts by topic, each with its text and links
   */
  pageFacts() {
    const facts = {};
    for (const [topic, id] of Object.entries(RidePage.FACTS)) {
      facts[topic] = this.fact(this.byId(id));
    }
    return facts;
  }

  /**
   * Read one page element's text and the address of each link in it.
   *
   * :param element: the element
   * :return: the text and the links
   */
  fact(element) {
    const links = [];
    // textContent leaves out a link's address, so read each href too.
    for (const link of element.querySelectorAll("a")) {
      links.push({
        text: RideFacts.plain(link.textContent),
        href: link.href,
      });
    }
    return {
      text: RideFacts.plain(element.textContent),
      links: links,
    };
  }

  /**
   * Describe the ride in the booking form and its fare, or what it still needs.
   * The visitor's name, phone and notes are left out.
   *
   * :return: the form's ride, its pick-up with weekday, fare and what it still needs
   */
  draftState() {
    const draft = this.readDraft();
    const result = this.book.quote(draft);
    return {
      from: draft.from,
      fromPlace: draft.fromPlace,
      to: draft.to,
      toPlace: draft.toPlace,
      date: draft.date,
      time: draft.time,
      pickUp: result.errors ? null : RideFacts.moment(draft),
      passengers: draft.passengers,
      carType: draft.carType,
      childSeats: draft.childSeats,
      fare: result.errors ? null : FareCalculator.money(result.quote.total),
      stillNeeds: result.errors ? Object.values(result.errors).join(" ") : "",
    };
  }

  /**
   * Describe the ride in the confirmation box, which was booked in this tab.
   *
   * :return: the ride, or null when the box is empty
   */
  latestRide() {
    const booking = this.find(this.confirmedCode);
    return booking ? RideFacts.booking(booking) : null;
  }

  /**
   * Describe the ride the Manage my ride panel shows, with its last name and
   * cancellation terms. The visitor looked it up with its code and last name.
   *
   * :return: the ride, its last name and terms, or null when the panel shows none
   */
  managedRide() {
    const booking = this.find(this.managedCode);
    if (!booking) return null;
    return {
      ride: RideFacts.booking(booking),
      // The look-up and the cancellation need the last name on its own.
      lastName: booking.rider.lastName,
      cancellation: RideFacts.cancellation(RideBook.cancellationTerms(booking)),
    };
  }

  /**
   * Find a stored booking by code.
   *
   * :param code: the code, or null
   * :return: the booking, or null
   */
  find(code) {
    for (const booking of this.book.rides) {
      if (code !== null && booking.code === code) return booking;
    }
    return null;
  }

  /**
   * Price a ride and check that it can be booked, without changing the page.
   *
   * :param ride: from, to, date, time, passengers, carType, childSeats and, optionally, the places
   * :return: the priced ride and when free cancellation ends, or a refusal
   */
  quoteRide(ride) {
    const draft = RidePage.rideOf(ride);
    const result = this.book.quote(draft);
    if (result.errors) return RidePage.refusal(result.errors);
    return Object.assign({ ok: true, bookable: true }, RideFacts.pricedRide(draft, result.quote), {
      freeCancellationUntil: RideFacts.moment(Calendar.addMinutes(draft, -CabData.LEAD_MINUTES)),
    });
  }

  /**
   * Put a ride in the booking form and show its fare, as if the visitor had
   * chosen it, leaving their name, phone and notes alone. Addresses that are
   * not given stay as they are. A ride that breaks a rule is refused, and the
   * form keeps what it had.
   *
   * :param ride: from, to, date, time, passengers, carType, childSeats and, optionally, the places
   * :return: the booking form's new ride and fare, or a refusal
   */
  fillDraft(ride) {
    const draft = RidePage.rideOf(ride);
    const result = this.book.quote(draft);
    if (result.errors) return RidePage.refusal(result.errors);
    this.byId("ride-from").value = draft.from;
    this.byId("ride-to").value = draft.to;
    if (ride.fromPlace !== undefined) this.byId("ride-fromPlace").value = draft.fromPlace;
    if (ride.toPlace !== undefined) this.byId("ride-toPlace").value = draft.toPlace;
    this.byId("ride-date").value = draft.date;
    this.byId("ride-time").value = draft.time;
    this.byId("ride-passengers").value = String(draft.passengers);
    this.byId("ride-carType").value = draft.carType;
    this.byId("ride-childSeats").value = String(draft.childSeats);
    this.updateDraft();
    return {
      ok: true,
      rideForm: this.draftState(),
    };
  }

  /**
   * Read the ride from the booking form.
   *
   * :return: the ride, with numbers for passengers and child seats
   */
  readDraft() {
    return {
      from: this.value("ride-from"),
      fromPlace: this.value("ride-fromPlace"),
      to: this.value("ride-to"),
      toPlace: this.value("ride-toPlace"),
      date: this.value("ride-date"),
      time: this.value("ride-time"),
      passengers: Number(this.value("ride-passengers")),
      carType: this.value("ride-carType"),
      childSeats: Number(this.value("ride-childSeats")),
    };
  }

  /**
   * Price the ride in the form after each change, or say what it still needs,
   * and clear the form's old messages.
   */
  updateDraft() {
    const result = this.book.quote(this.readDraft());
    const box = this.byId("fare");
    this.showErrors("ride", RideRules.FIELDS, null);
    if (result.errors) {
      box.replaceChildren(this.element("p", `To see your fare: ${Object.values(result.errors).join(" ")}`, "note"));
      return;
    }
    const table = this.element("table");
    for (const line of result.quote.lines) {
      const row = table.insertRow();
      row.insertCell().textContent = line.label;
      row.insertCell().textContent = line.detail;
      row.insertCell().textContent = FareCalculator.lineAmount(line.amount);
    }
    const total = table.insertRow();
    total.insertCell().textContent = "Total";
    total.insertCell().textContent = "Pay in the cab";
    total.insertCell().textContent = FareCalculator.money(result.quote.total);
    box.replaceChildren(this.element("h3", "Your fare"), table);
    this.announce(`Your fare is ${FareCalculator.money(result.quote.total)}.`);
  }

  /**
   * Book the ride in the form with the visitor's details, then show the code.
   *
   * :param event: the form's submit event
   */
  submitBooking(event) {
    event.preventDefault();
    const request = Object.assign(this.readDraft(), {
      firstName: this.value("ride-firstName"),
      lastName: this.value("ride-lastName"),
      phone: this.value("ride-phone"),
      notes: this.value("ride-notes"),
    });
    const receipt = this.placeRide(request);
    if (!receipt.ok) {
      this.showErrors("ride", RideRules.FIELDS, receipt.errors);
      this.focusFirstError("ride", RideRules.FIELDS, receipt.errors);
      return;
    }
    // Clear the form for the next ride, then price the empty form again.
    this.byId("ride-form").reset();
    this.updateDraft();
    this.byId("confirmation").focus();
  }

  /**
   * Check a booking without placing it: every rule, the van's hour, both
   * addresses and the rider's details. Changes nothing.
   *
   * :param request: the ride and firstName, lastName, phone and notes
   * :return: the priced ride, the details as they would be stored and when free
   *   cancellation ends, or a refusal
   */
  checkBooking(request) {
    const result = this.book.checkPlace(RidePage.rideOf(request), RidePage.riderOf(request));
    if (result.errors) return RidePage.refusal(result.errors);
    return {
      ok: true,
      ride: RideFacts.pricedRide(result.ride, result.quote),
      rider: {
        name: `${result.rider.firstName} ${result.rider.lastName}`,
        phone: result.rider.phone,
        notes: result.rider.notes,
      },
      freeCancellationUntil: RideFacts.moment(Calendar.addMinutes(result.ride, -CabData.LEAD_MINUTES)),
    };
  }

  /**
   * Book a ride, show its code and re-price the form, whose van hour may now be
   * taken. Nothing is charged.
   *
   * :param request: the ride and firstName, lastName, phone and notes
   * :return: the new booking, or a refusal
   */
  placeRide(request) {
    const result = this.book.place(RidePage.rideOf(request), RidePage.riderOf(request));
    if (result.errors) return RidePage.refusal(result.errors);
    this.showConfirmation(result.booking);
    this.updateDraft();
    this.announce(`Ride booked. Your booking code is ${result.booking.code}.`);
    return {
      ok: true,
      booking: RideFacts.booking(result.booking),
      cancellation: RideFacts.cancellation(RideBook.cancellationTerms(result.booking)),
    };
  }

  /**
   * Show a new booking and its code in the confirmation box.
   *
   * :param booking: the booking
   */
  showConfirmation(booking) {
    const confirmation = this.byId("confirmation");
    confirmation.replaceChildren(
      this.element("h3", `Booked! Your code is ${booking.code}.`),
      this.summary(booking, true),
      this.element("p", "Nothing has been charged: you pay the driver. Keep your code to look up or cancel the ride."),
    );
    confirmation.hidden = false;
    this.confirmedCode = booking.code;
  }

  /**
   * Look up the ride named in the Manage my ride form.
   *
   * :param event: the form's submit event
   */
  findRide(event) {
    event.preventDefault();
    const code = this.value("manage-code");
    const lastName = this.value("manage-lastName");
    const result = this.book.lookUp(code, lastName);
    this.showRide(result, code, lastName);
    if (result.errors) this.focusFirstError("manage", RidePage.MANAGE_FIELDS, result.errors);
  }

  /**
   * Find a ride by code and last name, without changing the Manage my ride panel.
   *
   * :param code: the booking code
   * :param lastName: the last name on the booking
   * :return: the ride and whether it can still be cancelled for free, or a refusal
   */
  lookUpRide(code, lastName) {
    const result = this.book.lookUp(code, lastName);
    if (result.errors) return RidePage.refusal(result.errors);
    return {
      ok: true,
      booking: RideFacts.booking(result.booking),
      cancellation: RideFacts.cancellation(result.cancellation),
    };
  }

  /**
   * Check a cancellation without making it. Changes nothing.
   *
   * :param code: the booking code
   * :param lastName: the last name on the booking
   * :return: the ride and its terms, or a refusal
   */
  checkCancel(code, lastName) {
    const result = this.book.checkCancel(code, lastName);
    if (result.errors) return RidePage.refusal(result.errors);
    return {
      ok: true,
      booking: RideFacts.booking(result.booking),
      cancellation: RideFacts.cancellation(result.cancellation),
    };
  }

  /**
   * Cancel a ride for free, then re-price the form (the van's hour may be free
   * again), clear the confirmation box if it showed this ride, and show the ride
   * in the Manage my ride panel.
   *
   * :param code: the booking code
   * :param lastName: the last name on the booking
   * :return: the cancelled ride, or a refusal
   */
  cancelRide(code, lastName) {
    const result = this.book.cancel(code, lastName);
    if (result.errors) return RidePage.refusal(result.errors);
    this.updateDraft();
    if (result.booking.code === this.confirmedCode) this.hideConfirmation();
    this.showRide(result, code, lastName);
    return {
      ok: true,
      booking: RideFacts.booking(result.booking),
      cancellation: RideFacts.cancellation(result.cancellation),
    };
  }

  /**
   * Cancel the ride the panel shows, from its own button.
   *
   * :param code: the booking code the visitor entered
   * :param lastName: the last name the visitor entered
   */
  cancelFromPanel(code, lastName) {
    const receipt = this.cancelRide(code, lastName);
    if (!receipt.ok) {
      this.showRide({ errors: receipt.errors }, code, lastName);
      this.focusFirstError("manage", RidePage.MANAGE_FIELDS, receipt.errors);
      return;
    }
    // The cancel button is gone, so move focus to the updated ride.
    this.byId("manage-result").focus();
  }

  /**
   * Clear and hide the confirmation box after its ride is cancelled.
   */
  hideConfirmation() {
    const confirmation = this.byId("confirmation");
    confirmation.replaceChildren();
    confirmation.hidden = true;
    this.confirmedCode = null;
  }

  /**
   * Show a looked-up or cancelled ride with its cancellation note, and a cancel
   * button while it can be cancelled for free. Show the messages instead when
   * the look-up was refused.
   *
   * :param result: the result of lookUp or cancel
   * :param code: the booking code the visitor entered
   * :param lastName: the last name the visitor entered
   */
  showRide(result, code, lastName) {
    const box = this.byId("manage-result");
    box.replaceChildren();
    this.managedCode = null;
    if (this.showErrors("manage", RidePage.MANAGE_FIELDS, result.errors)) return;
    const booking = result.booking;
    const terms = result.cancellation;
    box.append(this.element("h3", `Ride ${booking.code}: ${booking.status}`), this.summary(booking, true));
    box.append(this.element("p", terms.note));
    if (terms.free) {
      box.append(this.button("Cancel this ride", this.cancelFromPanel.bind(this, code, lastName)));
    }
    this.managedCode = booking.code;
    this.announce(`Ride ${booking.code} is ${booking.status}. ${terms.note}`);
  }

  /**
   * Describe a booking: name, pick-up, route, passengers, car, seats and fare.
   *
   * :param booking: the booking
   * :param withName: true to start with the rider's name
   * :return: a description list
   */
  summary(booking, withName) {
    const list = this.element("dl", "", "summary");
    for (const pair of RideFacts.summaryRows(booking.ride, withName ? booking.rider : null, booking.fare)) {
      list.append(this.element("dt", pair[0]), this.element("dd", pair[1]));
    }
    return list;
  }

  /**
   * Turn the ride book's errors into a refusal the assistant can read: every
   * message in reason, the first field in field, and the messages by field.
   *
   * :param errors: messages by field name
   * :return: the refusal
   */
  static refusal(errors) {
    return {
      ok: false,
      reason: Object.values(errors).join(" "),
      field: Object.keys(errors)[0],
      errors: Object.assign({}, errors),
    };
  }

  /**
   * Take the ride out of a request. Missing places become "" and missing child seats 0.
   *
   * :param request: the request
   * :return: the ride
   */
  static rideOf(request) {
    return RideBook.copyRide({
      from: request.from,
      fromPlace: request.fromPlace,
      to: request.to,
      toPlace: request.toPlace,
      date: request.date,
      time: request.time,
      passengers: request.passengers,
      carType: request.carType,
      childSeats: request.childSeats,
    });
  }

  /**
   * Take the rider's details out of a request.
   *
   * :param request: the request
   * :return: firstName, lastName, phone and notes
   */
  static riderOf(request) {
    return {
      firstName: request.firstName,
      lastName: request.lastName,
      phone: request.phone,
      notes: request.notes,
    };
  }

  /**
   * Show each field's message under it and mark it invalid, or clear both. Every
   * field has its own message element in index.html.
   *
   * :param prefix: the id prefix of the form's fields, such as "ride"
   * :param fields: the form's field names
   * :param errors: messages by field name, or null to clear them all
   * :return: true when there were messages to show
   */
  showErrors(prefix, fields, errors) {
    let shown = false;
    for (const field of fields) {
      const message = errors && Object.hasOwn(errors, field) ? errors[field] : "";
      const input = this.byId(`${prefix}-${field}`);
      const note = this.byId(`${prefix}-${field}-error`);
      note.textContent = message;
      note.hidden = !message;
      if (message) {
        input.setAttribute("aria-invalid", "true");
        shown = true;
      } else {
        input.removeAttribute("aria-invalid");
      }
    }
    if (shown) this.announce(`Please check the form. ${Object.values(errors).join(" ")}`);
    return shown;
  }

  /**
   * Move focus to the first field with a message, in page order.
   *
   * :param prefix: the id prefix of the form's fields
   * :param fields: the form's field names, in page order
   * :param errors: messages by field name
   */
  focusFirstError(prefix, fields, errors) {
    for (const field of fields) {
      if (errors && Object.hasOwn(errors, field)) {
        this.byId(`${prefix}-${field}`).focus();
        return;
      }
    }
  }

  /**
   * Make a button that calls a handler when clicked.
   *
   * :param text: the button's label
   * :param handler: the bound method to call
   * :return: the button
   */
  button(text, handler) {
    const button = this.element("button", text);
    button.type = "button";
    button.addEventListener("click", handler);
    return button;
  }

  /**
   * Make an element. Text goes in textContent, so visitor input is never read as HTML.
   *
   * :param tag: the tag name
   * :param text: the text, or an empty string
   * :param className: the class name, if any
   * :return: the element
   */
  element(tag, text, className) {
    const node = this.doc.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  /**
   * Find an element by its id.
   *
   * :param id: the id
   * :return: the element
   */
  byId(id) {
    return this.doc.getElementById(id);
  }

  /**
   * Read a form field's value without surrounding spaces.
   *
   * :param id: the field's id
   * :return: the trimmed value
   */
  value(id) {
    return this.byId(id).value.trim();
  }

  /**
   * Announce a message in the page's live status region.
   *
   * :param message: the message
   */
  announce(message) {
    this.byId("status").textContent = message;
  }
}

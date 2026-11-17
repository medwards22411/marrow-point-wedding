import { CabData } from "./cab-data.js";
import { Calendar } from "./calendar.js";

/**
 * The booking rules for a ride and the rider's details, with the messages the
 * booking form shows. Each check returns errors: a message by form field name,
 * in the order the booking form shows the fields. No errors means it passed.
 *
 * The van's hourly limit needs the other bookings, so RideBook checks it.
 */
export class RideRules {
  /** The booking form's fields, in page order. Errors follow this order. */
  static FIELDS = [
    "from",
    "fromPlace",
    "to",
    "toPlace",
    "date",
    "time",
    "passengers",
    "childSeats",
    "carType",
    "firstName",
    "lastName",
    "phone",
    "notes",
  ];

  /**
   * Put errors in the booking form's field order, so the first one is the first on the page.
   *
   * :param errors: messages by field name
   * :return: the same messages, in page order
   */
  static ordered(errors) {
    const sorted = {};
    for (const field of RideRules.FIELDS) {
      if (Object.hasOwn(errors, field)) sorted[field] = errors[field];
    }
    return sorted;
  }

  /**
   * The earliest pick-up the site books now: two hours from now, on the next quarter hour.
   *
   * :return: {date, time}
   */
  static earliestPickUp() {
    return Calendar.roundUp(Calendar.addMinutes(Calendar.now(), CabData.LEAD_MINUTES), CabData.SLOT_MINUTES);
  }

  /**
   * The last date the site books online.
   *
   * :return: the date as "YYYY-MM-DD"
   */
  static lastBookableDate() {
    return Calendar.addDays(Calendar.today(), CabData.MAX_DAYS_AHEAD);
  }

  /**
   * Check a ride: route, pick-up date and time, passengers, car and child seats,
   * and, when asked, both addresses.
   *
   * :param ride: from, fromPlace, to, toPlace, date, time, passengers, carType and childSeats
   * :param withPlaces: true to check the pick-up and drop-off addresses too
   * :return: errors by field, in page order
   */
  static checkRide(ride, withPlaces) {
    const errors = {};
    RideRules.checkRoute(ride, errors);
    if (withPlaces) {
      RideRules.checkText(errors, "fromPlace", ride.fromPlace, CabData.LIMITS.place,
        "Enter the pick-up address or place.", "Keep the pick-up address to 80 characters.");
      RideRules.checkText(errors, "toPlace", ride.toPlace, CabData.LIMITS.place,
        "Enter the drop-off address or place.", "Keep the drop-off address to 80 characters.");
    }
    RideRules.checkWhen(ride, errors);
    RideRules.checkParty(ride, errors);
    return RideRules.ordered(errors);
  }

  /**
   * Check that both zones exist and that we drive between them.
   *
   * :param ride: the ride
   * :param errors: the errors to add to
   */
  static checkRoute(ride, errors) {
    const from = CabData.findById(CabData.ZONES, ride.from);
    const to = CabData.findById(CabData.ZONES, ride.to);
    if (!from) errors.from = "Choose where to pick you up.";
    if (!to) errors.to = "Choose where you're going.";
    if (from && to && !CabData.findRoute(from.id, to.id)) {
      errors.to = `We don't drive from ${from.name} to ${to.name}. Rides start or end in Marrow Point, or run between Linden Falls and the airport.`;
    }
  }

  /**
   * Check the pick-up date and time: real, on a quarter hour, at least two hours
   * from now and at most 90 days ahead.
   *
   * :param ride: the ride
   * :param errors: the errors to add to
   */
  static checkWhen(ride, errors) {
    const date = ride.date === undefined || ride.date === null ? "" : String(ride.date).trim();
    const time = ride.time === undefined || ride.time === null ? "" : String(ride.time).trim();
    const contact = CabData.CONTACT.phone;
    let dateOk = false;
    if (!date) {
      errors.date = "Enter the pick-up date.";
    } else if (!Calendar.isDate(date)) {
      errors.date = "Enter the pick-up date as YYYY-MM-DD.";
    } else if (date < Calendar.today()) {
      errors.date = "That pick-up date is in the past.";
    } else if (date > RideRules.lastBookableDate()) {
      errors.date = `We book online up to ${CabData.MAX_DAYS_AHEAD} days ahead, until ${Calendar.format(RideRules.lastBookableDate())}. For a later ride, call us on ${contact}.`;
    } else {
      dateOk = true;
    }
    if (!time) {
      errors.time = "Enter the pick-up time.";
    } else if (!Calendar.isTime(time)) {
      errors.time = "Enter the pick-up time as HH:MM, such as 10:15.";
    } else if (Calendar.minutesOf(time) % CabData.SLOT_MINUTES !== 0) {
      errors.time = "Pick-up times are on the quarter hour, such as 10:00, 10:15, 10:30 or 10:45.";
    } else if (dateOk && Calendar.minutesBetween(RideRules.earliestPickUp(), { date, time }) < 0) {
      errors.time = `Book at least 2 hours ahead: the earliest pick-up now is ${Calendar.formatMoment(RideRules.earliestPickUp())}. For a sooner ride, call us on ${contact}.`;
    }
  }

  /**
   * Check the passengers, the car and the child seats, and that the party fits the car.
   *
   * :param ride: the ride
   * :param errors: the errors to add to
   */
  static checkParty(ride, errors) {
    const passengers = ride.passengers;
    const car = CabData.findById(CabData.CAR_TYPES, ride.carType);
    const seats = ride.childSeats === undefined ? 0 : ride.childSeats;
    let partyOk = false;
    if (!Number.isInteger(passengers) || passengers < 1) {
      errors.passengers = "Enter the number of passengers, at least 1.";
    } else if (passengers > CabData.MAX_PASSENGERS) {
      errors.passengers = `Our largest car takes ${CabData.MAX_PASSENGERS} passengers. For a bigger group, book two rides.`;
    } else {
      partyOk = true;
    }
    if (!car) {
      errors.carType = "Choose a car.";
    } else if (partyOk && passengers > car.seats) {
      errors.carType = `The ${car.name.toLowerCase()} takes up to ${car.seats} passengers.${RideRules.biggerCar(passengers)}`;
    }
    if (!Number.isInteger(seats) || seats < 0) {
      errors.childSeats = `Enter the number of child seats, 0 to ${CabData.MAX_CHILD_SEATS}.`;
    } else if (seats > CabData.MAX_CHILD_SEATS) {
      errors.childSeats = `We have up to ${CabData.MAX_CHILD_SEATS} child seats per ride.`;
    } else if (partyOk && seats > passengers) {
      errors.childSeats = `Each child seat needs a passenger: ${passengers} can't use ${seats} seats.`;
    }
  }

  /**
   * Suggest a car that fits a party, other than the van, which has one wheelchair space.
   *
   * :param passengers: the party size
   * :return: a sentence that starts with a space, or "" when none fits
   */
  static biggerCar(passengers) {
    for (const car of CabData.CAR_TYPES) {
      if (car.id !== CabData.VAN_ID && car.seats >= passengers) {
        return ` The ${car.name.toLowerCase()} takes up to ${car.seats}.`;
      }
    }
    return "";
  }

  /**
   * Check the rider's details: first and last name, phone and notes.
   *
   * :param rider: the details, already trimmed by cleanRider
   * :return: errors by field, in page order
   */
  static checkRider(rider) {
    const errors = {};
    RideRules.checkText(errors, "firstName", rider.firstName, CabData.LIMITS.name,
      "Enter your first name.", "Keep your first name to 60 characters.");
    RideRules.checkText(errors, "lastName", rider.lastName, CabData.LIMITS.name,
      "Enter your last name.", "Keep your last name to 60 characters.");
    const phone = rider.phone;
    if (!phone) {
      errors.phone = "Enter a phone number, so the driver can reach you.";
    } else if (!/^[0-9 +().-]+$/.test(phone)) {
      errors.phone = "Use only digits, spaces and + ( ) . - in the phone number.";
    } else if (phone.replace(/\D/g, "").length < 7) {
      errors.phone = "Enter a phone number with at least 7 digits.";
    } else if (phone.length > CabData.LIMITS.phone) {
      errors.phone = "Keep the phone number to 20 characters.";
    }
    if (rider.notes.length > CabData.LIMITS.notes) {
      errors.notes = "Keep notes to 300 characters.";
    }
    return RideRules.ordered(errors);
  }

  /**
   * Check one required text field: present and not too long.
   *
   * :param errors: the errors to add to
   * :param field: the field name
   * :param value: the value, trimmed or not
   * :param limit: the longest value allowed
   * :param missing: the message when it is empty
   * :param tooLong: the message when it is longer than the limit
   */
  static checkText(errors, field, value, limit, missing, tooLong) {
    const text = RideRules.clean(value);
    if (!text) {
      errors[field] = missing;
    } else if (text.length > limit) {
      errors[field] = tooLong;
    }
  }

  /**
   * Trim a text value. Anything that isn't text becomes "".
   *
   * :param value: the value
   * :return: the trimmed text
   */
  static clean(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  /**
   * Trim the rider's details, as the booking form does. Missing notes become "".
   *
   * :param rider: firstName, lastName, phone and notes
   * :return: the trimmed details
   */
  static cleanRider(rider) {
    const given = rider || {};
    return {
      firstName: RideRules.clean(given.firstName),
      lastName: RideRules.clean(given.lastName),
      phone: RideRules.clean(given.phone),
      notes: RideRules.clean(given.notes),
    };
  }
}

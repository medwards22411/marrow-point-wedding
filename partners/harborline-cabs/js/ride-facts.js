import { CabData } from "./cab-data.js";
import { Calendar } from "./calendar.js";
import { FareCalculator } from "./fare-calculator.js";
import { RideRules } from "./ride-rules.js";

/**
 * Turns Harborline Cabs' data, fares and bookings into plain JSON with the
 * words, dates and amounts the page shows. The page renders from it, and the
 * assistant reads it, so both say the same thing.
 */
export class RideFacts {
  /**
   * Describe a date with its weekday.
   *
   * :param iso: the date as "YYYY-MM-DD"
   * :return: the date and a label such as "Tue, Nov 17, 2026"
   */
  static day(iso) {
    return {
      date: iso,
      label: Calendar.format(iso),
    };
  }

  /**
   * Describe a date and time.
   *
   * :param moment: {date, time}
   * :return: the date, time and a label such as "Tue, Nov 17, 2026 at 10:30"
   */
  static moment(moment) {
    return {
      date: moment.date,
      time: moment.time,
      label: Calendar.formatMoment(moment),
    };
  }

  /**
   * List the zones.
   *
   * :return: id, name and description of each zone
   */
  static zones() {
    const zones = [];
    for (const zone of CabData.ZONES) {
      zones.push({
        id: zone.id,
        name: zone.name,
        description: zone.description,
      });
    }
    return zones;
  }

  /**
   * Name a route in words, such as "Marrow Point and Port Hollis airport (PHL-X)".
   *
   * :param route: the route
   * :return: the route's name
   */
  static routeName(route) {
    const [a, b] = route.zones;
    if (a === b) return `Within ${CabData.findById(CabData.ZONES, a).name}`;
    return `${CabData.findById(CabData.ZONES, a).name} and ${CabData.findById(CabData.ZONES, b).name}`;
  }

  /**
   * List the fixed fares for a standard car, one per route, either way.
   *
   * :return: the zones, the route's name, the fare and the usual drive time of each route
   */
  static fares() {
    const fares = [];
    for (const route of CabData.ROUTES) {
      fares.push({
        zones: route.zones.slice(),
        route: RideFacts.routeName(route),
        fare: FareCalculator.money(route.fareCents),
        fareCents: route.fareCents,
        driveMinutes: route.minutes,
      });
    }
    return fares;
  }

  /**
   * Describe a car's extra charge.
   *
   * :param car: the car
   * :return: "No extra charge" or the extra per ride
   */
  static carExtra(car) {
    return car.extraCents === 0 ? "No extra charge" : `${FareCalculator.money(car.extraCents)} extra per ride`;
  }

  /**
   * List the cars.
   *
   * :return: id, name, passenger seats, extra charge and luggage of each car
   */
  static cars() {
    const cars = [];
    for (const car of CabData.CAR_TYPES) {
      cars.push({
        id: car.id,
        name: car.name,
        passengers: car.seats,
        extra: RideFacts.carExtra(car),
        luggage: car.luggage,
      });
    }
    return cars;
  }

  /**
   * Describe the booking terms: surcharges, child seats, pick-up times, the van's
   * hourly limit, how far ahead to book and the cancellation rule.
   *
   * :return: the terms
   */
  static terms() {
    const standing = [];
    for (const hour of CabData.VAN_STANDING_HOURS) standing.push(`${Calendar.pad(hour)}:00 to ${Calendar.pad(hour + 1)}:00`);
    return {
      nightSurcharge: {
        from: CabData.NIGHT.startsAt,
        until: CabData.NIGHT.endsAt,
        amount: FareCalculator.money(CabData.NIGHT.surchargeCents),
        rule: `Rides picked up from ${CabData.NIGHT.startsAt} up to ${CabData.NIGHT.endsAt} cost ${FareCalculator.money(CabData.NIGHT.surchargeCents)} more.`,
      },
      childSeats: `Free on request, up to ${CabData.MAX_CHILD_SEATS} per ride. Each seat needs a passenger.`,
      pickUpTimes: `Every ${CabData.SLOT_MINUTES} minutes, 24 hours a day, every day.`,
      bookAhead: `Book online at least 2 hours and at most ${CabData.MAX_DAYS_AHEAD} days before pick-up.`,
      van: `We have one wheelchair-accessible van, so it takes one ride in each clock hour. On weekdays it is out on clinic runs from ${standing.join(" and from ")}.`,
      cancellation: "Free up to 2 hours before pick-up, with your code and last name in Manage my ride. After that, call us.",
      payment: "Pay the driver in the cab, by card or cash. Nothing is paid online.",
    };
  }

  /**
   * Describe the booking window as of now.
   *
   * :return: now, the earliest pick-up the site books, and the last date it books
   */
  static bookingWindow() {
    return {
      now: RideFacts.moment(Calendar.now()),
      earliestPickUp: RideFacts.moment(RideRules.earliestPickUp()),
      lastDate: RideFacts.day(RideRules.lastBookableDate()),
    };
  }

  /**
   * Describe one end of a ride: its zone and the address, when given.
   *
   * :param zoneId: the zone id
   * :param place: the address or place, or ""
   * :return: the zone's name, followed by the place when there is one
   */
  static placeText(zoneId, place) {
    const zone = CabData.findById(CabData.ZONES, zoneId);
    const name = zone ? zone.name : String(zoneId);
    return place ? `${name}: ${place}` : name;
  }

  /**
   * Describe a priced ride: route, pick-up, party, car, fare lines and total.
   *
   * :param ride: the ride, which follows the rules
   * :param quote: its quote from FareCalculator
   * :return: the ride as plain JSON
   */
  static pricedRide(ride, quote) {
    const lines = [];
    for (const line of quote.lines) {
      lines.push({
        label: line.label,
        detail: line.detail,
        amount: FareCalculator.lineAmount(line.amount),
      });
    }
    return {
      from: RideFacts.placeText(ride.from, ride.fromPlace),
      to: RideFacts.placeText(ride.to, ride.toPlace),
      pickUp: RideFacts.moment(ride),
      passengers: ride.passengers,
      car: quote.car.name,
      childSeats: ride.childSeats,
      lines: lines,
      fare: FareCalculator.money(quote.total),
      fareCents: quote.total,
      nightSurcharge: quote.night,
      driveMinutes: quote.minutes,
    };
  }

  /**
   * Describe a booked ride for its rider: code, status, name and the priced ride.
   * It leaves out the phone number and notes, which the page never shows again.
   *
   * :param booking: the booking
   * :return: the booking as plain JSON
   */
  static booking(booking) {
    return Object.assign({
      code: booking.code,
      status: booking.status,
      name: `${booking.rider.firstName} ${booking.rider.lastName}`,
    }, RideFacts.pricedRide(booking.ride, FareCalculator.quote(booking.ride)));
  }

  /**
   * Describe the cancellation terms of a booking.
   *
   * :param terms: the result of RideBook.cancellationTerms
   * :return: whether it can be cancelled free now, until when, and the page's note
   */
  static cancellation(terms) {
    return {
      freeNow: terms.free,
      freeUntil: RideFacts.moment(terms.deadline),
      fee: "None",
      note: terms.note,
    };
  }

  /**
   * List the rows of a ride summary, as the page shows them.
   *
   * :param ride: the ride
   * :param rider: the rider's details, or null
   * :param total: the fare in cents
   * :return: [label, value] pairs
   */
  static summaryRows(ride, rider, total) {
    const car = CabData.findById(CabData.CAR_TYPES, ride.carType);
    const rows = [];
    if (rider) rows.push(["Name", `${rider.firstName} ${rider.lastName}`]);
    rows.push(
      ["Pick-up", Calendar.formatMoment(ride)],
      ["From", RideFacts.placeText(ride.from, ride.fromPlace)],
      ["To", RideFacts.placeText(ride.to, ride.toPlace)],
      ["Passengers", String(ride.passengers)],
      ["Car", car.name],
      ["Child seats", ride.childSeats ? `${ride.childSeats} (free)` : "None"],
      ["Fare", `${FareCalculator.money(total)}, paid in the cab`],
    );
    return rows;
  }

  /**
   * Make text readable on one line: collapse runs of spaces and line breaks.
   *
   * :param text: the text
   * :return: the text on one line
   */
  static plain(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }
}

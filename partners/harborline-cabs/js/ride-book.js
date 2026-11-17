import { CabData } from "./cab-data.js";
import { Calendar } from "./calendar.js";
import { FareCalculator } from "./fare-calculator.js";
import { RideRules } from "./ride-rules.js";

/**
 * Keeps Harborline Cabs' booked rides in memory and runs the ride operations:
 * quote, place, look up and cancel.
 *
 * Each operation returns an object. When the input breaks a rule, it holds only
 * errors, which maps form field names to messages. Reloading the page starts
 * again from the existing rides in CabData. Nothing is paid online.
 */
export class RideBook {
  /**
   * Create the book with the existing rides, dated from today.
   */
  constructor() {
    this.rides = [];
    for (const existing of CabData.EXISTING_RIDES) {
      const ride = RideBook.copyRide({
        from: existing.from,
        fromPlace: existing.fromPlace,
        to: existing.to,
        toPlace: existing.toPlace,
        date: Calendar.addDays(Calendar.today(), existing.daysFromToday),
        time: existing.time,
        passengers: existing.passengers,
        carType: existing.carType,
        childSeats: existing.childSeats,
      });
      const rider = RideRules.cleanRider(existing);
      this.rides.push(RideBook.record(existing.code, ride, rider));
    }
  }

  /**
   * Build a confirmed booking with its fare.
   *
   * :param code: the booking code
   * :param ride: the ride
   * :param rider: the rider's trimmed details
   * :return: the booking
   */
  static record(code, ride, rider) {
    return {
      code: code,
      status: "confirmed",
      ride: ride,
      rider: rider,
      fare: FareCalculator.quote(ride).total,
    };
  }

  /**
   * Copy a ride's fields. Places are trimmed, and missing child seats mean none.
   *
   * :param ride: from, fromPlace, to, toPlace, date, time, passengers, carType and childSeats
   * :return: the copy
   */
  static copyRide(ride) {
    const given = ride || {};
    return {
      from: given.from,
      fromPlace: RideRules.clean(given.fromPlace),
      to: given.to,
      toPlace: RideRules.clean(given.toPlace),
      date: typeof given.date === "string" ? given.date.trim() : given.date,
      time: typeof given.time === "string" ? given.time.trim() : given.time,
      passengers: given.passengers,
      carType: given.carType,
      childSeats: given.childSeats === undefined ? 0 : given.childSeats,
    };
  }

  /**
   * Tell why the van can't take a ride in one clock hour, if it can't.
   *
   * :param date: the date
   * :param hour: the clock hour, 0 to 23
   * :return: "standing" for a weekday clinic run, "booked" for another ride, or null when free
   */
  vanBusy(date, hour) {
    if (!Calendar.isWeekend(date) && CabData.VAN_STANDING_HOURS.includes(hour)) return "standing";
    for (const booking of this.rides) {
      if (booking.status === "confirmed" && booking.ride.carType === CabData.VAN_ID
        && booking.ride.date === date && Math.floor(Calendar.minutesOf(booking.ride.time) / 60) === hour) {
        return "booked";
      }
    }
    return null;
  }

  /**
   * List the hours on a date when the van is free and a pick-up can still be booked.
   *
   * :param date: the date
   * :return: the clock hours, 0 to 23
   */
  vanFreeHours(date) {
    const earliest = RideRules.earliestPickUp();
    const hours = [];
    for (let hour = 0; hour < 24; hour += 1) {
      const lastSlot = { date: date, time: `${Calendar.pad(hour)}:45` };
      if (this.vanBusy(date, hour) === null && Calendar.minutesBetween(earliest, lastSlot) >= 0) hours.push(hour);
    }
    return hours;
  }

  /**
   * Describe one clock hour, such as "14:00 to 15:00".
   *
   * :param hour: the clock hour
   * :return: the hour as text
   */
  static hourText(hour) {
    return `${Calendar.pad(hour)}:00 to ${Calendar.pad((hour + 1) % 24)}:00`;
  }

  /**
   * Explain that the van is taken, with the nearest free hours that day.
   *
   * :param date: the date
   * :param hour: the clock hour asked for
   * :return: the message
   */
  vanMessage(date, hour) {
    const free = this.vanFreeHours(date);
    // The two free hours closest to the one asked for, earlier first on a tie.
    free.sort((a, b) => Math.abs(a - hour) - Math.abs(b - hour) || a - b);
    const nearest = free.slice(0, 2).sort((a, b) => a - b);
    let message = `The wheelchair-accessible van is already out from ${RideBook.hourText(hour)} on ${Calendar.format(date)}.`;
    if (nearest.length === 0) {
      message += ` Please call us on ${CabData.CONTACT.phone}.`;
    } else {
      const parts = [];
      for (const freeHour of nearest) parts.push(`from ${RideBook.hourText(freeHour)}`);
      message += ` It's free ${parts.join(" and ")} that day.`;
    }
    return message;
  }

  /**
   * Price a ride after checking the rules and that the van is free, when it's the van.
   *
   * :param ride: the ride; its addresses are not checked
   * :return: errors, or the quote
   */
  quote(ride) {
    const draft = RideBook.copyRide(ride);
    const errors = RideRules.checkRide(draft, false);
    if (Object.keys(errors).length > 0) return { errors };
    const vanError = this.vanError(draft);
    if (vanError) return { errors: vanError };
    return { quote: FareCalculator.quote(draft) };
  }

  /**
   * Check the van's hourly limit for a ride that follows every other rule.
   *
   * :param ride: the ride
   * :return: errors for the car field, or null when the car is free
   */
  vanError(ride) {
    const hour = Math.floor(Calendar.minutesOf(ride.time) / 60);
    if (ride.carType === CabData.VAN_ID && this.vanBusy(ride.date, hour) !== null) {
      return { carType: this.vanMessage(ride.date, hour) };
    }
    return null;
  }

  /**
   * Check a booking without placing it or changing anything: every ride rule,
   * both addresses, the van's hour and the rider's details. place() runs this first.
   *
   * :param ride: the ride
   * :param rider: firstName, lastName, phone and notes
   * :return: errors, or the ride, rider and quote that place() would store
   */
  checkPlace(ride, rider) {
    const draft = RideBook.copyRide(ride);
    const details = RideRules.cleanRider(rider);
    const errors = RideRules.checkRide(draft, true);
    // The van's hour only matters once the ride itself is valid, as in quote().
    if (Object.keys(RideRules.checkRide(draft, false)).length === 0) Object.assign(errors, this.vanError(draft));
    Object.assign(errors, RideRules.checkRider(details));
    if (Object.keys(errors).length > 0) return { errors: RideRules.ordered(errors) };
    return {
      ride: draft,
      rider: details,
      quote: FareCalculator.quote(draft),
    };
  }

  /**
   * Book a ride. Nothing is paid now: the rider pays in the cab.
   *
   * :param ride: the ride
   * :param rider: the rider's details
   * :return: errors, or the new booking with its code
   */
  place(ride, rider) {
    const checked = this.checkPlace(ride, rider);
    if (checked.errors) return checked;
    const booking = RideBook.record(this.newCode(), checked.ride, checked.rider);
    this.rides.push(booking);
    return { booking };
  }

  /**
   * Look up a booking by code and last name. Both are required.
   *
   * :param code: the booking code, in any letter case
   * :param lastName: the last name on the booking, in any letter case
   * :return: errors, or the booking and whether it can still be cancelled for free
   */
  lookUp(code, lastName) {
    const wantedCode = String(code || "").trim().toUpperCase();
    const wantedName = String(lastName || "").trim().toLowerCase();
    const errors = {};
    if (!wantedCode) errors.code = "Enter your booking code.";
    if (!wantedName) errors.lastName = "Enter the last name on the booking.";
    if (Object.keys(errors).length > 0) return { errors };
    for (const booking of this.rides) {
      if (booking.code === wantedCode && booking.rider.lastName.toLowerCase() === wantedName) {
        return {
          booking: booking,
          cancellation: RideBook.cancellationTerms(booking),
        };
      }
    }
    return { errors: { code: "We couldn't find a ride with that code and last name." } };
  }

  /**
   * Check a cancellation without making it or changing anything. cancel() runs this first.
   *
   * :param code: the booking code
   * :param lastName: the last name on the booking
   * :return: errors, or the booking and its cancellation terms
   */
  checkCancel(code, lastName) {
    const found = this.lookUp(code, lastName);
    if (found.errors) return found;
    if (found.booking.status === "cancelled") return { errors: { code: "This ride is already cancelled." } };
    if (!found.cancellation.free) return { errors: { code: found.cancellation.note } };
    return found;
  }

  /**
   * Cancel a ride, free of charge, up to two hours before pick-up.
   *
   * :param code: the booking code
   * :param lastName: the last name on the booking
   * :return: errors, or the cancelled booking and its terms
   */
  cancel(code, lastName) {
    const found = this.checkCancel(code, lastName);
    if (found.errors) return found;
    found.booking.status = "cancelled";
    return {
      booking: found.booking,
      cancellation: RideBook.cancellationTerms(found.booking),
    };
  }

  /**
   * Apply the cancellation rule to a booking as of now: free up to two hours
   * before pick-up, and not online after that.
   *
   * :param booking: the booking
   * :return: free (true or false), the deadline and a note for the rider
   */
  static cancellationTerms(booking) {
    const pickUp = { date: booking.ride.date, time: booking.ride.time };
    const deadline = Calendar.addMinutes(pickUp, -CabData.LEAD_MINUTES);
    const left = Calendar.minutesBetween(Calendar.now(), deadline);
    const phone = CabData.CONTACT.phone;
    let note;
    if (booking.status === "cancelled") {
      note = "This ride is cancelled. Nothing was charged.";
    } else if (left >= 0) {
      note = `You can cancel this ride for free until ${Calendar.formatMoment(deadline)}.`;
    } else if (Calendar.minutesBetween(Calendar.now(), pickUp) > 0) {
      note = `Pick-up is less than 2 hours away, so this ride can't be cancelled online. Please call us on ${phone}.`;
    } else {
      note = `This ride's pick-up time has passed. For questions, call us on ${phone}.`;
    }
    return {
      free: booking.status === "confirmed" && left >= 0,
      deadline: deadline,
      note: note,
    };
  }

  /**
   * Make a booking code that no other ride uses.
   *
   * :return: a code such as "HC-7KQ2"
   */
  newCode() {
    // Leave out 0, O, 1 and I, which are easy to mix up.
    const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "HC-";
    while (code.length < 7) code += letters[Math.floor(Math.random() * letters.length)];
    for (const booking of this.rides) {
      if (booking.code === code) return this.newCode();
    }
    return code;
  }
}

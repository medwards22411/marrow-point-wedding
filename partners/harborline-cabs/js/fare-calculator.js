import { CabData } from "./cab-data.js";
import { Calendar } from "./calendar.js";

/**
 * Works out a ride's fare, line by line, from the fixed route fares, the car's
 * extra, the night surcharge and the free child seats. Amounts are integer cents.
 *
 * It does not check the ride: RideRules does that first.
 */
export class FareCalculator {
  /**
   * Tell whether a pick-up time falls in the night surcharge hours.
   *
   * :param time: the pick-up time as "HH:MM"
   * :return: true from 22:00 up to 05:59
   */
  static isNight(time) {
    const minutes = Calendar.minutesOf(time);
    return minutes >= Calendar.minutesOf(CabData.NIGHT.startsAt) || minutes < Calendar.minutesOf(CabData.NIGHT.endsAt);
  }

  /**
   * Price a ride that follows the rules.
   *
   * :param ride: from, to, time, carType and childSeats
   * :return: the route, car, lines (label, detail, amount) and total in cents
   */
  static quote(ride) {
    const route = CabData.findRoute(ride.from, ride.to);
    const car = CabData.findById(CabData.CAR_TYPES, ride.carType);
    const from = CabData.findById(CabData.ZONES, ride.from);
    const to = CabData.findById(CabData.ZONES, ride.to);
    const lines = [
      {
        label: "Fixed fare",
        detail: `${from.name} to ${to.name}`,
        amount: route.fareCents,
      },
    ];
    if (car.extraCents > 0) {
      lines.push({
        label: car.name,
        detail: `Up to ${car.seats} passengers`,
        amount: car.extraCents,
      });
    }
    const night = FareCalculator.isNight(ride.time);
    if (night) {
      lines.push({
        label: "Night surcharge",
        detail: `Pick-up from ${CabData.NIGHT.startsAt} to ${CabData.NIGHT.endsAt}`,
        amount: CabData.NIGHT.surchargeCents,
      });
    }
    const seats = ride.childSeats || 0;
    if (seats > 0) {
      lines.push({
        label: "Child seats",
        detail: FareCalculator.count(seats, "seat"),
        amount: 0,
      });
    }
    let total = 0;
    for (const line of lines) total += line.amount;
    return {
      route: route,
      car: car,
      night: night,
      minutes: route.minutes,
      lines: lines,
      total: total,
    };
  }

  /**
   * Write an amount in cents as dollars, such as "$68.00", or "Free" for nothing.
   *
   * :param cents: the amount in cents
   * :return: the amount as text
   */
  static money(cents) {
    return `$${(cents / 100).toFixed(2)}`;
  }

  /**
   * Write an amount for a fare line: "Free" for nothing, dollars otherwise.
   *
   * :param cents: the amount in cents
   * :return: the amount as text
   */
  static lineAmount(cents) {
    return cents === 0 ? "Free" : FareCalculator.money(cents);
  }

  /**
   * Write a count with its noun, such as "1 seat" or "2 seats".
   *
   * :param count: the number
   * :param noun: the singular noun
   * :return: the count and noun
   */
  static count(count, noun) {
    return `${count} ${noun}${count === 1 ? "" : "s"}`;
  }
}

/**
 * Harborline Cabs' zones, fares, cars, booking limits and existing rides.
 *
 * Amounts are integer cents. Everything here is fictional demo data. The page,
 * the fare calculator and the ride rules all read from this one place, so a
 * fare changed here changes everywhere.
 */
export class CabData {
  /** Where the cabs go. Every ride starts in one zone and ends in another (or the same) zone. */
  static ZONES = [
    {
      id: "town",
      name: "Marrow Point",
      short: "Town",
      description: "Anywhere in Marrow Point: the harbor, the ferry slip, the old town and the hill.",
    },
    {
      id: "linden",
      name: "Linden Falls",
      short: "Linden Falls",
      description: "The neighboring village, about 15 minutes up the valley road.",
    },
    {
      id: "airport",
      name: "Port Hollis airport (PHL-X)",
      short: "Airport",
      description: "Port Hollis airport, about 50 minutes' drive. We drop off at departures and meet you at arrivals.",
    },
  ];

  /**
   * Fixed fares for a standard car, in cents, by route. A route works in both
   * directions. Routes not listed here are not driven.
   */
  static ROUTES = [
    {
      zones: ["town", "town"],
      fareCents: 1200,
      minutes: 10,
    },
    {
      zones: ["town", "linden"],
      fareCents: 2600,
      minutes: 15,
    },
    {
      zones: ["town", "airport"],
      fareCents: 6800,
      minutes: 50,
    },
    {
      zones: ["linden", "airport"],
      fareCents: 7400,
      minutes: 55,
    },
  ];

  /** The cars. The extra is added to the route's fare once per ride. */
  static CAR_TYPES = [
    {
      id: "standard",
      name: "Standard car",
      seats: 4,
      extraCents: 0,
      luggage: "Room for 2 large suitcases and 2 small bags.",
    },
    {
      id: "large",
      name: "Large car",
      seats: 6,
      extraCents: 1000,
      luggage: "Room for 5 large suitcases, or a folded pram and bags.",
    },
    {
      id: "accessible",
      name: "Wheelchair-accessible van",
      seats: 4,
      extraCents: 0,
      luggage: "A ramp and space for one wheelchair, plus 2 large suitcases. We have one van, so it takes one ride per hour.",
    },
  ];

  /** The car that the page books at most once in each clock hour. */
  static VAN_ID = "accessible";

  /**
   * Hours the van is already out on its standing weekday clinic runs, as clock
   * hours on Monday to Friday. A ride starting in one of these hours can't use the van.
   */
  static VAN_STANDING_HOURS = [8, 15];

  /** The night surcharge: added to rides that start from 22:00 up to 05:59. */
  static NIGHT = {
    startsAt: "22:00",
    endsAt: "06:00",
    surchargeCents: 600,
  };

  /** Child seats are free on request, up to this many per ride. */
  static MAX_CHILD_SEATS = 2;

  /** The largest party any one car takes. */
  static MAX_PASSENGERS = 6;

  /** Pick-up times are on these minutes past the hour. */
  static SLOT_MINUTES = 15;

  /** Book at least this many minutes before pick-up. Free cancellation ends at the same point. */
  static LEAD_MINUTES = 120;

  /** Book at most this many days ahead online. */
  static MAX_DAYS_AHEAD = 90;

  /** The longest text the booking form takes in each field, as its maxlength says. */
  static LIMITS = {
    place: 80,
    name: 60,
    phone: 20,
    notes: 300,
    code: 7,
  };

  /** How to reach a dispatcher. */
  static CONTACT = {
    phone: "555-0188",
    email: "rides@example.com",
  };

  /**
   * Rides other people booked, dated from today. They hold the van in some hours,
   * and one (Pell) is the demo ride the README names for Manage my ride.
   */
  static EXISTING_RIDES = [
    {
      code: "HC-4TQ8",
      firstName: "Dana",
      lastName: "Pell",
      phone: "555-0101",
      notes: "",
      daysFromToday: 21,
      time: "10:30",
      from: "town",
      fromPlace: "14 Quay Lane",
      to: "airport",
      toPlace: "Departures",
      passengers: 2,
      carType: "standard",
      childSeats: 0,
    },
    {
      code: "HC-7MWD",
      firstName: "Rowan",
      lastName: "Teague",
      phone: "555-0102",
      notes: "Ramp at the side door, please.",
      daysFromToday: 3,
      time: "11:15",
      from: "linden",
      fromPlace: "Mill Row 6",
      to: "town",
      toPlace: "Harbor Clinic",
      passengers: 2,
      carType: "accessible",
      childSeats: 0,
    },
    {
      code: "HC-9XRB",
      firstName: "Maren",
      lastName: "Holt",
      phone: "555-0103",
      notes: "",
      daysFromToday: 5,
      time: "18:00",
      from: "airport",
      fromPlace: "Arrivals",
      to: "town",
      toPlace: "The Lantern Inn",
      passengers: 5,
      carType: "large",
      childSeats: 2,
    },
  ];

  /**
   * Find an item by id in one of the lists above.
   *
   * :param list: the list to search
   * :param id: the id
   * :return: the item, or null when no item has that id
   */
  static findById(list, id) {
    for (const item of list) {
      if (item.id === id) return item;
    }
    return null;
  }

  /**
   * Find the route between two zones, in either direction.
   *
   * :param from: the pick-up zone id
   * :param to: the drop-off zone id
   * :return: the route, or null when we don't drive it
   */
  static findRoute(from, to) {
    for (const route of CabData.ROUTES) {
      const [a, b] = route.zones;
      if ((a === from && b === to) || (a === to && b === from)) return route;
    }
    return null;
  }
}

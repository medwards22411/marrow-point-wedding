/**
 * Dates as "YYYY-MM-DD" strings in the visitor's time zone.
 *
 * today() is the only place the site reads the clock. Tests can pin the date
 * by setting Calendar.fixedToday to a "YYYY-MM-DD" string.
 */
export class Calendar {
  static fixedToday = null;

  /**
   * Return today's date in the visitor's time zone, or the pinned date.
   *
   * :return: today as "YYYY-MM-DD"
   */
  static today() {
    if (Calendar.fixedToday) return Calendar.fixedToday;
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${now.getFullYear()}-${month}-${day}`;
  }

  /**
   * Write a date the way the page shows it, such as "Saturday, June 12, 2027".
   *
   * :param iso: the date as "YYYY-MM-DD"
   * :return: the readable date
   */
  static long(iso) {
    const [year, month, day] = iso.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC",
    });
  }

  /**
   * Write a 24-hour time the way the page shows it, such as "4:00 pm".
   *
   * :param hhmm: the time as "HH:MM"
   * :return: the readable time
   */
  static time(hhmm) {
    const [hours, minutes] = hhmm.split(":").map(Number);
    const suffix = hours >= 12 ? "pm" : "am";
    const twelve = hours % 12 === 0 ? 12 : hours % 12;
    return `${twelve}:${String(minutes).padStart(2, "0")} ${suffix}`;
  }

  /**
   * Count the days from one date to another.
   *
   * :param from: the first date, "YYYY-MM-DD"
   * :param to: the second date, "YYYY-MM-DD"
   * :return: whole days, negative when to is before from
   */
  static daysBetween(from, to) {
    const start = Date.parse(`${from}T00:00:00Z`);
    const end = Date.parse(`${to}T00:00:00Z`);
    return Math.round((end - start) / 86400000);
  }
}

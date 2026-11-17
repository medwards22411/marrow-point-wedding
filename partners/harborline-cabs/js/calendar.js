/**
 * Date and time helpers for rides. Dates are "YYYY-MM-DD" strings and times
 * are "HH:MM" strings in Marrow Point's local time. Day math runs in UTC, so
 * daylight saving changes never add or drop a day.
 *
 * now() is the only place the site reads the clock. Tests pin it by setting
 * Calendar.fixedToday to a "YYYY-MM-DD" date, and Calendar.fixedTime to an
 * "HH:MM" time on that date (09:00 unless set).
 */
export class Calendar {
  /** A "YYYY-MM-DD" date to use instead of the real clock, or null. */
  static fixedToday = null;

  /** The "HH:MM" time of day to use with fixedToday. */
  static fixedTime = "09:00";

  /**
   * Return the date and time now, in the visitor's time zone, or the pinned ones.
   *
   * :return: {date: "YYYY-MM-DD", time: "HH:MM"}
   */
  static now() {
    if (Calendar.fixedToday) {
      return {
        date: Calendar.fixedToday,
        time: Calendar.fixedTime,
      };
    }
    const now = new Date();
    return {
      date: new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())).toISOString().slice(0, 10),
      time: `${Calendar.pad(now.getHours())}:${Calendar.pad(now.getMinutes())}`,
    };
  }

  /**
   * Return today's date.
   *
   * :return: today as "YYYY-MM-DD"
   */
  static today() {
    return Calendar.now().date;
  }

  /**
   * Write a number with two digits.
   *
   * :param value: a whole number from 0 to 99
   * :return: the number as two digits
   */
  static pad(value) {
    return String(value).padStart(2, "0");
  }

  /**
   * Check that a value is a real date written as "YYYY-MM-DD".
   *
   * :param value: the value to check
   * :return: true when the value is a valid date
   */
  static isDate(value) {
    // The round trip rejects dates that do not exist, such as "2026-02-30".
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value)) && Calendar.addDays(value, 0) === value;
  }

  /**
   * Check that a value is a time of day written as "HH:MM".
   *
   * :param value: the value to check
   * :return: true when the value is a valid time
   */
  static isTime(value) {
    const match = /^(\d{2}):(\d{2})$/.exec(String(value));
    return Boolean(match) && Number(match[1]) < 24 && Number(match[2]) < 60;
  }

  /**
   * Turn a "YYYY-MM-DD" string into a Date at midnight UTC.
   *
   * :param iso: the date
   * :return: the matching Date
   */
  static toDate(iso) {
    const parts = iso.split("-");
    return new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
  }

  /**
   * Add whole days to a date.
   *
   * :param iso: the starting date
   * :param days: the number of days to add, which may be negative
   * :return: the new date as "YYYY-MM-DD"
   */
  static addDays(iso, days) {
    const date = Calendar.toDate(iso);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

  /**
   * Count the days from one date to another.
   *
   * :param from: the first date
   * :param to: the second date
   * :return: the number of days, negative when to comes before from
   */
  static daysBetween(from, to) {
    return Math.round((Calendar.toDate(to) - Calendar.toDate(from)) / 86400000);
  }

  /**
   * Turn a time of day into minutes after midnight.
   *
   * :param time: the time as "HH:MM"
   * :return: the minutes
   */
  static minutesOf(time) {
    const parts = time.split(":");
    return Number(parts[0]) * 60 + Number(parts[1]);
  }

  /**
   * Count the minutes from one moment to another.
   *
   * :param from: {date, time}
   * :param to: {date, time}
   * :return: the minutes, negative when to comes first
   */
  static minutesBetween(from, to) {
    return Calendar.daysBetween(from.date, to.date) * 1440 + Calendar.minutesOf(to.time) - Calendar.minutesOf(from.time);
  }

  /**
   * Move a moment by a number of minutes.
   *
   * :param moment: {date, time}
   * :param minutes: the minutes to add, which may be negative
   * :return: the new {date, time}
   */
  static addMinutes(moment, minutes) {
    const total = Calendar.minutesOf(moment.time) + minutes;
    const days = Math.floor(total / 1440);
    const rest = total - days * 1440;
    return {
      date: Calendar.addDays(moment.date, days),
      time: `${Calendar.pad(Math.floor(rest / 60))}:${Calendar.pad(rest % 60)}`,
    };
  }

  /**
   * Round a moment up to the next whole slot, such as the next quarter hour.
   *
   * :param moment: {date, time}
   * :param slotMinutes: the slot length in minutes
   * :return: the moment itself when it is on a slot, otherwise the next slot
   */
  static roundUp(moment, slotMinutes) {
    const over = Calendar.minutesOf(moment.time) % slotMinutes;
    return over === 0 ? moment : Calendar.addMinutes(moment, slotMinutes - over);
  }

  /**
   * Tell whether a date is a Saturday or Sunday.
   *
   * :param iso: the date
   * :return: true on a weekend
   */
  static isWeekend(iso) {
    const day = Calendar.toDate(iso).getUTCDay();
    return day === 0 || day === 6;
  }

  /**
   * Format a date for people to read, such as "Tue, Nov 17, 2026".
   *
   * :param iso: the date
   * :return: the formatted date
   */
  static format(iso) {
    return Calendar.toDate(iso).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  }

  /**
   * Format a moment for people to read, such as "Tue, Nov 17, 2026 at 10:30".
   *
   * :param moment: {date, time}
   * :return: the formatted date and time
   */
  static formatMoment(moment) {
    return `${Calendar.format(moment.date)} at ${moment.time}`;
  }
}

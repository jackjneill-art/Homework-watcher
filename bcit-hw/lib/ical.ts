/**
 * Minimal RFC 5545 (iCalendar) parser.
 *
 * Deliberately dependency-free: this runs in a Vercel serverless function on
 * every cron tick, and a hand-rolled parser for the handful of properties we
 * care about is smaller and more predictable than pulling in a full ical
 * library.
 */

const DEFAULT_TZ = "America/Vancouver";

export interface RawEvent {
  UID?: string;
  SUMMARY?: string;
  DESCRIPTION?: string;
  CATEGORIES?: string;
  URL?: string;
  DTSTART?: Date | null;
  DTEND?: Date | null;
  DUE?: Date | null;
  [key: string]: string | Date | null | undefined;
}

/**
 * RFC 5545 line unfolding: a line beginning with a space or tab is a
 * continuation of the previous line. Brightspace wraps long SUMMARY values
 * this way, so skipping this step silently truncates course codes.
 */
export function unfold(text: string): string[] {
  const lines: string[] = [];
  for (const raw of text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")) {
    if ((raw.startsWith(" ") || raw.startsWith("\t")) && lines.length > 0) {
      lines[lines.length - 1] += raw.slice(1);
    } else {
      lines.push(raw);
    }
  }
  return lines;
}

export function unescapeText(value: string): string {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

/** Offset (in ms) of a named IANA timezone at a given instant. */
function tzOffsetMs(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const parts: Record<string, number> = {};
  for (const p of dtf.formatToParts(instant)) {
    if (p.type !== "literal") parts[p.type] = Number(p.value);
  }
  // Intl renders midnight as hour 24 in some environments.
  const hour = parts.hour === 24 ? 0 : parts.hour;

  const asUTC = Date.UTC(parts.year, parts.month - 1, parts.day, hour, parts.minute, parts.second);
  return asUTC - instant.getTime();
}

/**
 * Build a Date from wall-clock components interpreted in `timeZone`.
 * Two passes so the correct DST offset is used for the target instant, not
 * for "now" — otherwise every due date shifts by an hour twice a year.
 */
function zonedTimeToDate(
  y: number, mo: number, d: number, h: number, mi: number, s: number, timeZone: string,
): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  const firstOffset = tzOffsetMs(new Date(guess), timeZone);
  const secondOffset = tzOffsetMs(new Date(guess - firstOffset), timeZone);
  return new Date(guess - secondOffset);
}

/** Parse a DTSTART / DTEND / DUE value into a Date. */
export function parseICalDate(
  value: string,
  params: Record<string, string> = {},
): Date | null {
  const v = value.trim();
  const tz = params.TZID || DEFAULT_TZ;

  // UTC form: 20260915T235900Z
  let m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(v);
  if (m) {
    const [, y, mo, d, h, mi, s] = m.map(Number) as unknown as number[];
    return new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  }

  // Local/zoned form: 20260915T235900
  m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/.exec(v);
  if (m) {
    const [, y, mo, d, h, mi, s] = m.map(Number) as unknown as number[];
    return zonedTimeToDate(y, mo, d, h, mi, s, tz);
  }

  // Date-only form: 20260915
  m = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (m) {
    const [, y, mo, d] = m.map(Number) as unknown as number[];
    return zonedTimeToDate(y, mo, d, 0, 0, 0, tz);
  }

  return null;
}

const DATE_PROPS = new Set(["DTSTART", "DTEND", "DUE"]);

/** Extract every VEVENT from an .ics document. */
export function parseICS(text: string): RawEvent[] {
  const events: RawEvent[] = [];
  let current: RawEvent | null = null;

  for (const line of unfold(text)) {
    if (line === "BEGIN:VEVENT") {
      current = {};
      continue;
    }
    if (line === "END:VEVENT") {
      if (current) events.push(current);
      current = null;
      continue;
    }
    if (!current) continue;

    const colon = line.indexOf(":");
    if (colon === -1) continue;

    const namePart = line.slice(0, colon);
    const value = line.slice(colon + 1);

    const bits = namePart.split(";");
    const name = bits[0].toUpperCase();

    const params: Record<string, string> = {};
    for (const p of bits.slice(1)) {
      const eq = p.indexOf("=");
      if (eq !== -1) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1);
    }

    if (DATE_PROPS.has(name)) {
      current[name] = parseICalDate(value, params);
    } else {
      current[name] = unescapeText(value);
    }
  }

  return events;
}

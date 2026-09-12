/**
 * Turning raw calendar events into homework, and working out what changed
 * since the last run.
 */

import { parseICS, type RawEvent } from "./ical";

export interface Assignment {
  uid: string;
  title: string;
  course: string;
  due: string | null; // ISO 8601
  url: string;
  description: string;
  rawSummary: string;
}

export interface TrackedAssignment extends Assignment {
  firstSeen: string;
}

export interface ChangedAssignment extends Assignment {
  previousDue: string | null;
}

export interface DiffResult {
  added: Assignment[];
  changed: ChangedAssignment[];
  removed: Assignment[];
}

/**
 * Words that mark a calendar entry as actual work rather than a timetabled
 * class. Brightspace puts lectures and labs in the same feed as assignments,
 * and Jack does not need a 6am push telling him he has a lecture on Monday.
 */
const WORK_HINTS = [
  "assignment", "assessment", "quiz", "exam", "test", "midterm", "final",
  "due", "submission", "dropbox", "project", "essay", "report",
  "discussion", "presentation", "homework", "case study", "milestone",
  "deliverable", "peer review", "reflection",
];

/** Matches BCIT-style course codes, e.g. COMM 1100 / MKTG1102. */
const COURSE_CODE = /\b([A-Z]{4}\s?\d{4})\b/;

/**
 * Some Brightspace calendars never put a readable course code anywhere in
 * the feed — no code in the title, no CATEGORIES. The one thing that does
 * reliably tell two courses apart is the numeric org unit id Brightspace
 * embeds in every "View event" link (?ou=253727). Fill in real names here
 * as you learn which id is which course; unknown ids fall back to the
 * number itself so grouping/coloring still works before you do.
 */
const ORG_UNIT = /\bou=(\d+)\b/;
export const ORG_UNIT_NAMES: Record<string, string> = {
  "253727": "First Year Marketing Community Access",
  "1239803": "Professional Sales Skills and Customer Relationship Management",
  "1230765": "Business Communication",
  "1230837": "Business Math",
};

function courseFromOrgUnit(description: string): string {
  const match = ORG_UNIT.exec(description);
  if (!match) return "";
  return ORG_UNIT_NAMES[match[1]] ?? `Course ${match[1]}`;
}

/**
 * This feed also leaves the ICS URL property blank — the only link back to
 * Brightspace is a "View event - https://..." line inside the description.
 * Without this, titles render as plain text with nowhere to click, which
 * also means there's no way to tell two "Course 1230765"-style ids apart by
 * eye; opening the real event is how you'd confirm which course is which.
 */
const VIEW_EVENT_URL = /View event - (https?:\/\/\S+)/;

function urlFromDescription(description: string): string {
  return VIEW_EVENT_URL.exec(description)?.[1] ?? "";
}

export function looksLikeWork(title: string, description = ""): boolean {
  const blob = `${title} ${description}`.toLowerCase();
  return WORK_HINTS.some((hint) => blob.includes(hint));
}

const TEST_HINTS = ["quiz", "exam", "midterm", "final", "test"];

/** Powers the sidebar's "Tests and quizzes" view. Same keyword-matching approach as looksLikeWork. */
export function isTestOrQuiz(title: string, description = ""): boolean {
  const blob = `${title} ${description}`.toLowerCase();
  return TEST_HINTS.some((hint) => blob.includes(hint));
}

/**
 * Brightspace titles events like "Assignment 1 is due - Business Comm (COMM 1100)".
 * Split the human title from the course so the UI can group by course.
 */
export function splitCourse(
  summary: string,
  description = "",
  categories = "",
): { title: string; course: string } {
  let course = "";

  const codeMatch =
    COURSE_CODE.exec(summary) || COURSE_CODE.exec(description) || COURSE_CODE.exec(categories);
  if (codeMatch) course = codeMatch[1];

  let title = summary;

  const sep = summary.lastIndexOf(" - ");
  if (sep !== -1) {
    const head = summary.slice(0, sep).trim();
    const tail = summary.slice(sep + 3).trim();
    const tailIsCourseCode = COURSE_CODE.test(tail);
    // Only treat the tail as a course name if it reads like one, not like
    // part of the assignment title ("Essay - Draft Due" must stay intact).
    if (tail.length <= 60 && (tailIsCourseCode || !looksLikeWork(tail))) {
      title = head;
      // Brightspace also appends status suffixes ("- Available",
      // "- Availability Ends") that pass the same "doesn't look like work"
      // check but aren't a course — only trust the tail as one with an
      // actual course code as evidence.
      if (tailIsCourseCode) course = course || tail;
    }
  }

  if (!course && categories) course = categories.split(",")[0].trim();

  return { title: title.trim(), course: course.trim() };
}

export interface NormalizeOptions {
  /** Keep every event, not just assignment-looking ones. */
  includeAll?: boolean;
}

export function normalize(
  events: RawEvent[],
  { includeAll = false }: NormalizeOptions = {},
): Record<string, Assignment> {
  const items: Record<string, Assignment> = {};

  for (const ev of events) {
    const summary = typeof ev.SUMMARY === "string" ? ev.SUMMARY.trim() : "";
    if (!summary) continue;

    const description = typeof ev.DESCRIPTION === "string" ? ev.DESCRIPTION : "";
    const categories = typeof ev.CATEGORIES === "string" ? ev.CATEGORIES : "";

    if (!includeAll && !looksLikeWork(summary, description)) continue;

    const dueDate =
      (ev.DUE as Date | null) || (ev.DTEND as Date | null) || (ev.DTSTART as Date | null);
    const { title, course: textCourse } = splitCourse(summary, description, categories);
    const course = textCourse || courseFromOrgUnit(description);

    const uid =
      (typeof ev.UID === "string" && ev.UID) ||
      `${summary}|${dueDate ? dueDate.toISOString() : "nodate"}`;

    const feedUrl = typeof ev.URL === "string" ? ev.URL : "";

    items[uid] = {
      uid,
      title,
      course,
      due: dueDate ? dueDate.toISOString() : null,
      url: feedUrl || urlFromDescription(description),
      description: description.slice(0, 500),
      rawSummary: summary,
    };
  }

  return items;
}

export function parseFeed(icsText: string, options?: NormalizeOptions) {
  return normalize(parseICS(icsText), options);
}

export function diffAssignments(
  previous: Record<string, TrackedAssignment | Assignment>,
  current: Record<string, Assignment>,
): DiffResult {
  const added: Assignment[] = [];
  const changed: ChangedAssignment[] = [];

  for (const [uid, item] of Object.entries(current)) {
    const prev = previous[uid];
    if (!prev) {
      added.push(item);
    } else if (prev.due !== item.due) {
      changed.push({ ...item, previousDue: prev.due ?? null });
    }
  }

  const removed = Object.entries(previous)
    .filter(([uid]) => !current[uid])
    .map(([, item]) => item as Assignment);

  return { added, changed, removed };
}

/* -------------------------------------------------------------------------- */
/* Formatting                                                                 */
/* -------------------------------------------------------------------------- */

const TZ = "America/Vancouver";

export function daysUntil(iso: string | null, now: Date = new Date()): number | null {
  if (!iso) return null;
  const due = new Date(iso);
  if (Number.isNaN(due.getTime())) return null;

  // Compare calendar days in Vancouver, so "due tonight at 11:59pm" reads as
  // today rather than tomorrow depending on UTC rollover.
  const dayKey = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" })
      .format(d);

  const startOfDay = (d: Date) => Date.parse(`${dayKey(d)}T00:00:00Z`);
  return Math.round((startOfDay(due) - startOfDay(now)) / 86_400_000);
}

export function formatDue(iso: string | null): string {
  if (!iso) return "no due date";
  const due = new Date(iso);
  if (Number.isNaN(due.getTime())) return iso;

  const datePart = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, weekday: "short", month: "short", day: "numeric",
  }).format(due);

  const timePart = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true,
  }).format(due).replace(" AM", "am").replace(" PM", "pm");

  return timePart === "12:00am" ? datePart : `${datePart}, ${timePart}`;
}

function relativeDay(days: number | null): string {
  if (days === null) return "";
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

/**
 * Human-readable summary — this is the text that becomes the phone
 * notification, so it leads with what is new.
 */
export function renderSummary(
  { added, changed }: Pick<DiffResult, "added" | "changed">,
  upcoming: Assignment[],
  now: Date = new Date(),
  firstRun = false,
): string {
  const lines: string[] = [];
  const byDue = (a: Assignment, b: Assignment) => (a.due ?? "9999").localeCompare(b.due ?? "9999");
  const label = (i: Assignment) => (i.course ? `${i.title} (${i.course})` : i.title);

  if (added.length) {
    lines.push(`${added.length} new assignment${added.length === 1 ? "" : "s"}:`);
    for (const item of [...added].sort(byDue)) {
      lines.push(`• ${label(item)} — due ${formatDue(item.due)}`);
    }
    lines.push("");
  }

  if (changed.length) {
    lines.push(`${changed.length} due date change${changed.length === 1 ? "" : "s"}:`);
    for (const item of changed) {
      lines.push(`• ${label(item)} — moved to ${formatDue(item.due)} (was ${formatDue(item.previousDue)})`);
    }
    lines.push("");
  }

  if (!added.length && !changed.length && !firstRun) {
    lines.push("No new assignments today.");
    lines.push("");
  }

  const dueSoon = upcoming
    .filter((i) => {
      const d = daysUntil(i.due, now);
      return d !== null && d >= 0 && d <= 7;
    })
    .sort(byDue);

  if (dueSoon.length) {
    lines.push("Due in the next 7 days:");
    for (const item of dueSoon) {
      lines.push(`• ${label(item)} — ${formatDue(item.due)} (${relativeDay(daysUntil(item.due, now))})`);
    }
  }

  return lines.join("\n").trim();
}

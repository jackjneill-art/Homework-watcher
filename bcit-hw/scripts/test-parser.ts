import { parseFeed, diffAssignments, renderSummary, daysUntil, formatDue } from "../lib/assignments";
import { parseICalDate } from "../lib/ical";

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) { failures++; console.log(`FAIL ${label}\n  got:      ${JSON.stringify(actual)}\n  expected: ${JSON.stringify(expected)}`); }
  else console.log(`pass  ${label}`);
}

/* ---- timezone / DST handling ---- */
// 11:59pm Sep 15 2026 in Vancouver (PDT, UTC-7) => 06:59Z on Sep 16
check("PDT date -> UTC", parseICalDate("20260915T235900")?.toISOString(), "2026-09-16T06:59:00.000Z");
// 11:59pm Jan 15 2026 in Vancouver (PST, UTC-8) => 07:59Z on Jan 16
check("PST date -> UTC", parseICalDate("20260115T235900")?.toISOString(), "2026-01-16T07:59:00.000Z");
check("Z form passthrough", parseICalDate("20260915T235900Z")?.toISOString(), "2026-09-15T23:59:00.000Z");

/* ---- line folding ---- */
const foldedFeed = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:folded@learn.bcit.ca
SUMMARY:Assignment 1: Memo Writing is due - Business Communication 1 (COMM 1
 100)
DTSTART:20260915T235900
DESCRIPTION:Submit to the dropbox.
END:VEVENT
END:VCALENDAR`;
const folded = parseFeed(foldedFeed);
check("unfolds wrapped course code", folded["folded@learn.bcit.ca"].course, "COMM 1100");
check("splits title from course", folded["folded@learn.bcit.ca"].title, "Assignment 1: Memo Writing is due");

/* ---- Brightspace status suffixes aren't course names ---- */
// Real feed data: "... - Available" and "... - Availability Ends" pass the
// "doesn't look like work" check the same way a real course name would, but
// they carry no course code, so they must not end up as the course.
const availabilityFeed = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:avail@x
SUMMARY:Active Learner Quiz: Module 2- Requires Respondus LockDown Browser - Available
DTSTART:20260908T120000
END:VEVENT
BEGIN:VEVENT
UID:availends@x
SUMMARY:Week 1: A Sales Career? - Availability Ends
DTSTART:20260913T235900
DESCRIPTION:There is a quiz on page 18.
END:VEVENT
END:VCALENDAR`;
const availability = parseFeed(availabilityFeed);
check("status suffix is not a course", availability["avail@x"].course, "");
check("status suffix stripped from title", availability["avail@x"].title, "Active Learner Quiz: Module 2- Requires Respondus LockDown Browser");
check("'Availability Ends' is not a course", availability["availends@x"].course, "");

/* ---- org-unit fallback when the feed has no course code at all ---- */
// BCIT's real feed for some calendars never puts a course code in the title
// or CATEGORIES — the numeric org unit id in the "View event" link is the
// only thing that tells two courses apart.
const orgUnitFeed = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:ou1@x
SUMMARY:Week 1: A Sales Career?
DTSTART:20260913T235900
DESCRIPTION:On page 18 there is a quiz. View event - https://learn.bcit.ca/d2l/le/calendar/9999999/event/1/detailsview?ou=9999999#1
END:VEVENT
END:VCALENDAR`;
const orgUnit = parseFeed(orgUnitFeed);
check("falls back to org unit id when no course code exists and no name is known", orgUnit["ou1@x"].course, "Course 9999999");
check(
  "pulls the click-through link out of the description when URL is blank",
  orgUnit["ou1@x"].url,
  "https://learn.bcit.ca/d2l/le/calendar/9999999/event/1/detailsview?ou=9999999#1",
);

const namedFeed = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:named@x
SUMMARY:Week 1: A Sales Career?
DTSTART:20260913T235900
DESCRIPTION:On page 18 there is a quiz. View event - https://learn.bcit.ca/d2l/le/calendar/1239803/event/1/detailsview?ou=1239803#1
END:VEVENT
END:VCALENDAR`;
const named = parseFeed(namedFeed);
check(
  "known org unit id resolves to its real course name",
  named["named@x"].course,
  "Professional Sales Skills and Customer Relationship Management",
);

/* ---- filtering out timetabled classes ---- */
const mixed = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:a1@x
SUMMARY:Quiz 2 - MATH 1100
DTSTART:20260918T143000
END:VEVENT
BEGIN:VEVENT
UID:lec1@x
SUMMARY:Lecture - Microeconomics
DTSTART:20260914T083000
END:VEVENT
BEGIN:VEVENT
UID:lab1@x
SUMMARY:Business Info Systems Lab
DTSTART:20260916T083000
END:VEVENT
END:VCALENDAR`;
const filtered = parseFeed(mixed);
check("keeps the quiz", Object.keys(filtered).includes("a1@x"), true);
check("drops the lecture", Object.keys(filtered).includes("lec1@x"), false);
check("drops the plain lab", Object.keys(filtered).includes("lab1@x"), false);
check("includeAll keeps everything", Object.keys(parseFeed(mixed, { includeAll: true })).length, 3);

/* ---- diffing across two days ---- */
const day1 = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:memo@x
SUMMARY:Assignment 1: Memo Writing is due - COMM 1100
DTSTART:20260915T235900
END:VEVENT
BEGIN:VEVENT
UID:quiz@x
SUMMARY:Quiz 2 - MATH 1100
DTSTART:20260918T143000
END:VEVENT
END:VCALENDAR`;

const day2 = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:memo@x
SUMMARY:Assignment 1: Memo Writing is due - COMM 1100
DTSTART:20260917T235900
END:VEVENT
BEGIN:VEVENT
UID:quiz@x
SUMMARY:Quiz 2 - MATH 1100
DTSTART:20260918T143000
END:VEVENT
BEGIN:VEVENT
UID:case@x
SUMMARY:Case Study Report - Essentials of Marketing (MKTG 1102)
DTSTART:20260912T170000
END:VEVENT
END:VCALENDAR`;

const before = parseFeed(day1);
const after = parseFeed(day2);
const d = diffAssignments(before, after);

check("detects 1 new", d.added.map((a) => a.uid), ["case@x"]);
check("detects 1 date change", d.changed.map((c) => c.uid), ["memo@x"]);
check("records previous due", d.changed[0].previousDue, before["memo@x"].due);
check("nothing removed", d.removed.length, 0);

/* ---- no false positives on a repeat run ---- */
const noChange = diffAssignments(after, parseFeed(day2));
check("stable feed => no alerts", [noChange.added.length, noChange.changed.length], [0, 0]);

/* ---- summary text ---- */
const now = new Date("2026-09-10T13:00:00Z");
const upcoming = Object.values(after).filter((i) => (daysUntil(i.due, now) ?? -1) >= 0);
console.log("\n--- notification body ---");
console.log(renderSummary(d, upcoming, now));
console.log("------------------------\n");

check("formatDue reads naturally", formatDue(after["case@x"].due), "Sat, Sep 12, 5:00pm");
check("daysUntil counts calendar days", daysUntil(after["case@x"].due, now), 2);

/* ---- grouping / presentation ---- */
import { bucketFor, groupByUrgency, headlineCount, courseColorIndex, relativeLabel, type AssignmentRow } from "../lib/grouping";

check("bucket: overdue", bucketFor(-2), "overdue");
check("bucket: today", bucketFor(0), "today");
check("bucket: tomorrow", bucketFor(1), "tomorrow");
check("bucket: this week", bucketFor(6), "week");
check("bucket: later", bucketFor(20), "later");
check("bucket: undated", bucketFor(null), "undated");

const rows: AssignmentRow[] = [
  { uid: "1", title: "Late essay", course: "COMM 1100", due: "2026-09-08T23:59:00Z", url: "", daysUntil: -2, isNew: false },
  { uid: "2", title: "Quiz", course: "MATH 1100", due: "2026-09-10T23:59:00Z", url: "", daysUntil: 0, isNew: true },
  { uid: "3", title: "Case study", course: "MKTG 1102", due: "2026-09-15T23:59:00Z", url: "", daysUntil: 5, isNew: false },
  { uid: "4", title: "Final project", course: "MKTG 1102", due: "2026-11-01T23:59:00Z", url: "", daysUntil: 52, isNew: false },
];

const groups = groupByUrgency(rows);
check("groups in urgency order", groups.map((g) => g.bucket), ["overdue", "today", "week", "later"]);
check("empty buckets omitted", groups.length, 4);
check("headline prioritises overdue", headlineCount(rows), { count: 1, label: "assignment overdue" });
check(
  "headline falls back to this week",
  headlineCount(rows.filter((r) => (r.daysUntil ?? 0) >= 0)),
  { count: 2, label: "due this week" },
);
check("course colour is stable", courseColorIndex("MKTG 1102"), courseColorIndex("MKTG 1102"));
check("different courses differ", courseColorIndex("COMM 1100") === courseColorIndex("MATH 1100"), false);
check("relative label: late", relativeLabel(-3), "3 days late");
check("relative label: today", relativeLabel(0), "today");

console.log(failures === 0 ? "\nALL TESTS PASSED" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);

/**
 * Building an .ics feed so the tracked assignments show up in a real
 * calendar app (Google Calendar, Apple Calendar, Outlook) via a
 * subscribe-by-URL link, instead of only living on this site.
 *
 * Deliberately not filtered by completion: "done" only exists in each
 * browser's localStorage (see HomeworkBoard.tsx), so the server generating
 * this feed has no way to know what you've checked off. The feed always
 * reflects every tracked assignment with a due date.
 */

import type { AssignmentRow } from "./grouping";

function escapeICS(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function icsDate(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function buildICS(assignments: AssignmentRow[]): string {
  const stamp = icsDate(new Date().toISOString());

  const events = assignments
    .filter((a) => a.due)
    .map((a) => {
      const summary = escapeICS(a.course ? `${a.title} (${a.course})` : a.title);
      const lines = [
        "BEGIN:VEVENT",
        `UID:${escapeICS(a.uid)}@bcit-homework-watcher`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${icsDate(a.due as string)}`,
        `SUMMARY:${summary}`,
      ];
      if (a.description) lines.push(`DESCRIPTION:${escapeICS(a.description.slice(0, 500))}`);
      if (a.url) lines.push(`URL:${a.url}`);
      lines.push("END:VEVENT");
      return lines.join("\r\n");
    });

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//BCIT Homework Watcher//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:BCIT Homework",
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");
}

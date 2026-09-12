/**
 * Turning a flat assignment list into something scannable in three seconds.
 *
 * Two separate visual jobs here, kept deliberately apart:
 *   - COURSE is identity  -> a stable colour per course, shown as a chip
 *   - URGENCY is state    -> reserved red/amber, shown on the due date
 * Mixing them (colouring the card by course AND by urgency) makes both
 * unreadable, so each gets its own channel.
 */

export interface AssignmentRow {
  uid: string;
  title: string;
  course: string;
  due: string | null;
  url: string;
  description?: string;
  daysUntil: number | null;
  isNew: boolean;
}

/**
 * Identity palette, in fixed order. Colours are assigned per course and never
 * cycled mid-list, so a course keeps its colour as items come and go.
 * Tuned for a black background; pure red is deliberately excluded so a
 * course's colour is never mistaken for the overdue status colour.
 */
export const COURSE_COLORS = [
  "#4c8ef0", // blue
  "#f2994a", // orange
  "#2ecc9c", // teal
  "#f2c94c", // yellow
  "#f277b0", // pink
  "#a685f2", // violet
  "#6fcf58", // green
  "#56c8d8", // cyan
];

/** Stable hash so a course maps to the same colour on every render. */
export function courseColorIndex(course: string): number {
  if (!course) return 0;
  let hash = 0;
  for (let i = 0; i < course.length; i++) {
    hash = (hash * 31 + course.charCodeAt(i)) % 100_000;
  }
  return hash % COURSE_COLORS.length;
}

/**
 * The hash above can put two different courses on the same colour by
 * coincidence — it happened to Business Math and First Year Marketing
 * Community Access. Overrides here win over the hash; fill in a course name
 * and any COURSE_COLORS hex (or your own) to pin or fix a collision.
 */
export const COURSE_COLOR_OVERRIDES: Record<string, string> = {
  "Business Math": "#a685f2", // violet
};

export function courseColor(course: string): string {
  return COURSE_COLOR_OVERRIDES[course] ?? COURSE_COLORS[courseColorIndex(course)];
}

export type Bucket = "overdue" | "today" | "tomorrow" | "week" | "later" | "undated" | "done";

export const BUCKET_LABELS: Record<Bucket, string> = {
  overdue: "Overdue",
  today: "Due today",
  tomorrow: "Due tomorrow",
  week: "This week",
  later: "Later",
  undated: "No due date",
  done: "Completed",
};

/** Order sections appear on the page. Completed items always sink to the bottom. */
export const BUCKET_ORDER: Bucket[] = ["overdue", "today", "tomorrow", "week", "later", "undated", "done"];

export function bucketFor(days: number | null): Bucket {
  if (days === null) return "undated";
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days <= 7) return "week";
  return "later";
}

/** Urgency is state, so it uses reserved status colours — never a course hue. */
export function urgencyToken(bucket: Bucket): string {
  switch (bucket) {
    case "overdue": return "var(--status-critical)";
    case "today": return "var(--status-serious)";
    case "tomorrow": return "var(--status-warning)";
    case "done": return "var(--new-fg)";
    default: return "var(--text-muted)";
  }
}

export interface Group {
  bucket: Bucket;
  label: string;
  items: AssignmentRow[];
}

export function groupByUrgency(rows: AssignmentRow[], completed?: Set<string>): Group[] {
  const buckets = new Map<Bucket, AssignmentRow[]>();

  for (const row of rows) {
    const b = completed?.has(row.uid) ? "done" : bucketFor(row.daysUntil);
    if (!buckets.has(b)) buckets.set(b, []);
    buckets.get(b)!.push(row);
  }

  return BUCKET_ORDER.filter((b) => buckets.get(b)?.length)
    .map((bucket) => ({
      bucket,
      label: BUCKET_LABELS[bucket],
      items: buckets
        .get(bucket)!
        .sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999")),
    }));
}

/** The one number worth putting at the top of the page. */
export function headlineCount(rows: AssignmentRow[], completed?: Set<string>): { count: number; label: string } {
  const outstanding = completed ? rows.filter((r) => !completed.has(r.uid)) : rows;

  const overdue = outstanding.filter((r) => (r.daysUntil ?? 99) < 0).length;
  if (overdue > 0) {
    return { count: overdue, label: overdue === 1 ? "assignment overdue" : "assignments overdue" };
  }

  const thisWeek = outstanding.filter((r) => {
    const d = r.daysUntil;
    return d !== null && d >= 0 && d <= 7;
  }).length;

  if (thisWeek > 0) {
    return { count: thisWeek, label: thisWeek === 1 ? "due this week" : "due this week" };
  }

  return { count: 0, label: "nothing due this week" };
}

export function relativeLabel(days: number | null): string {
  if (days === null) return "no due date";
  if (days < -1) return `${Math.abs(days)} days late`;
  if (days === -1) return "1 day late";
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days <= 7) return `in ${days} days`;
  if (days <= 13) return "next week";
  return `in ${Math.round(days / 7)} weeks`;
}

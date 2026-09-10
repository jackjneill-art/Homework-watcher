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
 */
export const COURSE_COLORS = [
  { light: "#2a78d6", dark: "#3987e5" }, // blue
  { light: "#eb6834", dark: "#d95926" }, // orange
  { light: "#1baf7a", dark: "#199e70" }, // aqua
  { light: "#eda100", dark: "#c98500" }, // yellow
  { light: "#e87ba4", dark: "#d55181" }, // magenta
  { light: "#4a3aa7", dark: "#9085e9" }, // violet
  { light: "#008300", dark: "#008300" }, // green
  { light: "#e34948", dark: "#e66767" }, // red
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

export type Bucket = "overdue" | "today" | "tomorrow" | "week" | "later" | "undated";

export const BUCKET_LABELS: Record<Bucket, string> = {
  overdue: "Overdue",
  today: "Due today",
  tomorrow: "Due tomorrow",
  week: "This week",
  later: "Later",
  undated: "No due date",
};

/** Order sections appear on the page. */
export const BUCKET_ORDER: Bucket[] = ["overdue", "today", "tomorrow", "week", "later", "undated"];

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
    default: return "var(--text-muted)";
  }
}

export interface Group {
  bucket: Bucket;
  label: string;
  items: AssignmentRow[];
}

export function groupByUrgency(rows: AssignmentRow[]): Group[] {
  const buckets = new Map<Bucket, AssignmentRow[]>();

  for (const row of rows) {
    const b = bucketFor(row.daysUntil);
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
export function headlineCount(rows: AssignmentRow[]): { count: number; label: string } {
  const overdue = rows.filter((r) => (r.daysUntil ?? 99) < 0).length;
  if (overdue > 0) {
    return { count: overdue, label: overdue === 1 ? "assignment overdue" : "assignments overdue" };
  }

  const thisWeek = rows.filter((r) => {
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

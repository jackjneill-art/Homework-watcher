"use client";

import { useEffect, useState, type CSSProperties } from "react";
import {
  groupByUrgency,
  headlineCount,
  courseColor,
  type AssignmentRow,
} from "@/lib/grouping";
import { isTestOrQuiz } from "@/lib/assignments";
import { AssignmentCard } from "./AssignmentCard";

type Category = "all" | "assignments" | "tests" | "overdue" | "completed";

/**
 * Sidebar order, top to bottom, as requested. "All assignments" is the true
 * unfiltered list; "Assignments" now excludes tests/quizzes so the two read
 * as distinct options instead of duplicates.
 */
const CATEGORIES: { value: Category; label: string }[] = [
  { value: "all", label: "All assignments" },
  { value: "assignments", label: "Assignments" },
  { value: "tests", label: "Tests and quizzes" },
  { value: "overdue", label: "Overdue assignments" },
  { value: "completed", label: "Completed assignments" },
];

/**
 * The calendar feed is read-only, so "done" has nowhere server-side to live.
 * It's tracked per-browser in localStorage instead — good enough for a
 * single-user watcher, and needs no write path back to Brightspace or Blob.
 */
const STORAGE_KEY = "bcit-hw-completed";

function loadCompleted(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function lastCheckedLabel(iso: string | null): string {
  if (!iso) return "never checked";
  const when = new Date(iso);
  const mins = Math.round((Date.now() - when.getTime()) / 60_000);

  if (mins < 2) return "checked just now";
  if (mins < 60) return `checked ${mins} min ago`;
  if (mins < 60 * 36) {
    const hrs = Math.round(mins / 60);
    return `checked ${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  }
  return `checked ${new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Vancouver",
    month: "short",
    day: "numeric",
  }).format(when)}`;
}

export function HomeworkBoard({
  rows,
  lastChecked,
  available,
  hasPayload,
}: {
  rows: AssignmentRow[];
  lastChecked: string | null;
  available: boolean;
  hasPayload: boolean;
}) {
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [courseFilter, setCourseFilter] = useState<string | null>(null);
  const [category, setCategory] = useState<Category>("all");

  // Empty on the server render; filled in once the browser's copy loads.
  useEffect(() => {
    setCompleted(loadCompleted());
  }, []);

  function toggleComplete(uid: string) {
    setCompleted((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        // Private browsing or storage disabled — checkbox still works this session.
      }
      return next;
    });
  }

  // The legend lists every course from the full list regardless of the
  // active filter, so switching between courses doesn't make other courses
  // disappear from the picker.
  const courses = [...new Set(rows.map((r) => r.course).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );

  // "All assignments" is the full list. The rest are views onto it, not a
  // strict partition — e.g. a completed quiz still shows up under Tests if
  // you switch to that view; only "Assignments" itself excludes tests/quizzes.
  const categoryRows = rows.filter((r) => {
    switch (category) {
      case "assignments": return !isTestOrQuiz(r.title, r.description);
      case "tests": return isTestOrQuiz(r.title, r.description);
      case "overdue": return (r.daysUntil ?? 99) < 0 && !completed.has(r.uid);
      case "completed": return completed.has(r.uid);
      default: return true;
    }
  });

  const visibleRows = courseFilter
    ? categoryRows.filter((r) => r.course === courseFilter)
    : categoryRows;
  const newCount = visibleRows.filter((r) => r.isNew).length;
  const groups = groupByUrgency(visibleRows, completed);
  const headline = headlineCount(visibleRows, completed);

  return (
    <div className="layout">
      <aside className="sidebar">
        <p className="sidebar-label">View</p>
        <select
          className="sidebar-select"
          value={category}
          onChange={(e) => setCategory(e.target.value as Category)}
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </aside>

      <main className="page">
      <header className="masthead">
        <p className="eyebrow">BCIT Learning Hub</p>

        {headline.count > 0 ? (
          <h1 className={`headline${headline.label.includes("overdue") ? " is-critical" : ""}`}>
            <span className="count">{headline.count}</span> {headline.label}
          </h1>
        ) : (
          <h1 className="headline is-clear">Nothing due this week</h1>
        )}

        <p className="substat">
          <span>{lastCheckedLabel(lastChecked)}</span>
          {newCount > 0 && <span className="dot-sep">{newCount} new since yesterday</span>}
          {visibleRows.length > 0 && <span className="dot-sep">{visibleRows.length} tracked</span>}
        </p>

        {courses.length > 0 && (
          <ul className="legend">
            <li>
              <button
                type="button"
                className={`legend-item${courseFilter === null ? " is-active" : ""}`}
                onClick={() => setCourseFilter(null)}
              >
                All
              </button>
            </li>
            {courses.map((course) => (
              <li key={course}>
                <button
                  type="button"
                  className={`legend-item${courseFilter === course ? " is-active" : ""}`}
                  style={{ "--course-color": courseColor(course) } as CSSProperties}
                  onClick={() => setCourseFilter(courseFilter === course ? null : course)}
                  aria-pressed={courseFilter === course}
                >
                  <span className="legend-swatch" style={{ background: courseColor(course) }} />
                  {course}
                </button>
              </li>
            ))}
          </ul>
        )}
      </header>

      {!available && (
        <div className="panel is-warning">
          <h2>Storage isn&apos;t connected</h2>
          <p>
            Add a Blob store in your Vercel project (Storage → Create → Blob), then
            redeploy.
          </p>
        </div>
      )}

      {available && !hasPayload && (
        <div className="panel">
          <h2>No data yet</h2>
          <p>
            Run <code>/api/refresh</code> once to seed it. After that the morning cron
            keeps it current.
          </p>
        </div>
      )}

      {available && hasPayload && groups.length === 0 && (
        <div className="panel">
          <h2>{category === "all" ? "All clear" : "Nothing here"}</h2>
          <p>
            {category === "all"
              ? "Nothing outstanding in your Learning Hub calendar right now."
              : `No items match "${CATEGORIES.find((c) => c.value === category)?.label}"${
                  courseFilter ? ` for ${courseFilter}` : ""
                } right now.`}
          </p>
        </div>
      )}

      {groups.map((group) => (
        <section className="section" data-bucket={group.bucket} key={group.bucket}>
          <div className="section-head">
            <h2 className="section-title">{group.label}</h2>
            <span className="section-count">{group.items.length}</span>
          </div>
          <ul className="list">
            {group.items.map((item) => (
              <AssignmentCard
                item={item}
                key={item.uid}
                completed={completed.has(item.uid)}
                onToggleComplete={() => toggleComplete(item.uid)}
              />
            ))}
          </ul>
        </section>
      ))}

      <footer className="foot">
        <span>Checked every morning from your Brightspace calendar feed.</span>
        <span>Only items with a due date appear here.</span>
      </footer>
      </main>
    </div>
  );
}

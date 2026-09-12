"use client";

import { useEffect, useState } from "react";
import { groupByUrgency, headlineCount, type AssignmentRow } from "@/lib/grouping";
import { AssignmentCard } from "./AssignmentCard";

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
  newCount,
  lastChecked,
  available,
  hasPayload,
}: {
  rows: AssignmentRow[];
  newCount: number;
  lastChecked: string | null;
  available: boolean;
  hasPayload: boolean;
}) {
  const [completed, setCompleted] = useState<Set<string>>(new Set());

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

  const groups = groupByUrgency(rows, completed);
  const headline = headlineCount(rows, completed);

  return (
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
          {rows.length > 0 && <span className="dot-sep">{rows.length} tracked</span>}
        </p>
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
          <h2>All clear</h2>
          <p>Nothing outstanding in your Learning Hub calendar right now.</p>
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
  );
}

/**
 * The morning check. Vercel Cron hits this once a day (see vercel.json).
 *
 * Fetch the Brightspace feed -> parse -> compare with yesterday -> push
 * anything new to the phone -> save the snapshot the website reads.
 */

import { NextResponse } from "next/server";
import {
  parseFeed,
  diffAssignments,
  renderSummary,
  daysUntil,
  type Assignment,
  type TrackedAssignment,
} from "@/lib/assignments";
import { loadState, saveState, type HomeworkPayload } from "@/lib/storage";
import { sendPush, asciiSafe } from "@/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // Without a secret configured the route is open — fine for local dev,
  // flagged loudly in the response so it doesn't ship that way by accident.
  if (!secret) return true;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const feedUrl = process.env.BCIT_ICS_URL;
  if (!feedUrl) {
    return NextResponse.json(
      { error: "BCIT_ICS_URL is not set. Add it in Vercel > Settings > Environment Variables." },
      { status: 500 },
    );
  }

  // ---- 1. Fetch the feed -------------------------------------------------
  let icsText: string;
  try {
    const res = await fetch(feedUrl, {
      headers: { "User-Agent": "bcit-homework-watcher" },
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`Brightspace returned ${res.status}`);
    icsText = await res.text();
  } catch (err) {
    console.error("[refresh] feed fetch failed:", err);
    return NextResponse.json(
      { error: "Could not reach the Learning Hub feed", detail: String(err) },
      { status: 502 },
    );
  }

  if (!icsText.includes("BEGIN:VCALENDAR")) {
    return NextResponse.json(
      { error: "That URL did not return a calendar. Re-copy the Subscribe link from Brightspace." },
      { status: 502 },
    );
  }

  // ---- 2. Parse and diff -------------------------------------------------
  const now = new Date();
  const current = parseFeed(icsText);
  const { state, available, firstRun } = await loadState();

  if (!available) {
    // No reliable history: report, but never notify. A storage outage must not
    // turn into "37 new assignments" on the lock screen.
    return NextResponse.json(
      {
        error: "State storage unavailable — skipped notifications to avoid false alerts.",
        hint: "Check that a Blob store is connected and BLOB_READ_WRITE_TOKEN is set.",
        tracked: Object.keys(current).length,
      },
      { status: 503 },
    );
  }

  const { added, changed, removed } = diffAssignments(state.items, current);

  const upcoming = Object.values(current).filter((i) => {
    const d = daysUntil(i.due, now);
    return d !== null && d >= 0;
  });

  const summary = firstRun
    ? `Homework watcher is live. Tracking ${Object.keys(current).length} assignment(s).\n\n` +
      renderSummary({ added: [], changed: [] }, upcoming, now, true)
    : renderSummary({ added, changed }, upcoming, now);

  const payload: HomeworkPayload = {
    updated: now.toISOString(),
    source: "BCIT Learning Hub (Brightspace calendar feed)",
    counts: {
      tracked: Object.keys(current).length,
      new: added.length,
      changed: changed.length,
      upcoming: upcoming.length,
    },
    new: added,
    changed,
    assignments: Object.values(current)
      .map((i: Assignment) => ({
        ...i,
        daysUntil: daysUntil(i.due, now),
        isNew: added.some((a) => a.uid === i.uid),
      }))
      .sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999")),
    summary,
  };

  // ---- 3. Notify ---------------------------------------------------------
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  let pushed = false;

  if (firstRun) {
    pushed = await sendPush({
      title: "Homework watcher is live",
      message: asciiSafe(`Now tracking ${Object.keys(current).length} assignment(s) from your Learning Hub.`),
      tags: ["white_check_mark"],
      clickUrl: siteUrl,
    });
  } else if (added.length || changed.length) {
    const parts: string[] = [];
    if (added.length) parts.push(`${added.length} new`);
    if (changed.length) parts.push(`${changed.length} date change${changed.length === 1 ? "" : "s"}`);

    pushed = await sendPush({
      title: asciiSafe(`Homework: ${parts.join(", ")}`),
      message: asciiSafe(summary),
      priority: added.length ? 4 : 3,
      tags: ["books"],
      clickUrl: siteUrl,
    });
  }

  // ---- 4. Persist --------------------------------------------------------
  const items: Record<string, TrackedAssignment> = {};
  for (const [uid, item] of Object.entries(current)) {
    items[uid] = {
      ...item,
      firstSeen: state.items[uid]?.firstSeen ?? now.toISOString(),
    };
  }

  const saved = await saveState({ lastChecked: now.toISOString(), items, latest: payload });

  return NextResponse.json({
    ok: true,
    firstRun,
    pushed,
    saved,
    unsecured: !process.env.CRON_SECRET,
    removed: removed.length,
    ...payload,
  });
}

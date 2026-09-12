/**
 * The subscribe-by-URL feed for Google/Apple/Outlook calendar apps. See
 * lib/ics.ts for why this can't exclude items you've checked off.
 */

import { NextResponse } from "next/server";
import { loadState } from "@/lib/storage";
import { buildICS } from "@/lib/ics";
import type { AssignmentRow } from "@/lib/grouping";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(request: Request): boolean {
  const token = process.env.ICS_FEED_TOKEN;
  // Same tradeoff as CRON_SECRET: no token configured means the feed is
  // open, since calendar apps can't send a custom Authorization header.
  if (!token) return true;
  const url = new URL(request.url);
  return url.searchParams.get("token") === token;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { state } = await loadState();
  const assignments = (state.latest?.assignments ?? []) as AssignmentRow[];
  const body = buildICS(assignments);

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}

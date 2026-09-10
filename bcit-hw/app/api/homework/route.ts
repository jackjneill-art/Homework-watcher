/**
 * What the website reads. Returns the snapshot saved by the last cron run,
 * so the page loads instantly and never depends on BCIT being reachable.
 */

import { NextResponse } from "next/server";
import { loadState } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { state, available } = await loadState();

  if (!available) {
    return NextResponse.json(
      { error: "Storage unavailable", assignments: [] },
      { status: 503 },
    );
  }

  if (!state.latest) {
    return NextResponse.json({
      updated: null,
      counts: { tracked: 0, new: 0, changed: 0, upcoming: 0 },
      assignments: [],
      summary: "No data yet — run /api/refresh once to seed it.",
    });
  }

  return NextResponse.json(state.latest);
}

import { loadState } from "@/lib/storage";
import { type AssignmentRow } from "@/lib/grouping";
import { HomeworkBoard } from "./components/HomeworkBoard";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { state, available } = await loadState();
  const payload = state.latest;
  const rows = (payload?.assignments ?? []) as AssignmentRow[];

  // Anything already past its due date drops off after a week — keeps stale
  // items from permanently colonising the top of the page.
  const visible = rows.filter((r) => r.daysUntil === null || r.daysUntil > -8);

  // ICS_FEED_TOKEN is server-only, so the URL has to be built here (a server
  // component) and handed down as a prop — HomeworkBoard is a client
  // component and can't read non-NEXT_PUBLIC_ env vars itself.
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const icsToken = process.env.ICS_FEED_TOKEN;
  const icsUrl = siteUrl ? `${siteUrl}/calendar.ics${icsToken ? `?token=${icsToken}` : ""}` : null;

  return (
    <HomeworkBoard
      rows={visible}
      lastChecked={payload?.updated ?? null}
      available={available}
      hasPayload={Boolean(payload)}
      icsUrl={icsUrl}
    />
  );
}

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
  const newCount = visible.filter((r) => r.isNew).length;

  return (
    <HomeworkBoard
      rows={visible}
      newCount={newCount}
      lastChecked={payload?.updated ?? null}
      available={available}
      hasPayload={Boolean(payload)}
    />
  );
}

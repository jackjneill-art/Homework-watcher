import { loadState } from "@/lib/storage";
import { groupByUrgency, headlineCount, type AssignmentRow } from "@/lib/grouping";
import { AssignmentCard } from "./components/AssignmentCard";

export const dynamic = "force-dynamic";

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

export default async function Page() {
  const { state, available } = await loadState();
  const payload = state.latest;
  const rows = (payload?.assignments ?? []) as AssignmentRow[];

  // Anything already past its due date drops off after a week — keeps stale
  // items from permanently colonising the top of the page.
  const visible = rows.filter((r) => r.daysUntil === null || r.daysUntil > -8);

  const groups = groupByUrgency(visible);
  const headline = headlineCount(visible);
  const newCount = visible.filter((r) => r.isNew).length;

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
          <span>{lastCheckedLabel(payload?.updated ?? null)}</span>
          {newCount > 0 && (
            <span className="dot-sep">
              {newCount} new since yesterday
            </span>
          )}
          {visible.length > 0 && (
            <span className="dot-sep">{visible.length} tracked</span>
          )}
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

      {available && !payload && (
        <div className="panel">
          <h2>No data yet</h2>
          <p>
            Run <code>/api/refresh</code> once to seed it. After that the morning cron
            keeps it current.
          </p>
        </div>
      )}

      {available && payload && groups.length === 0 && (
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
              <AssignmentCard item={item} key={item.uid} />
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

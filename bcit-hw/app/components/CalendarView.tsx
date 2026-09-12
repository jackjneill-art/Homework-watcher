import type { CSSProperties } from "react";
import { formatDue } from "@/lib/assignments";
import { groupByDay, dayLabel, courseColor, type AssignmentRow } from "@/lib/grouping";

function DayCard({
  item,
  completed,
  onToggleComplete,
}: {
  item: AssignmentRow;
  completed: boolean;
  onToggleComplete: () => void;
}) {
  const color = item.course ? courseColor(item.course) : null;

  return (
    <li
      className="day-card"
      data-done={completed || undefined}
      style={{ "--course-color": color ?? "var(--border-strong)" } as CSSProperties}
    >
      <label className="day-card-check">
        <input
          type="checkbox"
          checked={completed}
          onChange={onToggleComplete}
          aria-label={completed ? "Mark as not done" : "Mark as done"}
        />
      </label>

      {item.url ? (
        <a href={item.url} target="_blank" rel="noreferrer" className="day-card-title">
          {item.title}
        </a>
      ) : (
        <span className="day-card-title">{item.title}</span>
      )}

      <span className="day-card-time">{formatDue(item.due)}</span>
    </li>
  );
}

export function CalendarView({
  rows,
  completed,
  onToggleComplete,
}: {
  rows: AssignmentRow[];
  completed: Set<string>;
  onToggleComplete: (uid: string) => void;
}) {
  const { overdue, days, later } = groupByDay(rows);

  return (
    <div className="calendar">
      {overdue.length > 0 && (
        <section className="calendar-strip" data-strip="overdue">
          <h2 className="calendar-strip-title">Overdue</h2>
          <ul className="day-list is-row">
            {overdue.map((item) => (
              <DayCard
                item={item}
                key={item.uid}
                completed={completed.has(item.uid)}
                onToggleComplete={() => onToggleComplete(item.uid)}
              />
            ))}
          </ul>
        </section>
      )}

      <div className="calendar-grid">
        {days.map((day) => {
          const { weekday, date } = dayLabel(day.offset);
          return (
            <div className="calendar-day" data-today={day.offset === 0 || undefined} key={day.offset}>
              <div className="calendar-day-head">
                <span className="calendar-day-weekday">{day.offset === 0 ? "Today" : weekday}</span>
                <span className="calendar-day-date">{date}</span>
              </div>
              <ul className="day-list">
                {day.items.map((item) => (
                  <DayCard
                    item={item}
                    key={item.uid}
                    completed={completed.has(item.uid)}
                    onToggleComplete={() => onToggleComplete(item.uid)}
                  />
                ))}
                {day.items.length === 0 && <li className="day-empty">—</li>}
              </ul>
            </div>
          );
        })}
      </div>

      {later.length > 0 && (
        <section className="calendar-strip" data-strip="later">
          <h2 className="calendar-strip-title">Later</h2>
          <ul className="day-list is-row">
            {later.map((item) => (
              <DayCard
                item={item}
                key={item.uid}
                completed={completed.has(item.uid)}
                onToggleComplete={() => onToggleComplete(item.uid)}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

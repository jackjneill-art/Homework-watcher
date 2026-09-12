import type { CSSProperties } from "react";
import { formatDue } from "@/lib/assignments";
import {
  courseColor,
  bucketFor,
  urgencyToken,
  relativeLabel,
  type AssignmentRow,
} from "@/lib/grouping";

export function AssignmentCard({
  item,
  completed,
  onToggleComplete,
}: {
  item: AssignmentRow;
  completed: boolean;
  onToggleComplete: () => void;
}) {
  const bucket = completed ? "done" : bucketFor(item.daysUntil);
  const color = item.course ? courseColor(item.course) : null;

  return (
    <li
      className="card"
      data-urgency={bucket}
      style={{ "--course-color": color ?? "var(--border-strong)" } as CSSProperties}
    >
      <div className="card-top">
        <div className="card-heading">
          <label className="card-check">
            <input
              type="checkbox"
              checked={completed}
              onChange={onToggleComplete}
              aria-label={completed ? "Mark as not done" : "Mark as done"}
            />
          </label>

          <h3 className="card-title">
            {item.url ? (
              <a href={item.url} target="_blank" rel="noreferrer">
                {item.title}
              </a>
            ) : (
              item.title
            )}
          </h3>
        </div>
        {item.isNew && !completed && <span className="badge-new">NEW</span>}
      </div>

      <div className="card-meta">
        {item.course && (
          <span className="course-chip">
            <span className="course-swatch" style={{ background: color ?? undefined }} />
            {item.course}
          </span>
        )}

        <span className="due">{formatDue(item.due)}</span>

        <span className="relative" style={{ color: urgencyToken(bucket) }}>
          {completed ? "Completed" : relativeLabel(item.daysUntil)}
        </span>
      </div>

      {item.description && <p className="card-note">{item.description}</p>}
    </li>
  );
}

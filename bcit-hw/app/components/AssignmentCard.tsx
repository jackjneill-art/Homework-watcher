import type { CSSProperties } from "react";
import { formatDue } from "@/lib/assignments";
import {
  COURSE_COLORS,
  courseColorIndex,
  bucketFor,
  urgencyToken,
  relativeLabel,
  type AssignmentRow,
} from "@/lib/grouping";

export function AssignmentCard({ item }: { item: AssignmentRow }) {
  const bucket = bucketFor(item.daysUntil);
  const swatch = COURSE_COLORS[courseColorIndex(item.course)];

  return (
    <li className="card" data-urgency={bucket}>
      <div className="card-top">
        <h3 className="card-title">
          {item.url ? (
            <a href={item.url} target="_blank" rel="noreferrer">
              {item.title}
            </a>
          ) : (
            item.title
          )}
        </h3>
        {item.isNew && <span className="badge-new">NEW</span>}
      </div>

      <div className="card-meta">
        {item.course && (
          <span className="course-chip">
            <span
              className="course-swatch"
              style={
                {
                  "--course-light": swatch.light,
                  "--course-dark": swatch.dark,
                } as CSSProperties
              }
            />
            {item.course}
          </span>
        )}

        <span className="due">{formatDue(item.due)}</span>

        <span className="relative" style={{ color: urgencyToken(bucket) }}>
          {relativeLabel(item.daysUntil)}
        </span>
      </div>

      {item.description && <p className="card-note">{item.description}</p>}
    </li>
  );
}

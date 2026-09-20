import type { ReactNode } from "react";

/** Consistency/progress rings share geometry and material across all modules.
 * Null is unknown, not zero. The center can show raw counts above a capped ring. */
export function ProgressRing({
  value,
  label,
  children,
  size = 96,
  color = "var(--chart-primary)",
}: {
  value: number | null;
  label: string;
  children?: ReactNode;
  size?: number;
  color?: string;
}) {
  const known = value !== null && Number.isFinite(value);
  const pct = known ? Math.min(100, Math.max(0, value)) : 0;
  return (
    <div
      className="norte-progress-ring"
      style={{ width: size, height: size }}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={known ? pct : undefined}
      aria-valuetext={known ? `${Math.round(pct)}%` : "Sem meta ou dados suficientes"}
    >
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="42" fill="none" stroke="var(--chart-track)" strokeWidth="8" />
        {known && pct > 0 && (
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            pathLength="100"
            strokeDasharray={`${pct} 100`}
          />
        )}
      </svg>
      <div className="norte-progress-ring-label">{children}</div>
    </div>
  );
}

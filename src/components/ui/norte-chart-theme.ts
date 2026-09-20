/** Visual contract shared by Recharts and hand-drawn SVGs. Never changes data. */
export const chartTheme = {
  primary: "var(--chart-primary)",
  secondary: "var(--chart-secondary)",
  grid: "var(--chart-grid)",
  tick: { fontSize: 11, fill: "var(--muted-foreground)" },
  dot: { r: 3, fill: "var(--chart-primary)", stroke: "var(--background)", strokeWidth: 1.5 },
  activeDot: { r: 5, fill: "var(--chart-primary)", stroke: "var(--background)", strokeWidth: 2 },
  tooltip: {
    background: "var(--popover)",
    color: "var(--foreground)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    padding: "10px 12px",
    fontSize: 12,
    boxShadow: "var(--surface-shadow)",
  },
} as const;

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProgressRing } from "./progress-ring";
describe("shared progress ring", () => {
  it("keeps counts separate from capped arc", () => {
    render(
      <ProgressRing value={140} label="Semanal">
        <strong>7/5</strong>
      </ProgressRing>,
    );
    expect(screen.getByRole("progressbar", { name: "Semanal" })).toHaveAttribute(
      "aria-valuenow",
      "100",
    );
    expect(screen.getByText("7/5")).toBeInTheDocument();
  });
  it("does not present missing data as zero", () => {
    render(<ProgressRing value={null} label="Ausente" />);
    expect(screen.getByRole("progressbar", { name: "Ausente" })).not.toHaveAttribute(
      "aria-valuenow",
    );
  });
  it("does not draw a false dot for zero", () => {
    const { container } = render(<ProgressRing value={0} label="Zero" />);
    expect(container.querySelectorAll("circle")).toHaveLength(1);
  });
});

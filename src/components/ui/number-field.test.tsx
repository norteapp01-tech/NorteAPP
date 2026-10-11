import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NumberField } from "./number-field";

describe("NumberField", () => {
  it("deixa apagar tudo sem sobrar um zero", () => {
    const onValue = vi.fn();
    const onEmpty = vi.fn();
    render(<NumberField aria-label="kg" value={20} onValue={onValue} onEmpty={onEmpty} />);
    const input = screen.getByLabelText("kg") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "" } });
    expect(input.value).toBe("");
    expect(onEmpty).toHaveBeenCalled();
    expect(onValue).not.toHaveBeenCalled();
  });

  it("digitar 7 e depois 0 vira 70, sem zero na frente", () => {
    const onValue = vi.fn();
    render(<NumberField aria-label="kg" value={20} onValue={onValue} />);
    const input = screen.getByLabelText("kg") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.change(input, { target: { value: "7" } });
    fireEvent.change(input, { target: { value: "70" } });
    expect(input.value).toBe("70");
    expect(onValue).toHaveBeenLastCalledWith(70);
  });

  it("seleciona o conteúdo ao entrar, então digitar já substitui", () => {
    render(<NumberField aria-label="kg" value={20} onValue={() => {}} />);
    const input = screen.getByLabelText("kg") as HTMLInputElement;
    const select = vi.spyOn(input, "select");
    fireEvent.focus(input);
    expect(select).toHaveBeenCalled();
  });

  it("campo vazio ao sair volta ao valor anterior", () => {
    render(<NumberField aria-label="kg" value={20} onValue={() => {}} />);
    const input = screen.getByLabelText("kg") as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(input.value).toBe("20");
  });
});

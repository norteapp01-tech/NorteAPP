import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { TimelineColumn } from "./Timeline";
import type { AgendaOccurrence } from "@/lib/agenda-occurrences";

function occ(o: Partial<AgendaOccurrence> & { key: string }): AgendaOccurrence {
  return {
    kind: "execution",
    title: o.key,
    date: "2026-10-12",
    startTime: "10:00",
    endTime: "11:00",
    allDay: false,
    category: "generico",
    rigid: false,
    weight: "leve",
    status: "planejada",
    recurring: false,
    source: "norte",
    ...o,
  };
}

function setup(
  items: AgendaOccurrence[],
  overnight: AgendaOccurrence[] = [],
  conflicts: string[] = [],
) {
  const handlers = {
    onOpen: vi.fn(),
    onCreate: vi.fn(),
    onCommit: vi.fn(async () => {}),
  };
  const view = render(
    <TimelineColumn
      date="2026-10-12"
      items={items}
      overnight={overnight}
      labelsById={new Map()}
      conflictIds={new Set(conflicts)}
      timeFormat="24h"
      {...handlers}
    />,
  );
  return { ...view, ...handlers };
}

const blocks = () => Array.from(document.querySelectorAll<HTMLElement>("[data-agenda-block]"));

describe("linha do tempo", () => {
  it("compromissos no mesmo horário ficam lado a lado, sem se sobrepor", () => {
    setup([occ({ key: "a" }), occ({ key: "b" })]);
    const [a, b] = blocks();
    expect(a.style.width).toBe("calc(50% - 3px)");
    expect(b.style.width).toBe("calc(50% - 3px)");
    expect(a.style.left).not.toBe(b.style.left);
  });

  it("evento sozinho ocupa a largura toda", () => {
    setup([occ({ key: "a" })]);
    expect(blocks()[0].style.width).toBe("calc(100% - 3px)");
  });

  it("mostra a continuação de um compromisso que vem da noite anterior", () => {
    setup([], [occ({ key: "n", date: "2026-10-11", startTime: "23:00", endTime: "01:00" })]);
    const [ghost] = blocks();
    expect(ghost.dataset.ghost).toBe("true");
    expect(ghost.style.top).toBe("0px");
    expect(ghost.textContent).toContain("de ontem");
  });

  it("evento que vira o dia vai até as 24:00 no primeiro dia e não tem alça de duração", () => {
    setup([occ({ key: "n", startTime: "23:00", endTime: "01:00" })]);
    const [block] = blocks();
    // 23:00 → 24:00 = 1h de altura
    expect(parseFloat(block.style.height)).toBeLessThanOrEqual(52);
    expect(block.querySelector(".agenda-resize")).toBeNull();
  });

  it("toque no espaço vazio cria no horário tocado, arredondado a 15 minutos", () => {
    const { container, onCreate } = setup([]);
    const column = container.querySelector("[data-agenda-col]") as HTMLElement;
    column.getBoundingClientRect = () => ({
      top: 0,
      left: 0,
      right: 100,
      bottom: 1248,
      width: 100,
      height: 1248,
      x: 0,
      y: 0,
      toJSON() {},
    });
    fireEvent.click(column, { clientY: 52 * 9 + 20 }); // 09:23 → 09:15
    expect(onCreate).toHaveBeenCalledWith("2026-10-12", 9 * 60 + 15);
  });

  it("tocar num compromisso não cria outro", () => {
    const { onCreate } = setup([occ({ key: "a" })]);
    fireEvent.click(blocks()[0]);
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("abre com Enter e move 15 minutos com as setas", () => {
    const { onOpen, onCommit } = setup([occ({ key: "a" })]);
    const block = blocks()[0];
    fireEvent.keyDown(block, { key: "Enter" });
    expect(onOpen).toHaveBeenCalled();
    fireEvent.keyDown(block, { key: "ArrowDown" });
    expect(onCommit).toHaveBeenCalledWith(expect.objectContaining({ key: "a" }), {
      date: "2026-10-12",
      startTime: "10:15",
      endTime: "11:15",
    });
    fireEvent.keyDown(block, { key: "ArrowDown", shiftKey: true });
    expect(onCommit).toHaveBeenLastCalledWith(expect.anything(), {
      date: "2026-10-12",
      startTime: "10:00",
      endTime: "11:15",
    });
  });

  it("mover um evento pode atravessar a meia-noite", () => {
    const { onCommit } = setup([occ({ key: "a", startTime: "23:30", endTime: "23:45" })]);
    fireEvent.keyDown(blocks()[0], { key: "ArrowDown" });
    // início 23:45 (máximo), fim 00:00 — duração preservada
    expect(onCommit).toHaveBeenCalledWith(expect.anything(), {
      date: "2026-10-12",
      startTime: "23:45",
      endTime: "00:00",
    });
  });

  it("compromisso cancelado não pode ser arrastado", () => {
    const { onCommit } = setup([occ({ key: "a", status: "cancelada" })]);
    fireEvent.keyDown(blocks()[0], { key: "ArrowDown" });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("avisa o conflito para leitores de tela", () => {
    setup([occ({ key: "a" }), occ({ key: "b" })], [], ["a", "b"]);
    expect(screen.getAllByRole("button", { name: /em conflito/i })).toHaveLength(2);
  });
});

describe("arrastar exige tocar e segurar (no toque)", () => {
  // jsdom não tem PointerEvent; um MouseEvent com pointerType/pointerId basta para o componente.
  const pointer = (el: HTMLElement, type: string, y: number, pointerType = "touch") => {
    const ev = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: 10, clientY: y });
    Object.assign(ev, { pointerType, pointerId: 1 });
    el.setPointerCapture = () => {};
    fireEvent(el, ev);
  };

  it("toque rápido abre o compromisso e não muda o horário", () => {
    const { onOpen, onCommit } = setup([occ({ key: "a" })]);
    const [a] = blocks();
    pointer(a, "pointerdown", 100);
    pointer(a, "pointerup", 100);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("deslizar o dedo sem segurar é rolagem: não move nem abre", () => {
    vi.useFakeTimers();
    const { onOpen, onCommit } = setup([occ({ key: "a" })]);
    const [a] = blocks();
    pointer(a, "pointerdown", 100);
    pointer(a, "pointermove", 160);
    pointer(a, "pointerup", 220);
    vi.runAllTimers();
    expect(onCommit).not.toHaveBeenCalled();
    expect(onOpen).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("segurou o tempo: o bloco levanta e o arraste muda o horário", async () => {
    vi.useFakeTimers();
    const { onCommit } = setup([occ({ key: "a" })]);
    const [a] = blocks();
    pointer(a, "pointerdown", 100);
    await act(async () => {
      vi.advanceTimersByTime(520);
    });
    expect(a.dataset.armed).toBe("true");
    pointer(a, "pointermove", 160);
    pointer(a, "pointerup", 400);
    vi.useRealTimers();
    expect(onCommit).toHaveBeenCalledTimes(1);
    const patch = (onCommit.mock.calls[0] as unknown[])[1] as { startTime: string };
    expect(patch.startTime).not.toBe("10:00");
  });

  it("com mouse o arraste continua imediato", () => {
    const { onCommit } = setup([occ({ key: "a" })]);
    const [a] = blocks();
    pointer(a, "pointerdown", 100, "mouse");
    pointer(a, "pointermove", 160, "mouse");
    pointer(a, "pointerup", 400, "mouse");
    expect(onCommit).toHaveBeenCalledTimes(1);
  });
});

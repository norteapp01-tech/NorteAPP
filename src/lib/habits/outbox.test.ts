import { describe, expect, it } from "vitest";
import { enqueue, flushOutbox, readOutbox, MAX_AUTO_ATTEMPTS, type OutboxOp } from "./outbox";

const mem = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
};
const sync = (ref: string, ml = 250): OutboxOp => ({
  kind: "sync",
  module: "agua",
  ref,
  date: "2026-11-11",
  metrics: { ml },
  attempts: 0,
});

describe("fila de módulos", () => {
  it("falha momentânea mantém a operação e a próxima tentativa conclui", async () => {
    const s = mem();
    enqueue(s, "u1", sync("a"));
    let fail = true;
    const run = async () => {
      if (fail) throw new Error("rede");
    };
    expect(await flushOutbox(s, "u1", run)).toEqual({ done: 0, pending: 1 });
    expect(readOutbox(s, "u1")[0]).toMatchObject({ attempts: 1, lastError: "rede" });
    fail = false;
    expect(await flushOutbox(s, "u1", run)).toEqual({ done: 1, pending: 0 });
  });
  it("a última operação do mesmo registro vence (editar antes de enviar)", () => {
    const s = mem();
    enqueue(s, "u1", sync("a", 250));
    enqueue(s, "u1", sync("a", 500));
    enqueue(s, "u1", { kind: "unsync", module: "agua", ref: "a", attempts: 0 });
    expect(readOutbox(s, "u1")).toHaveLength(1);
    expect(readOutbox(s, "u1")[0].kind).toBe("unsync");
  });
  it("isola usuários", () => {
    const s = mem();
    enqueue(s, "u1", sync("a"));
    expect(readOutbox(s, "u2")).toEqual([]);
  });
  it("uma falha não bloqueia as outras e operação nova durante o envio não se perde", async () => {
    const s = mem();
    enqueue(s, "u1", sync("a"));
    enqueue(s, "u1", sync("b"));
    const calls: string[] = [];
    const run = async (op: OutboxOp) => {
      calls.push(op.ref);
      if (op.ref === "a") {
        enqueue(s, "u1", sync("c")); // chega no meio do envio
        throw new Error("x");
      }
    };
    const r = await flushOutbox(s, "u1", run);
    expect(calls).toEqual(["a", "b"]);
    expect(r.done).toBe(1);
    expect(
      readOutbox(s, "u1")
        .map((o) => o.ref)
        .sort(),
    ).toEqual(["a", "c"]);
  });
  it("esgotadas as tentativas automáticas, ficam guardadas até envio manual", async () => {
    const s = mem();
    enqueue(s, "u1", { ...sync("a"), attempts: MAX_AUTO_ATTEMPTS });
    let ran = 0;
    const run = async () => void ran++;
    expect((await flushOutbox(s, "u1", run)).pending).toBe(1);
    expect(ran).toBe(0);
    expect((await flushOutbox(s, "u1", run, { includeStalled: true })).pending).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Fila persistente de sincronização com os módulos (Academia, Esportes, Leitura,
// Água). O registro do módulo já foi salvo; aqui garantimos que a rotina
// vinculada também receba — mesmo sem rede, com a aba fechada ou depois de um
// erro momentâneo. A fila fica no aparelho, separada por usuário, e é
// reenviada ao abrir o app, ao voltar a rede e a cada minuto enquanto houver
// pendência. O banco ignora repetições (referência única por rotina), então
// reenviar nunca duplica.
// ---------------------------------------------------------------------------

export type OutboxOp =
  | {
      kind: "sync";
      module: string;
      ref: string;
      date: string;
      metrics: Record<string, number>;
      attempts: number;
      lastError?: string;
    }
  | { kind: "unsync"; module: string; ref: string; attempts: number; lastError?: string };

export type OutboxStorage = Pick<Storage, "getItem" | "setItem">;

const keyOf = (userId: string) => `norte-habit-outbox:${userId}`;
const sameTarget = (a: OutboxOp, b: OutboxOp) => a.module === b.module && a.ref === b.ref;
/** Depois disso a operação continua guardada, mas deixa de ser tentada sozinha. */
export const MAX_AUTO_ATTEMPTS = 8;

export function readOutbox(storage: OutboxStorage, userId: string): OutboxOp[] {
  try {
    const raw = storage.getItem(keyOf(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as OutboxOp[]) : [];
  } catch {
    return [];
  }
}

function write(storage: OutboxStorage, userId: string, ops: OutboxOp[]) {
  try {
    storage.setItem(keyOf(userId), JSON.stringify(ops));
  } catch {
    /* armazenamento cheio/bloqueado: a tentativa imediata ainda acontece */
  }
}

/** A última operação para o mesmo registro de origem vale; as anteriores saem. */
export function enqueue(storage: OutboxStorage, userId: string, op: OutboxOp): OutboxOp[] {
  const next = [...readOutbox(storage, userId).filter((o) => !sameTarget(o, op)), op];
  write(storage, userId, next);
  return next;
}

export type Executor = (op: OutboxOp) => Promise<void>;

/**
 * Tenta enviar tudo, em ordem. Falha de uma operação não bloqueia as outras e
 * não a descarta: ela volta para a fila com o erro e uma tentativa a mais.
 * Devolve quantas foram concluídas e quantas continuam pendentes.
 */
export async function flushOutbox(
  storage: OutboxStorage,
  userId: string,
  run: Executor,
  opts: { includeStalled?: boolean } = {},
): Promise<{ done: number; pending: number }> {
  const snapshot = readOutbox(storage, userId);
  let done = 0;
  const failed: OutboxOp[] = [];
  for (const op of snapshot) {
    if (op.attempts >= MAX_AUTO_ATTEMPTS && !opts.includeStalled) {
      failed.push(op);
      continue;
    }
    try {
      await run(op);
      done += 1;
    } catch (e) {
      failed.push({
        ...op,
        attempts: op.attempts + 1,
        lastError: e instanceof Error ? e.message : String(e),
      });
    }
  }
  // Operações enfileiradas durante o envio não podem se perder: relê e funde.
  const during = readOutbox(storage, userId).filter(
    (o) => !snapshot.some((s) => sameTarget(s, o) && JSON.stringify(s) === JSON.stringify(o)),
  );
  const merged = [...failed.filter((f) => !during.some((d) => sameTarget(d, f))), ...during];
  write(storage, userId, merged);
  return { done, pending: merged.length };
}

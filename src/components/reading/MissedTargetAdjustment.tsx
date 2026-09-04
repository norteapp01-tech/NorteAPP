import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import {
  redistributeMissedTarget,
  moveMissedTarget,
  keepMissedTarget,
  type ReadingDailyTarget,
  type Book,
} from "@/lib/reading-store";
import { todayISO } from "@/lib/goals-store";

/** Linguagem estritamente neutra — sem "falhou"/"perdida"/"sequência quebrada". */
export function MissedTargetAdjustment({
  target,
  book,
  onClose,
}: {
  target: ReadingDailyTarget;
  book: Book | undefined;
  onClose: () => void;
}) {
  const [pickingDate, setPickingDate] = useState(false);
  const [date, setDate] = useState(todayISO());

  return (
    <Modal onClose={onClose} title="Ajustar leitura">
      {book && <p className="text-xs text-muted-foreground">{book.title}</p>}
      <p className="mt-3 text-sm">
        Sua leitura de {target.date.split("-").reverse().join("/")} ficou abaixo do planejado. Como
        prefere ajustar o restante?
      </p>

      {!pickingDate ? (
        <div className="mt-4 flex flex-col gap-2">
          <button
            onClick={async () => {
              await redistributeMissedTarget(target.id);
              onClose();
            }}
            className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground"
          >
            Redistribuir nos próximos dias
          </button>
          <button
            onClick={() => setPickingDate(true)}
            className="w-full rounded-xl border border-border py-3 text-sm font-semibold"
          >
            Mover para outro dia
          </button>
          <button
            onClick={async () => {
              await keepMissedTarget(target.id);
              onClose();
            }}
            className="w-full py-2 text-xs text-muted-foreground"
          >
            Deixar como está
          </button>
        </div>
      ) : (
        <div className="mt-4">
          <input
            type="date"
            min={todayISO()}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <button
            onClick={async () => {
              await moveMissedTarget(target.id, date);
              onClose();
            }}
            className="mt-3 w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground"
          >
            Confirmar
          </button>
        </div>
      )}
    </Modal>
  );
}

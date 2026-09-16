import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Modal } from "@/components/ui/modal";
import { InlineError } from "@/components/ui/inline-error";
import { useAsyncAction } from "@/hooks/use-async-action";
import { addDays, formatDateShortBR, toISODate, todayISO } from "@/lib/goals-store";
import { createCycle } from "@/lib/workout-cycle-store";

// ---------------------------------------------------------------------------
// Criar ciclo pede só o essencial: nome, início e duração. As etapas, treinos e
// metas são montados na página do ciclo — concentrar tudo aqui viraria um modal
// gigante onde nada cabe direito.
// ---------------------------------------------------------------------------

const DURATIONS = [30, 45, 60, 90];

export function CycleCreatorModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState(todayISO());
  const [days, setDays] = useState(60);
  const navigate = useNavigate();
  const action = useAsyncAction();

  const endDate = toISODate(addDays(new Date(startDate + "T00:00:00"), Math.max(1, days) - 1));
  const canSave = name.trim().length > 0 && days > 0;

  return (
    <Modal
      onClose={onClose}
      title="Novo ciclo de treino"
      footer={
        <div className="space-y-2">
          {action.error && <InlineError message={action.error} onRetry={action.clearError} />}
          <button
            disabled={!canSave || action.pending}
            onClick={() =>
              action.run(async () => {
                const id = await createCycle({
                  name: name.trim(),
                  startDate,
                  // Uma etapa cobrindo o período inteiro: um ponto de partida
                  // usável, que a pessoa divide na página do ciclo.
                  blocks: [{ name: "Etapa 1", durationDays: days }],
                });
                onClose();
                await navigate({ to: "/ciclo/$id", params: { id } });
              })
            }
            className="interactive-press w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-40"
          >
            {action.pending ? "Criando…" : "Criar e montar etapas"}
          </button>
          <p className="text-center text-[10px] text-muted-foreground">
            Nasce como rascunho. Só passa a valer quando você ativar.
          </p>
        </div>
      }
    >
      <label className="block">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Nome do ciclo
        </span>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex: Evolução de 60 dias"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
        />
      </label>

      <label className="mt-3 block">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Começa em
        </span>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value || todayISO())}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
        />
      </label>

      <fieldset className="mt-4">
        <legend className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Duração inicial
        </legend>
        <div className="grid grid-cols-4 gap-1.5">
          {DURATIONS.map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              aria-pressed={days === d}
              className={`interactive-press rounded-lg border py-2 text-[11px] font-semibold ${
                days === d ? "border-primary bg-primary/15 text-primary" : "border-border"
              }`}
            >
              {d} dias
            </button>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <input
            type="number"
            min={1}
            value={days}
            onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 1))}
            className="w-20 rounded-lg border border-border bg-surface px-2 py-2 text-right text-sm tabular-nums outline-none focus:border-primary"
          />
          <span className="text-[11px] text-muted-foreground">
            dias · termina {formatDateShortBR(endDate)}
          </span>
        </div>
      </fieldset>

      <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
        O ciclo começa com uma etapa cobrindo todo o período. Na próxima tela você divide em quantas
        etapas quiser e monta os treinos de cada uma.
      </p>
    </Modal>
  );
}

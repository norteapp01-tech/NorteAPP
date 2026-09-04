import { useState, type ChangeEvent } from "react";
import { Plus, X, Trash2, Image as ImageIcon } from "lucide-react";
import {
  useFinanceStore,
  addFinancialGoal,
  updateFinancialGoal,
  removeFinancialGoal,
  contributeToGoal,
  contributionsForGoal,
  projectedMonthlyPace,
  formatBRL,
  type FinancialGoal,
} from "@/lib/finance-store";

export function ObjetivosTab() {
  const goals = useFinanceStore((s) => s.goals);
  const [openGoalId, setOpenGoalId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        {goals.map((g) => (
          <GoalCard key={g.id} goal={g} onClick={() => setOpenGoalId(g.id)} />
        ))}
        <button
          onClick={() => setCreating(true)}
          className="flex min-h-32 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border text-xs text-muted-foreground hover:border-primary/40 hover:text-primary"
        >
          <Plus className="h-5 w-5" />
          novo objetivo
        </button>
      </div>

      {goals.length === 0 && (
        <p className="mt-3 text-sm text-muted-foreground">
          Crie um objetivo pra guardar dinheiro com propósito — uma viagem, uma reserva, o que fizer
          sentido.
        </p>
      )}

      {openGoalId && <GoalDetailSheet goalId={openGoalId} onClose={() => setOpenGoalId(null)} />}
      {creating && <NewGoalSheet onClose={() => setCreating(false)} />}
    </div>
  );
}

function GoalCard({ goal, onClick }: { goal: FinancialGoal; onClick: () => void }) {
  const pct =
    goal.targetAmount > 0
      ? Math.min(100, Math.round((goal.savedAmount / goal.targetAmount) * 100))
      : 0;
  return (
    <button
      onClick={onClick}
      className="card-surface flex flex-col overflow-hidden p-0 text-left hover:border-primary/40"
    >
      <div className="flex h-20 items-center justify-center bg-surface-2">
        {goal.imageUrl ? (
          <img src={goal.imageUrl} alt={goal.name} className="h-full w-full object-cover" />
        ) : (
          <ImageIcon className="h-6 w-6 text-muted-foreground/50" />
        )}
      </div>
      <div className="p-3">
        <p className="truncate text-sm font-semibold">{goal.name}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {formatBRL(goal.savedAmount)} / {formatBRL(goal.targetAmount)}
        </p>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1 text-[10px] text-primary">{pct}%</p>
      </div>
    </button>
  );
}

function GoalDetailSheet({ goalId, onClose }: { goalId: string; onClose: () => void }) {
  const state = useFinanceStore((s) => s);
  const goal = state.goals.find((g) => g.id === goalId);
  const [amount, setAmount] = useState("");
  const [editing, setEditing] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  if (!goal) return null;
  const pct =
    goal.targetAmount > 0
      ? Math.min(100, Math.round((goal.savedAmount / goal.targetAmount) * 100))
      : 0;
  const history = contributionsForGoal(state.contributions, goalId);
  const pace = projectedMonthlyPace(goal);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-background/85 backdrop-blur-sm sm:items-center sm:justify-center"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card-surface flex w-full max-w-md flex-col rounded-b-none rounded-t-3xl border-x-0 border-b-0 p-5 sm:rounded-3xl sm:border"
        style={{ maxHeight: "88vh" }}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">{goal.name}</h3>
          <button onClick={onClose}>
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <div className="mt-3 flex-1 space-y-4 overflow-y-auto">
          <div>
            <p className="text-2xl font-bold">
              {formatBRL(goal.savedAmount)}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                / {formatBRL(goal.targetAmount)}
              </span>
            </p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-1 text-xs text-primary">{pct}%</p>
            {goal.deadline && pace !== null && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Para chegar nessa meta até {goal.deadline.split("-").reverse().join("/")}, o ritmo
                necessário seria aproximadamente {formatBRL(pace)}/mês.
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="R$"
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <button
              onClick={async () => {
                const value = parseFloat(amount);
                if (!value || value <= 0) return;
                setAmount("");
                await contributeToGoal(goalId, value);
              }}
              className="shrink-0 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
            >
              + Guardar
            </button>
          </div>

          {history.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Histórico de aportes
              </p>
              <ul className="mt-1.5 space-y-1">
                {history.map((c) => (
                  <li key={c.id} className="flex justify-between text-xs text-muted-foreground">
                    <span>{c.date.split("-").reverse().join("/")}</span>
                    <span className="text-foreground">{formatBRL(c.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {editing ? (
            <EditGoalForm goal={goal} onDone={() => setEditing(false)} />
          ) : (
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setEditing(true)}
                className="flex-1 rounded-lg bg-surface-2 py-2 text-xs font-semibold"
              >
                Editar
              </button>
              {!confirmRemove ? (
                <button
                  onClick={() => setConfirmRemove(true)}
                  className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-surface-2 py-2 text-xs font-semibold text-danger"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Remover
                </button>
              ) : (
                <button
                  onClick={async () => {
                    await removeFinancialGoal(goalId);
                    onClose();
                  }}
                  className="flex-1 rounded-lg bg-danger py-2 text-xs font-semibold text-white"
                >
                  Confirmar remoção
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EditGoalForm({ goal, onDone }: { goal: FinancialGoal; onDone: () => void }) {
  const [name, setName] = useState(goal.name);
  const [target, setTarget] = useState(String(goal.targetAmount));
  const [deadline, setDeadline] = useState(goal.deadline ?? "");

  const save = async () => {
    await updateFinancialGoal(goal.id, {
      name: name.trim() || goal.name,
      targetAmount: parseFloat(target) || goal.targetAmount,
      deadline: deadline || undefined,
    });
    onDone();
  };

  return (
    <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
      />
      <input
        type="number"
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
      />
      <input
        type="date"
        value={deadline}
        onChange={(e) => setDeadline(e.target.value)}
        className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
      />
      <button
        onClick={save}
        className="w-full rounded-lg bg-primary py-2 text-xs font-semibold text-primary-foreground"
      >
        Salvar
      </button>
    </div>
  );
}

function NewGoalSheet({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [saved, setSaved] = useState("");
  const [deadline, setDeadline] = useState("");
  const [imageUrl, setImageUrl] = useState<string | undefined>(undefined);

  const onImageFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImageUrl(String(reader.result));
    reader.readAsDataURL(file);
  };

  const save = async () => {
    if (!name.trim() || !parseFloat(target)) return;
    await addFinancialGoal({
      name,
      targetAmount: parseFloat(target),
      savedAmount: saved ? parseFloat(saved) : undefined,
      deadline: deadline || undefined,
      imageUrl,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-background/85 backdrop-blur-sm sm:items-center sm:justify-center"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card-surface w-full max-w-md rounded-b-none rounded-t-3xl border-x-0 border-b-0 p-5 sm:rounded-3xl sm:border"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">Novo objetivo</h3>
          <button onClick={onClose}>
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-2">
              {imageUrl ? (
                <img src={imageUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <ImageIcon className="h-5 w-5 text-muted-foreground/50" />
              )}
            </div>
            <label className="cursor-pointer text-xs text-primary">
              adicionar imagem (opcional)
              <input type="file" accept="image/*" onChange={onImageFile} className="hidden" />
            </label>
          </div>

          <label className="block">
            <span className="mb-0.5 block text-[9px] uppercase text-muted-foreground">Nome</span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex: Viagem Japão"
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </label>
          <label className="block">
            <span className="mb-0.5 block text-[9px] uppercase text-muted-foreground">
              Valor desejado
            </span>
            <input
              type="number"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </label>
          <label className="block">
            <span className="mb-0.5 block text-[9px] uppercase text-muted-foreground">
              Valor já guardado (opcional)
            </span>
            <input
              type="number"
              value={saved}
              onChange={(e) => setSaved(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </label>
          <label className="block">
            <span className="mb-0.5 block text-[9px] uppercase text-muted-foreground">
              Prazo (opcional)
            </span>
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </label>
        </div>

        <button
          onClick={save}
          disabled={!name.trim() || !parseFloat(target)}
          className="mt-5 w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40"
        >
          Criar objetivo
        </button>
      </div>
    </div>
  );
}

import { useState, type ChangeEvent } from "react";
import { Plus, Trash2, Image as ImageIcon, ArrowRightLeft, ChevronRight } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { Modal } from "@/components/ui/modal";
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
import { createGoal } from "@/lib/goals-store";

export function ObjetivosTab() {
  const state = useFinanceStore((s) => s);
  const goals = state.goals;
  const [openGoalId, setOpenGoalId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const savedTotal = goals.reduce((sum, goal) => sum + goal.savedAmount, 0);
  const latestContribution = [...state.contributions].sort((a, b) =>
    b.date.localeCompare(a.date),
  )[0];

  return (
    <div className="finance-goals">
      <div className="finance-goals-heading">
        <div>
          <h2>Sonhos e objetivos</h2>
          <p>Dê um destino ao que você guarda.</p>
        </div>
        <p>
          <strong>{formatBRL(savedTotal)}</strong>
          <span>guardados</span>
        </p>
      </div>
      <div className="finance-goal-grid">
        {goals.map((g) => (
          <GoalCard key={g.id} goal={g} onClick={() => setOpenGoalId(g.id)} />
        ))}
      </div>

      <button onClick={() => setCreating(true)} className="finance-new-goal interactive-press">
        <Plus /> Novo objetivo
      </button>

      {latestContribution && (
        <button
          onClick={() => setOpenGoalId(latestContribution.goalId)}
          className="finance-contributions-link interactive-press"
        >
          <ArrowRightLeft />
          <span>
            <strong>Aportes recentes</strong>
            <small>Veja seus últimos aportes nos objetivos.</small>
          </span>
          <ChevronRight />
        </button>
      )}

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
    <button onClick={onClick} className="finance-goal-card interactive-press">
      <div className="finance-goal-image">
        {goal.imageUrl ? (
          <img src={goal.imageUrl} alt={goal.name} className="h-full w-full object-cover" />
        ) : (
          <ImageIcon />
        )}
      </div>
      <div className="finance-goal-card-copy">
        <div className="finance-goal-card-title">
          <p>{goal.name}</p>
          <strong>{pct}%</strong>
        </div>
        <p className="finance-goal-amount">
          {formatBRL(goal.savedAmount)} / {formatBRL(goal.targetAmount)}
        </p>
        <div className="finance-goal-progress">
          <div className="progress-fill h-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
        <p className="finance-goal-deadline">
          {goal.deadline ? `até ${goal.deadline.split("-").reverse().join("/")}` : "sem prazo"}
          <ChevronRight />
        </p>
      </div>
    </button>
  );
}

function GoalDetailSheet({ goalId, onClose }: { goalId: string; onClose: () => void }) {
  const navigate = useNavigate();
  const state = useFinanceStore((s) => s);
  const goal = state.goals.find((g) => g.id === goalId);
  const [amount, setAmount] = useState("");
  const [editing, setEditing] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [creatingPlan, setCreatingPlan] = useState(false);
  const [contributing, setContributing] = useState(false);

  if (!goal) return null;
  const pct =
    goal.targetAmount > 0
      ? Math.min(100, Math.round((goal.savedAmount / goal.targetAmount) * 100))
      : 0;
  const history = contributionsForGoal(state.contributions, goalId);
  const pace = projectedMonthlyPace(goal);

  return (
    <Modal onClose={onClose} title={goal.name}>
      <div className="space-y-4">
        <div>
          <p className="text-2xl font-bold">
            {formatBRL(goal.savedAmount)}{" "}
            <span className="text-sm font-normal text-muted-foreground">
              / {formatBRL(goal.targetAmount)}
            </span>
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
            <div className="progress-fill h-full bg-primary" style={{ width: `${pct}%` }} />
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
            disabled={contributing}
            onClick={async () => {
              if (contributing) return;
              const value = parseFloat(amount);
              if (!value || value <= 0) return;
              setContributing(true);
              setAmount("");
              try {
                await contributeToGoal(goalId, value);
              } finally {
                setContributing(false);
              }
            }}
            className="shrink-0 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60"
          >
            + Guardar
          </button>
        </div>

        <div className="rounded-xl border border-border bg-surface-2 p-3">
          <p className="text-xs font-semibold">Planejamento da conquista</p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            Opcional: divida este objetivo em etapas e acompanhe o cronograma na aba Plano.
          </p>
          <button
            disabled={creatingPlan}
            onClick={async () => {
              if (goal.planId) {
                onClose();
                navigate({ to: "/objetivo/$id", params: { id: goal.planId } });
                return;
              }
              setCreatingPlan(true);
              try {
                const created = await createGoal({
                  title: goal.name,
                  why: `Conquistar ${goal.name}`,
                  finalOutcome: `Ter ${formatBRL(goal.targetAmount)} destinados a este objetivo`,
                  trackingType: "etapas",
                  kind: "projeto",
                  category: "financas",
                  lifeArea: "financas",
                  deadlineLabel: goal.deadline
                    ? `Até ${goal.deadline.split("-").reverse().join("/")}`
                    : "Sem prazo definido",
                  deadlineISO: goal.deadline,
                  metric: { target: goal.targetAmount, unit: "R$" },
                  steps: [{ title: "Definir o primeiro marco financeiro" }],
                });
                await updateFinancialGoal(goal.id, { planId: created.id });
                onClose();
                navigate({ to: "/objetivo/$id", params: { id: created.id } });
              } finally {
                setCreatingPlan(false);
              }
            }}
            className="mt-3 w-full rounded-lg border border-primary/50 py-2 text-xs font-semibold text-primary disabled:opacity-50"
          >
            {goal.planId ? "Abrir planejamento" : creatingPlan ? "Criando…" : "Criar planejamento"}
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
    </Modal>
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
    <Modal onClose={onClose} title="Novo objetivo">
      <div className="space-y-3">
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
    </Modal>
  );
}

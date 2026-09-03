import { useSyncExternalStore } from "react";
import { toISODate, addDays, todayISO } from "./goals-store";

// ---------------------------------------------------------------------------
// Finanças — diário financeiro, não extrato bancário. Tudo aqui é o que o
// usuário REGISTROU, nunca um saldo sincronizado de banco/cartão. Os
// seletores abaixo recebem os arrays e devolvem valores puros — é a
// "arquitetura pronta pra perguntas futuras" (ex.: uma IA perguntando
// "quanto gastei com Uber esse mês?" só precisa chamar essas funções).
// ---------------------------------------------------------------------------

export type TransactionType = "expense" | "income";
export type Transaction = {
  id: string;
  type: TransactionType;
  amount: number;
  description: string;
  category: string;
  date: string; // YYYY-MM-DD
  isFixed?: boolean;
  recurrence?: "none" | "monthly";
  paymentMethod?: string;
  note?: string;
  createdAt: string;
};

export type SavingsGoalMonthly = { month: string; targetAmount: number };
export type CategoryLimit = { id: string; category: string; limitAmount: number };

export type FinancialGoal = {
  id: string;
  name: string;
  targetAmount: number;
  savedAmount: number;
  deadline?: string;
  imageUrl?: string;
  createdAt: string;
};
export type GoalContribution = {
  id: string;
  goalId: string;
  amount: number;
  date: string;
  note?: string;
};

export type FinancialIntention = { id: string; text: string; createdAt: string };

export type CheckInAnswer = "consegui" | "mais_ou_menos" | "nao_consegui";
export type CheckIn = {
  id: string;
  weekStart: string;
  question: string;
  answer?: CheckInAnswer;
  note?: string;
  respondedAt?: string;
};

export type CategoryKind = "fixed" | "flexible";
export const FINANCE_CATEGORIES: { id: string; label: string; kind: CategoryKind }[] = [
  { id: "Alimentação", label: "Alimentação", kind: "flexible" },
  { id: "Transporte", label: "Transporte", kind: "flexible" },
  { id: "Lazer", label: "Lazer", kind: "flexible" },
  { id: "Compras", label: "Compras", kind: "flexible" },
  { id: "Assinaturas", label: "Assinaturas", kind: "fixed" },
  { id: "Aluguel", label: "Aluguel", kind: "fixed" },
  { id: "Academia", label: "Academia", kind: "fixed" },
  { id: "Trabalho/Receita", label: "Trabalho/Receita", kind: "flexible" },
  { id: "Outros", label: "Outros", kind: "flexible" },
];
export function categoryKind(category: string): CategoryKind {
  return FINANCE_CATEGORIES.find((c) => c.id === category)?.kind ?? "flexible";
}

type State = {
  transactions: Transaction[];
  savingsGoals: SavingsGoalMonthly[];
  categoryLimits: CategoryLimit[];
  goals: FinancialGoal[];
  contributions: GoalContribution[];
  intentions: FinancialIntention[];
  checkIns: CheckIn[];
};

let seq = 0;
function genId(prefix: string) {
  seq += 1;
  return `${prefix}${Date.now().toString(36)}${seq}`;
}

export function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function monthOf(date: string): string {
  return date.slice(0, 7);
}
export function currentMonth(): string {
  return monthOf(todayISO());
}
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(
    new Date(y, m - 1, 1),
  );
}
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

// ---------------------------------------------------------------------------
// Seletores puros
// ---------------------------------------------------------------------------
export function transactionsForMonth(transactions: Transaction[], month: string): Transaction[] {
  return transactions.filter((t) => monthOf(t.date) === month);
}

export function totalsForMonth(
  transactions: Transaction[],
  contributions: GoalContribution[],
  savingsGoals: SavingsGoalMonthly[],
  month: string,
): { income: number; expenses: number; saved: number; available: number } {
  const monthTx = transactionsForMonth(transactions, month);
  const income = monthTx.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const expenses = monthTx.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const saved = contributions
    .filter((c) => monthOf(c.date) === month)
    .reduce((s, c) => s + c.amount, 0);
  const goalTarget = savingsGoals.find((g) => g.month === month)?.targetAmount ?? 0;
  const available = income - expenses - saved - Math.max(0, goalTarget - saved);
  return { income, expenses, saved, available };
}

export function categoryBreakdown(
  transactions: Transaction[],
  month: string,
): { category: string; amount: number; pct: number }[] {
  const monthExpenses = transactionsForMonth(transactions, month).filter(
    (t) => t.type === "expense",
  );
  const total = monthExpenses.reduce((s, t) => s + t.amount, 0);
  const byCategory = new Map<string, number>();
  for (const t of monthExpenses)
    byCategory.set(t.category, (byCategory.get(t.category) ?? 0) + t.amount);
  return [...byCategory.entries()]
    .map(([category, amount]) => ({
      category,
      amount,
      pct: total > 0 ? Math.round((amount / total) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount);
}

export function monthlyTrend(
  transactions: Transaction[],
  nMonths: number,
): { month: string; income: number; expenses: number }[] {
  const months: string[] = [];
  for (let i = nMonths - 1; i >= 0; i--) months.push(addMonths(currentMonth(), -i));
  return months.map((month) => {
    const monthTx = transactionsForMonth(transactions, month);
    return {
      month,
      income: monthTx.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0),
      expenses: monthTx.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0),
    };
  });
}

export function spentForCategory(
  transactions: Transaction[],
  category: string,
  month: string,
): number {
  return transactionsForMonth(transactions, month)
    .filter((t) => t.type === "expense" && t.category === category)
    .reduce((s, t) => s + t.amount, 0);
}

export function limitsWithProgress(
  transactions: Transaction[],
  limits: CategoryLimit[],
  month: string,
): { id: string; category: string; spent: number; limit: number }[] {
  return limits.map((l) => ({
    id: l.id,
    category: l.category,
    spent: spentForCategory(transactions, l.category, month),
    limit: l.limitAmount,
  }));
}

/** Categoria flexível com mais "espaço" (maior gasto entre as flexíveis) — usada nas sugestões. */
export function biggestFlexibleCategory(
  transactions: Transaction[],
  month: string,
): { category: string; amount: number } | null {
  const flexible = categoryBreakdown(transactions, month).filter(
    (c) => categoryKind(c.category) === "flexible",
  );
  return flexible[0] ? { category: flexible[0].category, amount: flexible[0].amount } : null;
}

export type Insight = { id: string; text: string };

/** Heurística determinística V1 — substituível por IA depois sem mudar a forma dos dados. */
export function computeInsights(state: State, month: string): Insight[] {
  const insights: Insight[] = [];
  const prevMonth = addMonths(month, -1);
  const current = categoryBreakdown(state.transactions, month);
  const previous = categoryBreakdown(state.transactions, prevMonth);

  // 1) sugestão de redução se a meta de guardar está em risco
  const totals = totalsForMonth(state.transactions, state.contributions, state.savingsGoals, month);
  const goalTarget = state.savingsGoals.find((g) => g.month === month)?.targetAmount ?? 0;
  const gap = goalTarget - totals.saved;
  if (gap > 0) {
    const candidate = biggestFlexibleCategory(state.transactions, month);
    if (candidate && candidate.amount > 0) {
      const reduction = Math.min(gap, candidate.amount);
      if (reduction >= 20) {
        insights.push({
          id: "gap",
          text: `Se reduzir aproximadamente R$${Math.round(reduction)} em ${candidate.category.toLowerCase()}, você consegue completar sua meta de guardar deste mês.`,
        });
      }
    }
  }

  // 2) maior alta percentual mês a mês por categoria
  let biggestIncrease: { category: string; pct: number } | null = null;
  for (const c of current) {
    const prev = previous.find((p) => p.category === c.category);
    if (!prev || prev.amount <= 0) continue;
    const pct = Math.round(((c.amount - prev.amount) / prev.amount) * 100);
    if (pct >= 20 && (!biggestIncrease || pct > biggestIncrease.pct)) {
      biggestIncrease = { category: c.category, pct };
    }
  }
  if (biggestIncrease) {
    insights.push({
      id: "increase",
      text: `${biggestIncrease.category} aumentou ${biggestIncrease.pct}% em relação ao mês passado.`,
    });
  }

  // 3) maior gasto único por descrição (ex.: "Você gastou R$340 com Uber este mês.")
  const byDescription = new Map<string, number>();
  for (const t of transactionsForMonth(state.transactions, month)) {
    if (t.type !== "expense") continue;
    byDescription.set(t.description, (byDescription.get(t.description) ?? 0) + t.amount);
  }
  const topDescription = [...byDescription.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topDescription && topDescription[1] >= 100) {
    insights.push({
      id: "top",
      text: `Você gastou R$${Math.round(topDescription[1])} com ${topDescription[0]} este mês.`,
    });
  }

  // 4) ritmo atual vs. limite configurado
  const dayOfMonth = month === currentMonth() ? new Date().getDate() : daysInMonth(month);
  const monthDays = daysInMonth(month);
  const expectedPace = dayOfMonth / monthDays;
  for (const l of limitsWithProgress(state.transactions, state.categoryLimits, month)) {
    if (l.limit <= 0) continue;
    const actualPace = l.spent / l.limit;
    if (actualPace > expectedPace + 0.2 && actualPace < 1.5) {
      insights.push({
        id: `pace-${l.category}`,
        text: `Seu ritmo atual de ${l.category.toLowerCase()} está acima do que você planejou.`,
      });
    }
  }

  return insights.slice(0, 3);
}

export function projectedMonthlyPace(goal: FinancialGoal): number | null {
  if (!goal.deadline) return null;
  const remaining = Math.max(0, goal.targetAmount - goal.savedAmount);
  const today = new Date();
  const deadline = new Date(goal.deadline + "T00:00:00");
  const months = Math.max(
    1,
    (deadline.getFullYear() - today.getFullYear()) * 12 + (deadline.getMonth() - today.getMonth()),
  );
  return remaining / months;
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------
function buildSeedState(): State {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed
  const todayDay = now.getDate();
  const tx: Transaction[] = [];
  let counter = 0;

  // Ancorado no dia do calendário (nunca em "N dias atrás de hoje") — evita que um
  // lançamento "deste mês" acabe caindo no mês anterior quando hoje é cedo no mês.
  // Dias pedidos além do que já passou neste mês colapsam no dia mais recente possível.
  const push = (
    monthOffset: number,
    day: number,
    type: TransactionType,
    amount: number,
    description: string,
    category: string,
    isFixed = false,
  ) => {
    // Proporcional aos dias já decorridos do mês corrente, nunca colapsando tudo no mesmo dia.
    const safeDay =
      monthOffset === 0 ? Math.max(1, Math.min(todayDay, Math.round((day / 30) * todayDay))) : day;
    const d = new Date(year, month + monthOffset, safeDay);
    counter += 1;
    tx.push({
      id: `seed-tx-${counter}`,
      type,
      amount,
      description,
      category,
      date: toISODate(d),
      isFixed,
      createdAt: d.toISOString(),
    });
  };

  // mês corrente
  push(0, 3, "income", 6200, "Salário", "Trabalho/Receita");
  push(0, 10, "income", 500, "Freelance", "Trabalho/Receita");
  push(0, 2, "expense", 1800, "Aluguel", "Aluguel", true);
  push(0, 4, "expense", 120, "Academia", "Academia", true);
  push(0, 5, "expense", 55.9, "Netflix + Spotify", "Assinaturas", true);
  push(0, 12, "expense", 340, "Uber", "Transporte");
  push(0, 14, "expense", 210, "Restaurante", "Alimentação");
  push(0, 16, "expense", 180, "Mercado", "Alimentação");
  push(0, 18, "expense", 280, "Cinema + bar", "Lazer");
  push(0, 21, "expense", 150, "Tênis novo", "Compras");
  push(0, 24, "expense", 96, "Ifood", "Alimentação");
  push(0, 27, "expense", 65, "Uber", "Transporte");
  push(0, 29, "expense", 8, "Barrinha de proteína", "Alimentação");
  push(0, 30, "expense", 32, "Uber", "Transporte");

  // mês anterior (pra comparação mês-a-mês)
  push(-1, 3, "income", 6200, "Salário", "Trabalho/Receita");
  push(-1, 2, "expense", 1800, "Aluguel", "Aluguel", true);
  push(-1, 5, "expense", 55.9, "Netflix + Spotify", "Assinaturas", true);
  push(-1, 10, "expense", 640, "Restaurante", "Alimentação");
  push(-1, 14, "expense", 210, "Uber", "Transporte");
  push(-1, 18, "expense", 220, "Lazer", "Lazer");
  push(-1, 22, "expense", 100, "Compras", "Compras");

  const goals: FinancialGoal[] = [
    {
      id: "goal-emergencia",
      name: "Reserva de emergência",
      targetAmount: 30000,
      savedAmount: 18000,
      createdAt: toISODate(addDays(now, -180)),
    },
    {
      id: "goal-japao",
      name: "Viagem Japão",
      targetAmount: 20000,
      savedAmount: 8500,
      deadline: toISODate(addDays(now, 300)),
      createdAt: toISODate(addDays(now, -90)),
    },
  ];

  const contributions: GoalContribution[] = [
    { id: "gc1", goalId: "goal-emergencia", amount: 1000, date: toISODate(addDays(now, -10)) },
    { id: "gc2", goalId: "goal-japao", amount: 500, date: toISODate(addDays(now, -5)) },
  ];

  const intentions: FinancialIntention[] = [
    {
      id: "int1",
      text: "Quero gastar menos com Uber essa semana para guardar mais.",
      createdAt: toISODate(addDays(now, -3)),
    },
  ];

  const checkIns: CheckIn[] = [
    {
      id: "ci1",
      weekStart: toISODate(addDays(now, -now.getDay())),
      question: "Você queria reduzir Uber esta semana. Como foi?",
    },
  ];

  return {
    transactions: tx,
    savingsGoals: [{ month: currentMonth(), targetAmount: 2000 }],
    categoryLimits: [
      { id: "lim1", category: "Alimentação", limitAmount: 800 },
      { id: "lim2", category: "Lazer", limitAmount: 600 },
      { id: "lim3", category: "Compras", limitAmount: 1000 },
    ],
    goals,
    contributions,
    intentions,
    checkIns,
  };
}

// ---------------------------------------------------------------------------
// Store reativo
// ---------------------------------------------------------------------------
let state: State = buildSeedState();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const getSnapshot = () => state;

function set(updater: (s: State) => State) {
  state = updater(state);
  emit();
}

export function useFinanceStore<T>(selector: (s: State) => T): T {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return selector(snap);
}

// ---------------------------------------------------------------------------
// Ações — transações
// ---------------------------------------------------------------------------
export function addTransaction(input: {
  type: TransactionType;
  amount: number;
  description: string;
  category: string;
  date?: string;
  isFixed?: boolean;
  recurrence?: "none" | "monthly";
  paymentMethod?: string;
  note?: string;
}): string {
  const id = genId("tx");
  set((s) => ({
    ...s,
    transactions: [
      {
        id,
        type: input.type,
        amount: input.amount,
        description: input.description.trim(),
        category: input.category,
        date: input.date ?? todayISO(),
        isFixed: input.isFixed,
        recurrence: input.recurrence ?? "none",
        paymentMethod: input.paymentMethod,
        note: input.note,
        createdAt: new Date().toISOString(),
      },
      ...s.transactions,
    ],
  }));
  return id;
}

export function removeTransaction(id: string) {
  set((s) => ({ ...s, transactions: s.transactions.filter((t) => t.id !== id) }));
}

// ---------------------------------------------------------------------------
// Ações — planejamento
// ---------------------------------------------------------------------------
export function setSavingsGoal(month: string, targetAmount: number) {
  set((s) => {
    const rest = s.savingsGoals.filter((g) => g.month !== month);
    return { ...s, savingsGoals: [...rest, { month, targetAmount }] };
  });
}

export function addCategoryLimit(category: string, limitAmount: number): string {
  const id = genId("lim");
  set((s) => ({ ...s, categoryLimits: [...s.categoryLimits, { id, category, limitAmount }] }));
  return id;
}
export function updateCategoryLimit(id: string, limitAmount: number) {
  set((s) => ({
    ...s,
    categoryLimits: s.categoryLimits.map((l) => (l.id === id ? { ...l, limitAmount } : l)),
  }));
}
export function removeCategoryLimit(id: string) {
  set((s) => ({ ...s, categoryLimits: s.categoryLimits.filter((l) => l.id !== id) }));
}

export function setIntention(text: string) {
  const id = genId("int");
  set((s) => ({
    ...s,
    intentions: [{ id, text: text.trim(), createdAt: todayISO() }, ...s.intentions],
  }));
}

// ---------------------------------------------------------------------------
// Ações — objetivos financeiros
// ---------------------------------------------------------------------------
export function addFinancialGoal(input: {
  name: string;
  targetAmount: number;
  savedAmount?: number;
  deadline?: string;
  imageUrl?: string;
}): string {
  const id = genId("fgoal");
  set((s) => ({
    ...s,
    goals: [
      ...s.goals,
      {
        id,
        name: input.name.trim(),
        targetAmount: input.targetAmount,
        savedAmount: input.savedAmount ?? 0,
        deadline: input.deadline,
        imageUrl: input.imageUrl,
        createdAt: new Date().toISOString(),
      },
    ],
  }));
  return id;
}

export function updateFinancialGoal(
  id: string,
  patch: Partial<Pick<FinancialGoal, "name" | "targetAmount" | "deadline" | "imageUrl">>,
) {
  set((s) => ({ ...s, goals: s.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)) }));
}

export function removeFinancialGoal(id: string) {
  set((s) => ({
    ...s,
    goals: s.goals.filter((g) => g.id !== id),
    contributions: s.contributions.filter((c) => c.goalId !== id),
  }));
}

/** Aportar dinheiro a um objetivo é uma ALOCAÇÃO, nunca uma despesa — não cria Transaction. */
export function contributeToGoal(goalId: string, amount: number, note?: string) {
  const id = genId("gc");
  set((s) => ({
    ...s,
    goals: s.goals.map((g) =>
      g.id === goalId ? { ...g, savedAmount: g.savedAmount + amount } : g,
    ),
    contributions: [{ id, goalId, amount, date: todayISO(), note }, ...s.contributions],
  }));
}

export function contributionsForGoal(
  contributions: GoalContribution[],
  goalId: string,
): GoalContribution[] {
  return contributions
    .filter((c) => c.goalId === goalId)
    .sort((a, b) => b.date.localeCompare(a.date));
}

// ---------------------------------------------------------------------------
// Ações — check-in
// ---------------------------------------------------------------------------
export function answerCheckIn(id: string, answer: CheckInAnswer, note?: string) {
  set((s) => ({
    ...s,
    checkIns: s.checkIns.map((c) =>
      c.id === id ? { ...c, answer, note, respondedAt: new Date().toISOString() } : c,
    ),
  }));
}

export function pendingCheckIn(checkIns: CheckIn[]): CheckIn | undefined {
  return checkIns.find((c) => !c.answer);
}

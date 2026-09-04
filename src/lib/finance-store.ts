import { useQuery } from "@tanstack/react-query";
import { todayISO } from "./goals-store";
import { supabase, ensureSession, useSupabaseUserId } from "./supabase/client";
import { queryClient } from "./query-client";
import { nowDate } from "./test-clock";

// ---------------------------------------------------------------------------
// Finanças — diário financeiro, não extrato bancário. Tudo aqui é o que o
// usuário REGISTROU, nunca um saldo sincronizado de banco/cartão. Os
// seletores abaixo recebem os arrays e devolvem valores puros — é a
// "arquitetura pronta pra perguntas futuras" (ex.: uma IA perguntando
// "quanto gastei com Uber esse mês?" só precisa chamar essas funções).
//
// Persistida no Supabase (mesmo padrão de goals-store.ts).
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

const EMPTY_STATE: State = {
  transactions: [],
  savingsGoals: [],
  categoryLimits: [],
  goals: [],
  contributions: [],
  intentions: [],
  checkIns: [],
};

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
// Seletores puros — nada muda aqui.
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

  const dayOfMonth = month === currentMonth() ? nowDate().getDate() : daysInMonth(month);
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
  const today = nowDate();
  const deadline = new Date(goal.deadline + "T00:00:00");
  const months = Math.max(
    1,
    (deadline.getFullYear() - today.getFullYear()) * 12 + (deadline.getMonth() - today.getMonth()),
  );
  return remaining / months;
}

export function contributionsForGoal(
  contributions: GoalContribution[],
  goalId: string,
): GoalContribution[] {
  return contributions
    .filter((c) => c.goalId === goalId)
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function pendingCheckIn(checkIns: CheckIn[]): CheckIn | undefined {
  return checkIns.find((c) => !c.answer);
}

// ---------------------------------------------------------------------------
// Mapeamento snake_case (Supabase) -> camelCase
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

function mapTransaction(r: Row): Transaction {
  return {
    id: r.id as string,
    type: r.type as TransactionType,
    amount: r.amount as number,
    description: r.description as string,
    category: r.category as string,
    date: r.date as string,
    isFixed: (r.is_fixed as boolean) ?? undefined,
    recurrence: (r.recurrence as "none" | "monthly") ?? "none",
    paymentMethod: (r.payment_method as string) ?? undefined,
    note: (r.note as string) ?? undefined,
    createdAt: r.created_at as string,
  };
}

function mapSavingsGoal(r: Row): SavingsGoalMonthly {
  return { month: r.month as string, targetAmount: r.target_amount as number };
}

function mapCategoryLimit(r: Row): CategoryLimit {
  return {
    id: r.id as string,
    category: r.category as string,
    limitAmount: r.limit_amount as number,
  };
}

function mapFinancialGoal(r: Row): FinancialGoal {
  return {
    id: r.id as string,
    name: r.name as string,
    targetAmount: r.target_amount as number,
    savedAmount: (r.saved_amount as number) ?? 0,
    deadline: (r.deadline as string) ?? undefined,
    imageUrl: (r.image_url as string) ?? undefined,
    createdAt: r.created_at as string,
  };
}

function mapContribution(r: Row): GoalContribution {
  return {
    id: r.id as string,
    goalId: r.goal_id as string,
    amount: r.amount as number,
    date: r.date as string,
    note: (r.note as string) ?? undefined,
  };
}

function mapIntention(r: Row): FinancialIntention {
  return { id: r.id as string, text: r.text as string, createdAt: r.created_at as string };
}

function mapCheckIn(r: Row): CheckIn {
  return {
    id: r.id as string,
    weekStart: r.week_start as string,
    question: r.question as string,
    answer: (r.answer as CheckInAnswer) ?? undefined,
    note: (r.note as string) ?? undefined,
    respondedAt: (r.responded_at as string) ?? undefined,
  };
}

async function fetchState(): Promise<State> {
  const [txRes, savingsRes, limitsRes, goalsRes, contribRes, intentionsRes, checkInsRes] =
    await Promise.all([
      supabase.from("transactions").select("*").order("date", { ascending: false }),
      supabase.from("savings_goals_monthly").select("*"),
      supabase.from("category_limits").select("*"),
      supabase.from("financial_goals").select("*").order("created_at", { ascending: false }),
      supabase.from("goal_contributions").select("*").order("date", { ascending: false }),
      supabase.from("financial_intentions").select("*").order("created_at", { ascending: false }),
      supabase.from("check_ins").select("*"),
    ]);
  const txRows = unwrap(txRes);
  const savingsRows = unwrap(savingsRes);
  const limitRows = unwrap(limitsRes);
  const goalRows = unwrap(goalsRes);
  const contribRows = unwrap(contribRes);
  const intentionRows = unwrap(intentionsRes);
  const checkInRows = unwrap(checkInsRes);

  return {
    transactions: (txRows as Row[]).map(mapTransaction),
    savingsGoals: (savingsRows as Row[]).map(mapSavingsGoal),
    categoryLimits: (limitRows as Row[]).map(mapCategoryLimit),
    goals: (goalRows as Row[]).map(mapFinancialGoal),
    contributions: (contribRows as Row[]).map(mapContribution),
    intentions: (intentionRows as Row[]).map(mapIntention),
    checkIns: (checkInRows as Row[]).map(mapCheckIn),
  };
}

const QUERY_KEY = ["finance-domain"] as const;
function invalidate() {
  return queryClient.invalidateQueries({ queryKey: QUERY_KEY, refetchType: "all" });
}

export function useFinanceStore<T>(selector: (s: State) => T): T {
  const userId = useSupabaseUserId();
  const { data } = useQuery({ queryKey: QUERY_KEY, queryFn: fetchState, enabled: !!userId });
  return selector(data ?? EMPTY_STATE);
}

// ---------------------------------------------------------------------------
// Ações — transações
// ---------------------------------------------------------------------------
export async function addTransaction(input: {
  type: TransactionType;
  amount: number;
  description: string;
  category: string;
  date?: string;
  isFixed?: boolean;
  recurrence?: "none" | "monthly";
  paymentMethod?: string;
  note?: string;
}): Promise<string> {
  const userId = await ensureSession();
  const row = unwrap<{ id: string }>(
    await supabase
      .from("transactions")
      .insert({
        user_id: userId,
        type: input.type,
        amount: input.amount,
        description: input.description.trim(),
        category: input.category,
        date: input.date ?? todayISO(),
        is_fixed: input.isFixed ?? false,
        recurrence: input.recurrence ?? "none",
        payment_method: input.paymentMethod,
        note: input.note,
      })
      .select()
      .single(),
  );
  await invalidate();
  return row.id;
}

export async function removeTransaction(id: string) {
  await supabase.from("transactions").delete().eq("id", id);
  await invalidate();
}

// ---------------------------------------------------------------------------
// Ações — planejamento
// ---------------------------------------------------------------------------
export async function setSavingsGoal(month: string, targetAmount: number) {
  const userId = await ensureSession();
  unwrap(
    await supabase
      .from("savings_goals_monthly")
      .upsert(
        { user_id: userId, month, target_amount: targetAmount },
        { onConflict: "user_id,month" },
      )
      .select()
      .single(),
  );
  await invalidate();
}

export async function addCategoryLimit(category: string, limitAmount: number): Promise<string> {
  const userId = await ensureSession();
  const row = unwrap<{ id: string }>(
    await supabase
      .from("category_limits")
      .insert({ user_id: userId, category, limit_amount: limitAmount })
      .select()
      .single(),
  );
  await invalidate();
  return row.id;
}

export async function updateCategoryLimit(id: string, limitAmount: number) {
  unwrap(
    await supabase
      .from("category_limits")
      .update({ limit_amount: limitAmount })
      .eq("id", id)
      .select()
      .single(),
  );
  await invalidate();
}

export async function removeCategoryLimit(id: string) {
  await supabase.from("category_limits").delete().eq("id", id);
  await invalidate();
}

export async function setIntention(text: string) {
  const userId = await ensureSession();
  unwrap(
    await supabase
      .from("financial_intentions")
      .insert({ user_id: userId, text: text.trim() })
      .select()
      .single(),
  );
  await invalidate();
}

// ---------------------------------------------------------------------------
// Ações — objetivos financeiros
// ---------------------------------------------------------------------------
export async function addFinancialGoal(input: {
  name: string;
  targetAmount: number;
  savedAmount?: number;
  deadline?: string;
  imageUrl?: string;
}): Promise<string> {
  const userId = await ensureSession();
  const row = unwrap<{ id: string }>(
    await supabase
      .from("financial_goals")
      .insert({
        user_id: userId,
        name: input.name.trim(),
        target_amount: input.targetAmount,
        saved_amount: input.savedAmount ?? 0,
        deadline: input.deadline,
        image_url: input.imageUrl,
      })
      .select()
      .single(),
  );
  await invalidate();
  return row.id;
}

export async function updateFinancialGoal(
  id: string,
  patch: Partial<Pick<FinancialGoal, "name" | "targetAmount" | "deadline" | "imageUrl">>,
) {
  const dbPatch: Row = {};
  if (patch.name !== undefined) dbPatch.name = patch.name;
  if (patch.targetAmount !== undefined) dbPatch.target_amount = patch.targetAmount;
  if (patch.deadline !== undefined) dbPatch.deadline = patch.deadline;
  if (patch.imageUrl !== undefined) dbPatch.image_url = patch.imageUrl;
  unwrap(await supabase.from("financial_goals").update(dbPatch).eq("id", id).select().single());
  await invalidate();
}

/** Contribuições ficam preservadas (FK cascade só apaga elas junto do objetivo, nunca sozinhas). */
export async function removeFinancialGoal(id: string) {
  await supabase.from("financial_goals").delete().eq("id", id);
  await invalidate();
}

/** Aportar dinheiro a um objetivo é uma ALOCAÇÃO, nunca uma despesa — não cria Transaction. */
export async function contributeToGoal(goalId: string, amount: number, note?: string) {
  const userId = await ensureSession();
  const goalRow = unwrap<{ saved_amount: number }>(
    await supabase.from("financial_goals").select("saved_amount").eq("id", goalId).single(),
  );
  await Promise.all([
    supabase
      .from("financial_goals")
      .update({ saved_amount: (goalRow.saved_amount ?? 0) + amount })
      .eq("id", goalId),
    supabase
      .from("goal_contributions")
      .insert({ user_id: userId, goal_id: goalId, amount, date: todayISO(), note }),
  ]);
  await invalidate();
}

// ---------------------------------------------------------------------------
// Ações — check-in
// ---------------------------------------------------------------------------
export async function answerCheckIn(id: string, answer: CheckInAnswer, note?: string) {
  unwrap(
    await supabase
      .from("check_ins")
      .update({ answer, note, responded_at: nowDate().toISOString() })
      .eq("id", id)
      .select()
      .single(),
  );
  await invalidate();
}

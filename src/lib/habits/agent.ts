import { z } from "zod";
import { addDaysISO } from "../agenda-intervals";
import { todayISO } from "../goals-store";
import {
  evaluateDay,
  evaluatePeriod,
  feelingCounts,
  indexLogs,
  motivesOfSkips,
  summarize,
  todayItem,
  versionAt,
  type EvalContext,
} from "./engine";
import {
  addChain,
  archiveHabit,
  createHabit,
  createPause,
  fetchCore,
  fetchLogs,
  logHabit,
  setGoalVersion,
  undoLog,
  windowStart,
} from "./store";
import { formatAmount } from "./units";
import type { Chain, GoalPeriod, Habit, HabitLog, Intent, Measure } from "./types";
import { OUTCOME_LABEL, goalText, progressText } from "./format";
import { getProfileWeekStart } from "../profile-store";

// ---------------------------------------------------------------------------
// Ferramentas do agente para as rotinas. Usam as MESMAS funções da tela
// (`store.ts`): o agente nunca tem um caminho de escrita paralelo.
//
// Regras que valem aqui:
//  * Nome ambíguo → o agente NÃO adivinha: devolve as opções e pede para
//    escolher (nada é gravado).
//  * Nunca inventa sucesso: se nada foi registrado, a resposta diz isso.
//  * Mudanças amplas (criar rotina, pausar, arquivar) exigem confirmação
//    (ver `HABIT_CONFIRMATION_TOOLS` em policy.ts).
// ---------------------------------------------------------------------------

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use uma data YYYY-MM-DD");
const ref = z.string().trim().min(1).max(120);
const period = z.enum(["day", "week", "month", "year"]);

export const habitSchemas: Record<string, z.ZodType<Record<string, unknown>>> = {
  consultar_rotinas: z.object({ date: isoDate.optional() }),
  resumo_rotina: z.object({ habit: ref, days: z.number().int().min(7).max(365).optional() }),
  criar_rotina: z.object({
    name: z.string().trim().min(1).max(120),
    intent: z.enum(["build", "limit", "quit"]).optional(),
    measure: z.enum(["binary", "count", "quantity", "duration"]).optional(),
    unit: z.string().trim().min(1).max(24).optional(),
    goalValue: z.number().finite().min(0).max(1_000_000).optional(),
    period: period.optional(),
    weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7).optional(),
    area: z.string().trim().min(1).max(40).optional(),
    startDate: isoDate.optional(),
  }),
  registrar_rotina: z.object({
    habit: ref,
    value: z.number().finite().min(0).max(1_000_000).optional(),
    date: isoDate.optional(),
    status: z.enum(["recorded", "skipped", "missed", "confirmed"]).optional(),
    reason: z.string().trim().max(60).optional(),
    note: z.string().trim().max(2000).optional(),
  }),
  desfazer_registro_rotina: z.object({ habit: ref, date: isoDate.optional() }),
  pausar_rotinas: z
    .object({
      scope: z.enum(["habit", "area", "global"]),
      habit: ref.optional(),
      area: z.string().trim().min(1).max(40).optional(),
      startDate: isoDate.optional(),
      endDate: isoDate.optional(),
      reason: z.string().trim().max(200).optional(),
    })
    .refine((v) => v.scope !== "habit" || !!v.habit, { message: "informe qual rotina pausar" })
    .refine((v) => v.scope !== "area" || !!v.area, { message: "informe qual área pausar" }),
  arquivar_rotina: z.object({ habit: ref, archived: z.boolean().optional() }),
  encadear_rotinas: z.object({
    base: ref,
    target: ref,
    trigger: z.enum(["done", "skipped", "missed"]).optional(),
    delayMinutes: z.number().int().min(0).max(1440).optional(),
  }),
  ajustar_meta_rotina: z.object({
    habit: ref,
    goalValue: z.number().finite().min(0).max(1_000_000),
    period: period.optional(),
  }),
};

/** Mudanças amplas: o agente propõe e a pessoa confirma. */
export const HABIT_CONFIRMATION_TOOLS = ["criar_rotina", "pausar_rotinas", "arquivar_rotina"];

const fn = (
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[] = [],
) => ({
  type: "function" as const,
  function: { name, description, parameters: { type: "object", properties, required } },
});

export const HABIT_TOOLS = [
  fn(
    "consultar_rotinas",
    "Lista as rotinas (hábitos) de um dia com meta, progresso e situação. Use antes de registrar para conhecer os nomes. Só leitura.",
    { date: { type: "string", description: "YYYY-MM-DD; padrão hoje" } },
  ),
  fn(
    "resumo_rotina",
    "Resumo de uma rotina em um período: dias cumpridos, sem registro, pulados, em pausa, motivos que a pessoa INFORMOU ao pular e sensações respondidas. Use para perguntas como 'por que estou pulando leitura?' — responda só com esses dados, sem inventar causas.",
    {
      habit: { type: "string", description: "Nome ou id da rotina" },
      days: { type: "number", description: "Período em dias (7 a 365); padrão 30" },
    },
    ["habit"],
  ),
  fn(
    "criar_rotina",
    "Cria uma rotina. Exige confirmação da pessoa. 'Quero ler 50 páginas por semana' → intent build, measure quantity, unit páginas, goalValue 50, period week. 'Reduzir café a 2 por dia' → intent limit, measure count, goalValue 2. 'Parar de fumar' → intent quit. Sem número, use measure binary.",
    {
      name: { type: "string" },
      intent: { type: "string", enum: ["build", "limit", "quit"] },
      measure: { type: "string", enum: ["binary", "count", "quantity", "duration"] },
      unit: { type: "string", description: "páginas, copos, ml, km, min…" },
      goalValue: { type: "number" },
      period: { type: "string", enum: ["day", "week", "month", "year"] },
      weekdays: {
        type: "array",
        items: { type: "number" },
        description: "0=domingo … 6=sábado; omita para todos os dias",
      },
      area: { type: "string" },
      startDate: { type: "string", description: "YYYY-MM-DD; padrão hoje" },
    },
    ["name"],
  ),
  fn(
    "registrar_rotina",
    "Registra progresso numa rotina (ex.: 'li 12 páginas ontem', 'mais dois copos'), ou marca o dia como pulado/não realizado/fechado. Reversível; execute direto. Se o nome for ambíguo a ferramenta devolve as opções: pergunte qual. Nunca registre sucesso que a pessoa não relatou.",
    {
      habit: { type: "string", description: "Nome ou id" },
      value: {
        type: "number",
        description: "Quantidade na unidade da rotina (minutos para tempo)",
      },
      date: { type: "string", description: "YYYY-MM-DD; padrão hoje" },
      status: { type: "string", enum: ["recorded", "skipped", "missed", "confirmed"] },
      reason: { type: "string", description: "Motivo ao pular, se a pessoa disser" },
      note: { type: "string" },
    },
    ["habit"],
  ),
  fn(
    "desfazer_registro_rotina",
    "Desfaz o último registro de uma rotina (hoje ou na data informada).",
    { habit: { type: "string" }, date: { type: "string" } },
    ["habit"],
  ),
  fn(
    "pausar_rotinas",
    "Pausa uma rotina, uma área ou todas (viagem, doença). Exige confirmação. Dias em pausa não contam como falha nem sucesso. Não mexe na Agenda nem em eventos externos.",
    {
      scope: { type: "string", enum: ["habit", "area", "global"] },
      habit: { type: "string" },
      area: { type: "string" },
      startDate: { type: "string", description: "YYYY-MM-DD; padrão hoje" },
      endDate: { type: "string", description: "YYYY-MM-DD; omita se sem data final" },
      reason: { type: "string" },
    },
    ["scope"],
  ),
  fn(
    "arquivar_rotina",
    "Arquiva (ou restaura com archived=false) uma rotina, preservando o histórico. Exige confirmação.",
    { habit: { type: "string" }, archived: { type: "boolean" } },
    ["habit"],
  ),
  fn(
    "encadear_rotinas",
    "'Depois da caminhada me lembre de alongar': cria o encadeamento base → alvo. O lembrete respeita pausas e não se repete.",
    {
      base: { type: "string", description: "Rotina que dispara" },
      target: { type: "string", description: "Rotina a lembrar" },
      trigger: { type: "string", enum: ["done", "skipped", "missed"] },
      delayMinutes: { type: "number" },
    },
    ["base", "target"],
  ),
  fn(
    "ajustar_meta_rotina",
    "Muda a meta de uma rotina a partir de HOJE (o passado fica como estava).",
    {
      habit: { type: "string" },
      goalValue: { type: "number" },
      period: { type: "string", enum: ["day", "week", "month", "year"] },
    },
    ["habit", "goalValue"],
  ),
];

// ---------------------------------------------------------------------------
// Resolução do nome da rotina
// ---------------------------------------------------------------------------

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("pt-BR").trim();

export type Resolved = { habit: Habit } | { ambiguous: Habit[] } | { none: true };

export function resolveHabit(habits: Habit[], query: string): Resolved {
  const q = norm(query);
  const live = habits.filter((h) => !h.archivedAt);
  const pool = live.length ? live : habits;
  const byId = habits.find((h) => h.id === query);
  if (byId) return { habit: byId };
  const exact = pool.filter((h) => norm(h.name) === q);
  if (exact.length === 1) return { habit: exact[0] };
  if (exact.length > 1) return { ambiguous: exact };
  const starts = pool.filter((h) => norm(h.name).startsWith(q) || q.startsWith(norm(h.name)));
  if (starts.length === 1) return { habit: starts[0] };
  const contains = pool.filter((h) => norm(h.name).includes(q) || q.includes(norm(h.name)));
  if (contains.length === 1) return { habit: contains[0] };
  const many = starts.length > 1 ? starts : contains;
  if (many.length > 1) return { ambiguous: many };
  return { none: true };
}

const ambiguity = (list: Habit[]) =>
  JSON.stringify({
    ok: false,
    needsClarification: true,
    message: `Qual destas rotinas? ${list.map((h) => h.name).join(", ")}.`,
  });
const notFound = (q: string, habits: Habit[]) =>
  JSON.stringify({
    ok: false,
    message: `Não achei a rotina "${q}".${
      habits.length
        ? ` Rotinas: ${habits
            .filter((h) => !h.archivedAt)
            .map((h) => h.name)
            .join(", ")}.`
        : " Ainda não há rotinas."
    }`,
  });

async function load() {
  const core = await fetchCore();
  const today = todayISO();
  const weekStart = await getProfileWeekStart();
  const ctx: EvalContext = { today, weekStart, pauses: core.pauses };
  return { core, ctx, today };
}

export async function executeHabitTool(
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  const { core, ctx, today } = await load();
  const pick = (query: string) => resolveHabit(core.habits, query);
  const need = (query: string): { habit: Habit } | { reply: string } => {
    const r = pick(query);
    if ("habit" in r) return r;
    if ("ambiguous" in r) return { reply: ambiguity(r.ambiguous) };
    return { reply: notFound(query, core.habits) };
  };

  switch (name) {
    case "consultar_rotinas": {
      const date = (args.date as string | undefined) ?? today;
      const logs = await fetchLogs(windowStart(core.habits, today, ctx.weekStart), today);
      const byHabit = new Map<string, HabitLog[]>();
      for (const l of logs)
        (byHabit.get(l.habitId) ?? byHabit.set(l.habitId, []).get(l.habitId)!).push(l);
      const items = core.habits
        .filter((h) => !h.archivedAt)
        .map((h) => {
          const idx = indexLogs(byHabit.get(h.id) ?? []);
          const day = evaluateDay(ctx, h, idx, date);
          const period = evaluatePeriod(ctx, h, idx, date);
          const item = todayItem({ ...ctx, today: date <= today ? date : today }, h, idx);
          return {
            id: h.id,
            name: h.name,
            intent: h.intent,
            meta: goalText(h, day.version),
            progresso: progressText(h, day, period),
            situacao: OUTCOME_LABEL[day.outcome],
            doDia: item.due,
          };
        });
      return JSON.stringify({ date, rotinas: items, total: items.length });
    }

    case "resumo_rotina": {
      const r = need(String(args.habit));
      if ("reply" in r) return r.reply;
      const days = (args.days as number | undefined) ?? 30;
      const from = addDaysISO(today, -(days - 1));
      const logs = await fetchLogs(
        from < r.habit.startDate ? r.habit.startDate : from,
        today,
        r.habit.id,
      );
      const s = summarize(
        ctx,
        r.habit,
        logs,
        from < r.habit.startDate ? r.habit.startDate : from,
        today,
      );
      const t = s.totals;
      const judged =
        (t.completed ?? 0) +
        (t.partial ?? 0) +
        (t.missed ?? 0) +
        (t.none ?? 0) +
        (t.exceeded ?? 0) +
        (t.unconfirmed ?? 0);
      return JSON.stringify({
        rotina: r.habit.name,
        periodoDias: days,
        diasAvaliados: judged,
        cumpridos: t.completed ?? 0,
        parciais: t.partial ?? 0,
        puladosPelaPessoa: t.skipped ?? 0,
        naoRealizados: t.missed ?? 0,
        semRegistro: (t.none ?? 0) + (t.unconfirmed ?? 0),
        emPausa: t.paused ?? 0,
        consistencia: s.consistency === null ? null : Math.round(s.consistency * 100),
        motivosInformados: motivesOfSkips(logs),
        sensacoes: feelingCounts(logs),
        aviso:
          judged < 4
            ? "Poucos dias avaliados: não conclua padrões."
            : "Use só estes números. Motivos são apenas os que a pessoa informou; não deduza causas.",
      });
    }

    case "criar_rotina": {
      const intent = (args.intent as Intent | undefined) ?? "build";
      const hasNumber = typeof args.goalValue === "number";
      const measure: Measure =
        (args.measure as Measure | undefined) ??
        (hasNumber ? (args.unit ? "quantity" : "count") : "binary");
      const per = (args.period as GoalPeriod | undefined) ?? "day";
      const weekdays = args.weekdays as number[] | undefined;
      const id = await createHabit({
        name: String(args.name),
        intent,
        measure,
        unit:
          measure === "binary"
            ? undefined
            : ((args.unit as string | undefined) ?? (measure === "duration" ? "min" : "vezes")),
        area: args.area as string | undefined,
        startDate: (args.startDate as string | undefined) ?? today,
        goal: {
          value: intent === "quit" ? 0 : ((args.goalValue as number | undefined) ?? 1),
          period: per,
          schedule: weekdays?.length ? { type: "weekdays", weekdays } : { type: "daily" },
          flexible: per !== "day" && !weekdays?.length,
          timesOfDay: [],
          checklist: [],
        },
      });
      return JSON.stringify({ ok: true, id, message: `Rotina "${args.name}" criada.` });
    }

    case "registrar_rotina": {
      const r = need(String(args.habit));
      if ("reply" in r) return r.reply;
      const h = r.habit;
      const status =
        (args.status as "recorded" | "skipped" | "missed" | "confirmed" | undefined) ?? "recorded";
      const date = (args.date as string | undefined) ?? today;
      if (date > today)
        return JSON.stringify({ ok: false, message: "Não registro datas futuras." });
      if (status === "recorded" && h.measure !== "binary" && typeof args.value !== "number")
        return JSON.stringify({
          ok: false,
          needsClarification: true,
          message: `Quanto de "${h.name}"? (${h.unit ?? "valor"})`,
        });
      const value =
        status === "recorded" ? (h.measure === "binary" ? 1 : (args.value as number)) : 0;
      const log = await logHabit({
        habitId: h.id,
        date,
        status,
        value,
        reason: args.reason as string | undefined,
        note: args.note as string | undefined,
        source: "agent",
        // Repetir a mesma chamada no mesmo minuto não duplica o registro.
        key: `agent:${h.id}:${date}:${status}:${value}:${Math.floor(Date.now() / 60_000)}`,
      });
      return JSON.stringify({
        ok: true,
        logId: log.id,
        message:
          status === "recorded"
            ? `Registrado em ${h.name}: ${formatAmount(value, h.measure === "duration" ? "min" : h.unit)}${date !== today ? ` (${date})` : ""}.`
            : `${h.name}: dia ${status === "skipped" ? "pulado" : status === "missed" ? "marcado como não realizado" : "fechado dentro do limite"}.`,
        podeDesfazer: true,
      });
    }

    case "desfazer_registro_rotina": {
      const r = need(String(args.habit));
      if ("reply" in r) return r.reply;
      const date = (args.date as string | undefined) ?? today;
      const logs = (await fetchLogs(date, date, r.habit.id)).sort((a, b) =>
        a.occurredAt < b.occurredAt ? 1 : -1,
      );
      if (logs.length === 0)
        return JSON.stringify({
          ok: false,
          message: `Não há registro de ${r.habit.name} em ${date} para desfazer.`,
        });
      await undoLog(logs[0].id);
      return JSON.stringify({ ok: true, message: `Desfiz o último registro de ${r.habit.name}.` });
    }

    case "pausar_rotinas": {
      let habitId: string | undefined;
      if (args.scope === "habit") {
        const r = need(String(args.habit));
        if ("reply" in r) return r.reply;
        habitId = r.habit.id;
      }
      await createPause({
        scope: args.scope as "habit" | "area" | "global",
        habitId,
        area: args.area as string | undefined,
        startDate: (args.startDate as string | undefined) ?? today,
        endDate: args.endDate as string | undefined,
        reason: args.reason as string | undefined,
      });
      return JSON.stringify({
        ok: true,
        message: "Pausa criada. Dias em pausa não contam como falha, e a Agenda não foi alterada.",
      });
    }

    case "arquivar_rotina": {
      const r = need(String(args.habit));
      if ("reply" in r) return r.reply;
      const archived = (args.archived as boolean | undefined) ?? true;
      await archiveHabit(r.habit.id, archived);
      return JSON.stringify({
        ok: true,
        message: `${r.habit.name} ${archived ? "arquivada; o histórico continua guardado" : "restaurada"}.`,
      });
    }

    case "encadear_rotinas": {
      const a = need(String(args.base));
      if ("reply" in a) return a.reply;
      const b = need(String(args.target));
      if ("reply" in b) return b.reply;
      await addChain({
        base: a.habit.id,
        target: b.habit.id,
        trigger: (args.trigger as Chain["trigger"] | undefined) ?? "done",
        delayMinutes: (args.delayMinutes as number | undefined) ?? 0,
      });
      return JSON.stringify({
        ok: true,
        message: `Combinado: depois de ${a.habit.name}, lembro de ${b.habit.name}.`,
      });
    }

    case "ajustar_meta_rotina": {
      const r = need(String(args.habit));
      if ("reply" in r) return r.reply;
      const v = versionAt(r.habit, today) ?? r.habit.versions[r.habit.versions.length - 1];
      if (!v) return JSON.stringify({ ok: false, message: "Essa rotina não tem meta definida." });
      await setGoalVersion(
        r.habit,
        {
          value: args.goalValue as number,
          period: (args.period as GoalPeriod | undefined) ?? v.goalPeriod,
          schedule: v.schedule,
          flexible: v.flexible,
          timesOfDay: v.timesOfDay,
          checklist: v.checklist,
        },
        today,
      );
      return JSON.stringify({
        ok: true,
        message: `Meta de ${r.habit.name} ajustada a partir de hoje; o histórico fica como estava.`,
      });
    }
  }
  throw new Error(`Ferramenta de rotina desconhecida: ${name}`);
}

export const HABIT_TOOL_NAMES = new Set(Object.keys(habitSchemas));

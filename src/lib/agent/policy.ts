import { z } from "zod";

export type AgentToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type PendingAgentAction = {
  name: string;
  args: Record<string, unknown>;
};

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use uma data YYYY-MM-DD");
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "use um horário HH:MM");
const positive = z.number().finite().positive();
const weekday = z.number().int().min(0).max(6);
const muscleGroup = z.enum([
  "peito",
  "costas",
  "ombros",
  "biceps",
  "triceps",
  "antebraco",
  "quadriceps",
  "posteriores",
  "gluteos",
  "panturrilhas",
  "abdomen",
  "corpo_inteiro",
  "cardio",
]);
const equipment = z.enum([
  "barra",
  "halteres",
  "maquina",
  "cabo",
  "peso_corporal",
  "assistido",
  "kettlebell",
  "elastico",
  "outro",
]);
const exerciseInput = z.object({
  name: z.string().trim().min(1).max(120),
  setsTarget: z.number().int().min(1).max(20),
  repsTarget: z.number().int().min(1).max(200),
  loadTarget: z.number().min(0).max(2_000),
  restSeconds: z.number().int().min(0).max(1_800).optional(),
  muscleGroup: muscleGroup.optional(),
  equipment: equipment.optional(),
});
const planInput = z.object({
  letter: z.string().trim().min(1).max(4),
  name: z.string().trim().min(1).max(120),
  muscleGroups: z.string().trim().max(120).optional(),
  exercises: z.array(exerciseInput).min(1).max(20),
});
const blockInput = z.object({
  name: z.string().trim().min(1).max(120),
  durationDays: z.number().int().min(1).max(365),
  focus: z.string().trim().max(120).optional(),
  muscleGroups: z.string().trim().max(120).optional(),
  plans: z.array(planInput).min(1).max(10),
  weekdayAssignment: z
    .array(
      z.object({
        weekday,
        planLetter: z.string().trim().min(1).max(4).nullable(),
        startTime: hhmm.optional(),
      }),
    )
    .max(7)
    .optional(),
});

const schemas: Record<string, z.ZodType<Record<string, unknown>>> = {
  consultar_rotina: z.object({
    area: z.enum(["alimentacao", "leitura", "fe", "planos", "academia"]),
  }),
  reagendar_execucao: z.object({
    executionId: z.string().uuid(),
    date: isoDate,
    startTime: hhmm,
    endTime: hhmm.optional(),
  }),
  registrar_refeicao: z.object({ mealId: z.string().uuid(), optionId: z.string().uuid() }),
  registrar_agua: z.object({ amountMl: positive.max(10_000) }),
  corrigir_ultima_agua: z.object({ amountMl: positive.max(10_000) }),
  registrar_transacao: z.object({
    type: z.enum(["expense", "income"]),
    amount: positive.max(100_000_000),
    description: z.string().trim().min(1).max(240),
    category: z.enum([
      "Alimentação",
      "Transporte",
      "Lazer",
      "Compras",
      "Assinaturas",
      "Aluguel",
      "Academia",
      "Trabalho/Receita",
      "Outros",
    ]),
  }),
  corrigir_ultima_transacao: z
    .object({
      type: z.enum(["expense", "income"]).optional(),
      amount: positive.max(100_000_000).optional(),
      description: z.string().trim().min(1).max(240).optional(),
      category: z
        .enum([
          "Alimentação",
          "Transporte",
          "Lazer",
          "Compras",
          "Assinaturas",
          "Aluguel",
          "Academia",
          "Trabalho/Receita",
          "Outros",
        ])
        .optional(),
    })
    .refine((value) => Object.values(value).some((item) => item !== undefined), {
      message: "informe ao menos um campo para corrigir",
    }),
  consultar_financas: z.object({}),
  consultar_dia: z.object({}),
  consultar_agenda: z.object({}),
  criar_lembrete: z.object({
    text: z.string().trim().min(1).max(240),
    date: isoDate,
    time: hhmm.optional(),
    relatedExecutionId: z.string().uuid().optional(),
    offsetMinutesBefore: z.number().int().min(0).max(10_080).optional(),
  }),
  gerenciar_lembrete: z.object({
    reminderId: z.string().uuid(),
    action: z.enum(["concluir", "remover", "editar"]),
    text: z.string().trim().min(1).max(240).optional(),
    date: isoDate.optional(),
    time: hhmm.optional(),
  }),
  criar_execucao: z.object({
    title: z.string().trim().min(1).max(240),
    dueDate: isoDate,
    agendaDate: isoDate.optional(),
    startTime: hhmm.optional(),
    category: z.string().trim().min(1).max(80).optional(),
  }),
  concluir_execucao: z.object({ executionId: z.string().uuid() }),
  criar_plano: z.object({
    title: z.string().trim().min(1).max(240),
    why: z.string().trim().min(1).max(1_000),
    lifeArea: z.enum(["Corpo", "Mente", "Carreira", "Relações", "Arte", "Finanças", "Fé"]),
    deadlineISO: isoDate.optional(),
    deadlineLabel: z.string().trim().min(1).max(80),
    steps: z
      .array(
        z.object({
          title: z.string().trim().min(1).max(240),
          targetDate: isoDate.optional(),
          actions: z.array(z.string().trim().min(1).max(240)).max(8).optional(),
        }),
      )
      .max(12)
      .optional(),
  }),
  consultar_treino_hoje: z.object({}),
  iniciar_treino: z.object({ planId: z.string().uuid() }),
  registrar_serie: z.object({
    sessionId: z.string().uuid(),
    exerciseId: z.string().uuid(),
    weight: z.number().finite().min(0).max(2_000),
    reps: z.number().int().min(1).max(1_000),
  }),
  concluir_treino: z.object({ sessionId: z.string().uuid() }),
  registrar_peso_corporal: z.object({ weight: positive.min(20).max(500) }),
  consultar_peso_corporal: z.object({}),
  corrigir_serie: z.object({
    sessionId: z.string().uuid(),
    exerciseId: z.string().uuid(),
    setIndex: z.number().int().min(0).max(200),
    weight: z.number().finite().min(0).max(2_000).optional(),
    reps: z.number().int().min(1).max(1_000).optional(),
  }),
  remover_ultima_serie: z.object({
    sessionId: z.string().uuid(),
    exerciseId: z.string().uuid(),
  }),
  gerenciar_plano_treino: z
    .object({
      action: z.enum(["criar", "editar", "remover"]),
      planId: z.string().uuid().optional(),
      letter: z.string().trim().min(1).max(4).optional(),
      name: z.string().trim().min(1).max(120).optional(),
      muscleGroups: z.string().trim().max(120).optional(),
      exercises: z.array(exerciseInput).max(20).optional(),
      removeExerciseNames: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
    })
    .refine(
      (v) => v.action !== "criar" || (!!v.letter && !!v.name && (v.exercises?.length ?? 0) > 0),
      { message: "criar exige letter, name e ao menos 1 exercício" },
    )
    .refine((v) => v.action === "criar" || !!v.planId, {
      message: "editar/remover exigem planId",
    }),
  definir_dias_treino: z.object({
    assignments: z
      .array(z.object({ weekday, planId: z.string().uuid().nullable() }))
      .min(1)
      .max(7),
  }),
  criar_ciclo_treino: z.object({
    name: z.string().trim().min(1).max(120),
    startDate: isoDate,
    why: z.string().trim().max(1_000).optional(),
    activate: z.boolean().optional(),
    blocks: z.array(blockInput).min(1).max(12),
  }),
  consultar_ciclo_treino: z.object({}),
  encerrar_ciclo_treino: z.object({ restoreWeekly: z.boolean().optional() }),
  salvar_nota_leitura: z.object({
    bookTitle: z.string().trim().min(1).max(240),
    content: z.string().trim().min(1).max(10_000),
    type: z.enum(["quote", "insight", "note"]),
  }),
  salvar_nota_fe: z.object({
    content: z.string().trim().min(1).max(10_000),
    type: z.enum([
      "deus_falou",
      "oracao",
      "gratidao",
      "versiculo",
      "aprendizado",
      "testemunho",
      "livre",
    ]),
  }),
  capturar_caixa_norte: z.object({ content: z.string().trim().min(1).max(10_000) }),
};

// Estas ações mudam agenda ou planejamento. Mesmo que o modelo tente executá-las,
// o orquestrador interrompe e exige confirmação explícita da pessoa.
const confirmationRequired = new Set(["criar_plano", "registrar_refeicao", "criar_ciclo_treino"]);

export function parseAndValidateToolCall(call: AgentToolCall): PendingAgentAction {
  const schema = schemas[call.function.name];
  if (!schema) throw new Error(`Ferramenta não permitida: ${call.function.name}`);

  let raw: unknown;
  try {
    raw = JSON.parse(call.function.arguments || "{}");
  } catch {
    throw new Error(`Argumentos inválidos para ${call.function.name}`);
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    const reason = result.error.issues[0]?.message ?? "dados inválidos";
    throw new Error(`Não executei ${call.function.name}: ${reason}`);
  }
  if (call.function.name === "criar_plano") {
    const plan = result.data;
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const start = new Date(`${today}T12:00:00Z`).getTime();
    const days = String(plan.deadlineLabel).match(/\b(\d+)\s*dias?\b/i);
    if (!plan.deadlineISO && days && Number(days[1]) > 0 && Number(days[1]) <= 3650)
      plan.deadlineISO = new Date(start + Number(days[1]) * 86400000).toISOString().slice(0, 10);
    const end = plan.deadlineISO ? new Date(`${plan.deadlineISO}T12:00:00Z`).getTime() : 0;
    const steps = plan.steps as { title: string; targetDate?: string }[] | undefined;
    if (steps?.length && end > start)
      steps.forEach((step, i) => {
        if (!step.targetDate)
          step.targetDate = new Date(
            start + Math.ceil((((end - start) / 86400000) * (i + 1)) / steps.length) * 86400000,
          )
            .toISOString()
            .slice(0, 10);
        if (step.targetDate > String(plan.deadlineISO))
          throw new Error("Etapa ultrapassa o prazo do plano. Ajuste a proposta.");
      });
  }
  return { name: call.function.name, args: result.data };
}

export function requiresConfirmation(name: string): boolean {
  return confirmationRequired.has(name);
}

export function isExplicitConfirmation(text: string): boolean {
  return /^(sim|confirmo|confirmar|pode fazer|pode criar|faça|manda ver)[.!\s]*$/i.test(
    text.trim(),
  );
}

export function isExplicitRejection(text: string): boolean {
  return /^(não|nao|cancelar|cancela|deixa|esquece)[.!\s]*$/i.test(text.trim());
}

export function actionKey(action: PendingAgentAction): string {
  return `${action.name}:${JSON.stringify(action.args, Object.keys(action.args).sort())}`;
}

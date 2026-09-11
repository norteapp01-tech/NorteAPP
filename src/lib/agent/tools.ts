/**
 * Ferramentas do Agente Norte — Fase 1. Cada ferramenta chama exatamente a
 * mesma função que a tela do app já usa (mesma store, mesma auth, mesmo
 * invalidate()) — o agente nunca tem um caminho de escrita paralelo.
 *
 * Roda no CLIENTE (navegador) de propósito: é aqui que a sessão anônima do
 * Supabase já está autenticada (ensureSession()), do jeito que o resto do
 * app já funciona. O servidor só intermedia a chamada ao modelo de IA
 * (chat.functions.ts) — nunca toca no banco.
 */
import {
  addWater,
  correctLastWaterLog,
  fetchTodayLogs as fetchHydrationLogs,
  todayIntake,
} from "../hydration-store";
import {
  addTransaction,
  correctTransaction,
  fetchState as fetchFinanceState,
  totalsForMonth,
  categoryBreakdown,
  currentMonth,
  formatBRL,
  FINANCE_CATEGORIES,
} from "../finance-store";
import {
  fetchState as fetchGoalsState,
  todayExecutions,
  createExecution,
  completeExecution,
  rescheduleExecution,
  updateAgendaSession,
  createGoal,
  addSubtask,
  todayISO,
} from "../goals-store";
import {
  fetchState as fetchRemindersState,
  createReminder,
  todayReminders,
  overdueReminders,
} from "../reminders-store";
import {
  fetchState as fetchWorkoutState,
  todaysPlanId,
  sessionForToday,
  exercisesForPlan,
  startSession,
  logSet,
  finishSession,
  addBodyWeight,
} from "../workout-store";
import { fetchState as fetchReadingState, addNote as addReadingNote } from "../reading-store";
import { fetchState as fetchFeState, addNotebookEntry } from "../fe-store";
import { captureToInbox } from "./inbox-store";
import { fetchState as fetchNutritionState, confirmMealOption } from "../nutrition-store";

const CATEGORY_IDS = FINANCE_CATEGORIES.map((c) => c.id).join(", ");

/** Formato OpenAI de tool (function calling). */
export const AGENT_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "consultar_agenda",
      description:
        "Consulta compromissos de todas as datas para encontrar um compromisso a reagendar. Use para dentista dia 23, por exemplo. Desambigue apenas se houver vários candidatos.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "consultar_rotina",
      description:
        "Consulta dados reais de alimentação (momentos e opções com IDs), leitura, fé ou planos. Consulte antes de escolher IDs. Não retorne IDs internos na mensagem ao usuário.",
      parameters: {
        type: "object",
        properties: { area: { type: "string", enum: ["alimentacao", "leitura", "fe", "planos"] } },
        required: ["area"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "reagendar_execucao",
      description:
        "Reagenda imediatamente um compromisso identificado a pedido explícito. Consulte consultar_agenda para obter ID. Fim opcional: preserve duração. Não peça confirmação extra.",
      parameters: {
        type: "object",
        properties: {
          executionId: { type: "string" },
          date: { type: "string" },
          startTime: { type: "string" },
          endTime: { type: "string" },
        },
        required: ["executionId", "date", "startTime"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "registrar_refeicao",
      description:
        "Confirma consumo de uma opção cadastrada. Consulte alimentação primeiro. Nunca invente macros. Exige confirmação antes de contar nas metas.",
      parameters: {
        type: "object",
        properties: { mealId: { type: "string" }, optionId: { type: "string" } },
        required: ["mealId", "optionId"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "registrar_agua",
      description:
        "Registra água bebida agora. Ação reversível, execute direto sem confirmar antes.",
      parameters: {
        type: "object",
        properties: { amountMl: { type: "number", description: "Quantidade em mililitros" } },
        required: ["amountMl"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "corrigir_ultima_agua",
      description:
        "Corrige o último registro de água de hoje. Use quando a pessoa disser que a quantidade anterior estava errada; não registre água nova.",
      parameters: {
        type: "object",
        properties: { amountMl: { type: "number", description: "Quantidade correta em ml" } },
        required: ["amountMl"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "registrar_transacao",
      description:
        "Registra um gasto ou entrada financeira com valor e categoria claros. Ação reversível, execute direto.",
      parameters: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["expense", "income"] },
          amount: { type: "number" },
          description: { type: "string", description: "O que foi (ex.: 'barrinha de proteína')" },
          category: { type: "string", description: `Uma destas categorias: ${CATEGORY_IDS}` },
        },
        required: ["type", "amount", "description", "category"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "corrigir_ultima_transacao",
      description:
        "Corrige a transação financeira mais recente quando a pessoa retifica valor, descrição, categoria ou tipo. Não crie outra transação.",
      parameters: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["expense", "income"] },
          amount: { type: "number" },
          description: { type: "string" },
          category: { type: "string", description: `Uma destas categorias: ${CATEGORY_IDS}` },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "consultar_financas",
      description:
        "Consulta o relatório financeiro do mês atual — total gasto, por categoria, e saldo.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "consultar_dia",
      description:
        "Consulta a agenda de hoje: compromissos/execuções e lembretes de hoje ou atrasados.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "criar_lembrete",
      description: "Cria um lembrete pontual pra uma data. Ação reversível, execute direto.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string" },
          date: { type: "string", description: "Data no formato YYYY-MM-DD" },
        },
        required: ["text", "date"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "criar_execucao",
      description:
        "Cria imediatamente compromisso solicitado. Inferir título e categoria: dentista = Dentista/saude. Sem data explícita, hoje. Nunca perguntar título/categoria já inferíveis. Não pedir confirmação.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          dueDate: { type: "string", description: "Prazo, YYYY-MM-DD" },
          agendaDate: { type: "string", description: "Se tiver hora marcada, YYYY-MM-DD" },
          startTime: { type: "string", description: "HH:MM, só se agendaDate for informado" },
          category: { type: "string", description: "Categoria livre, ex.: 'Trabalho', 'Saúde'" },
        },
        required: ["title", "dueDate"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "concluir_execucao",
      description:
        "Marca um compromisso/tarefa (execução) como concluído, pelo id retornado por consultar_dia.",
      parameters: {
        type: "object",
        properties: { executionId: { type: "string" } },
        required: ["executionId"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "criar_plano",
      description:
        "Prepare proposta de plano com etapas sugeridas e prazo se informado. Chame sem pedir confirmação em texto: a interface mostra o cronograma para revisar. Para loja, sugira orçamento, pesquisa, estruturação, inauguração; adapte ao contexto. Não pergunte quantas etapas se pode propor uma estrutura.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          why: { type: "string", description: "Por que isso importa" },
          lifeArea: {
            type: "string",
            enum: ["Corpo", "Mente", "Carreira", "Relações", "Arte", "Finanças", "Fé"],
          },
          deadlineISO: { type: "string", description: "YYYY-MM-DD, opcional" },
          deadlineLabel: { type: "string", description: "ex.: 'em 90 dias', 'sem prazo'" },
          steps: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                targetDate: { type: "string", description: "YYYY-MM-DD, apenas se prazo definido" },
                actions: {
                  type: "array",
                  items: { type: "string" },
                  description: "Próximas ações práticas dentro desta etapa, proponha 1 a 3.",
                },
              },
              required: ["title"],
            },
          },
        },
        required: ["title", "why", "lifeArea", "deadlineLabel"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "consultar_treino_hoje",
      description:
        "Consulta o treino programado pra hoje, os exercícios, e se já existe uma sessão em andamento.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "iniciar_treino",
      description:
        "Inicia (ou retoma, se já existir hoje) a sessão de treino de um plano. Ação reversível.",
      parameters: {
        type: "object",
        properties: { planId: { type: "string" } },
        required: ["planId"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "registrar_serie",
      description:
        "Registra uma série concluída (peso e repetições) de um exercício na sessão em andamento.",
      parameters: {
        type: "object",
        properties: {
          sessionId: { type: "string" },
          exerciseId: { type: "string" },
          weight: { type: "number" },
          reps: { type: "number" },
        },
        required: ["sessionId", "exerciseId", "weight", "reps"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "concluir_treino",
      description: "Finaliza a sessão de treino em andamento.",
      parameters: {
        type: "object",
        properties: { sessionId: { type: "string" } },
        required: ["sessionId"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "registrar_peso_corporal",
      description: "Registra o peso corporal atual.",
      parameters: {
        type: "object",
        properties: { weight: { type: "number" } },
        required: ["weight"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "salvar_nota_leitura",
      description:
        "Salva uma citação, insight ou nota vinculada a um livro que a pessoa está lendo. Use o título do livro como a pessoa falou.",
      parameters: {
        type: "object",
        properties: {
          bookTitle: { type: "string", description: "Título do livro, como a pessoa mencionou" },
          content: { type: "string" },
          type: { type: "string", enum: ["quote", "insight", "note"] },
        },
        required: ["bookTitle", "content", "type"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "salvar_nota_fe",
      description:
        "Salva uma reflexão, oração, gratidão, aprendizado ou testemunho no caderno de fé — quando o assunto é espiritual/estudo bíblico, não um livro comum.",
      parameters: {
        type: "object",
        properties: {
          content: { type: "string" },
          type: {
            type: "string",
            enum: [
              "deus_falou",
              "oracao",
              "gratidao",
              "versiculo",
              "aprendizado",
              "testemunho",
              "livre",
            ],
          },
        },
        required: ["content", "type"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "capturar_caixa_norte",
      description:
        "Guarda qualquer frase que não pertence claramente a nenhuma outra ferramenta — ideia solta, pendência, promessa, 'lembrar disso depois'. Nunca force a pessoa a classificar; só guarde.",
      parameters: {
        type: "object",
        properties: { content: { type: "string" } },
        required: ["content"],
      },
    },
  },
];

/** Executa uma tool call e devolve um resultado (string) pro modelo interpretar. */
export async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case "consultar_agenda": {
      const state = await fetchGoalsState();
      return JSON.stringify({
        card: "agenda",
        title: "Sua agenda",
        items: state.executions.filter((e) => e.status === "planejada"),
      });
    }
    case "consultar_rotina": {
      const state =
        args.area === "alimentacao"
          ? await fetchNutritionState()
          : args.area === "leitura"
            ? await fetchReadingState()
            : args.area === "fe"
              ? await fetchFeState()
              : await fetchGoalsState();
      return JSON.stringify(state);
    }
    case "registrar_refeicao": {
      const state = await fetchNutritionState();
      if (!state.options.some((o) => o.id === args.optionId && o.mealId === args.mealId))
        throw new Error("Opção não pertence a esta refeição.");
      await confirmMealOption(args.mealId as string, args.optionId as string);
      const option = state.options.find((o) => o.id === args.optionId)!;
      return JSON.stringify({
        card: "nutrition",
        ...option,
        summary: "Refeição registrada.",
        date: todayISO(),
      });
    }
    case "reagendar_execucao": {
      const state = await fetchGoalsState();
      const item = state.executions.find((e) => e.id === args.executionId);
      if (!item || item.status !== "planejada")
        throw new Error("Compromisso indisponível para reagendar. Consulte o dia novamente.");
      if (args.endTime && String(args.endTime) <= String(args.startTime))
        throw new Error("O fim precisa ser depois do início.");
      if (item.goalId && item.dueDate && String(args.date) > item.dueDate)
        throw new Error(
          "A nova data ultrapassa o prazo. Revise o planejamento antes de reagendar.",
        );
      const goal = state.goals.find((g) => g.id === item.goalId);
      if (goal?.deadlineISO && String(args.date) > goal.deadlineISO)
        throw new Error("A nova data ultrapassa o prazo do plano.");
      if ((item.agendaSessions?.length ?? 0) > 1)
        throw new Error(
          "Há várias sessões desta tarefa. Abra a agenda para escolher a ocorrência.",
        );
      let endTime = args.endTime as string | undefined;
      if (!endTime && item.startTime && item.endTime) {
        const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
        const end =
          minutes(String(args.startTime)) + minutes(item.endTime) - minutes(item.startTime);
        if (end >= 1440)
          throw new Error("O novo horário atravessa a meia-noite. Informe o fim na agenda.");
        endTime = `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
      }
      await updateAgendaSession(
        item.id,
        item.agendaSessions?.[0]?.id,
        String(args.date),
        String(args.startTime),
        endTime,
      );
      return JSON.stringify({
        card: "appointment",
        id: item.id,
        title: item.title,
        date: args.date,
        startTime: args.startTime,
        endTime,
        summary: "Compromisso reagendado.",
      });
    }
    case "registrar_agua": {
      await addWater(args.amountMl as number);
      const logs = await fetchHydrationLogs();
      return `Registrado. Total de hoje: ${todayIntake(logs)}ml.`;
    }

    case "corrigir_ultima_agua": {
      const logs = await fetchHydrationLogs();
      await correctLastWaterLog(logs, args.amountMl as number);
      const updated = await fetchHydrationLogs();
      return `Corrigi o último registro para ${args.amountMl}ml. Total de hoje: ${todayIntake(updated)}ml.`;
    }

    case "registrar_transacao": {
      const id = await addTransaction({
        type: args.type as "expense" | "income",
        amount: args.amount as number,
        description: args.description as string,
        category: args.category as string,
      });
      const state = await fetchFinanceState();
      const breakdown = categoryBreakdown(state.transactions, currentMonth());
      return JSON.stringify({
        card: "finance",
        id,
        ...args,
        date: todayISO(),
        breakdown,
        summary: "Movimentação registrada.",
      });
    }

    case "corrigir_ultima_transacao": {
      const state = await fetchFinanceState();
      const last = [...state.transactions].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      )[0];
      if (!last) return "Não encontrei uma transação anterior para corrigir.";
      await correctTransaction(last.id, {
        type: args.type as "expense" | "income" | undefined,
        amount: args.amount as number | undefined,
        description: args.description as string | undefined,
        category: args.category as string | undefined,
      });
      return `Corrigi a última transação. Pode desfazer no app.`;
    }

    case "consultar_financas": {
      const state = await fetchFinanceState();
      const month = currentMonth();
      const totals = totalsForMonth(
        state.transactions,
        state.contributions,
        state.savingsGoals,
        month,
      );
      const breakdown = categoryBreakdown(state.transactions, month)
        .slice(0, 5)
        .map((c) => `${c.category}: ${formatBRL(c.amount)}`)
        .join(", ");
      return `Este mês: receitas ${formatBRL(totals.income)}, gastos ${formatBRL(totals.expenses)}. Por categoria: ${breakdown || "nada ainda"}.`;
    }

    case "consultar_dia": {
      const goalsState = await fetchGoalsState();
      const remindersState = await fetchRemindersState();
      const today = todayISO();
      const execs = todayExecutions(goalsState.executions, today);
      const execsText = execs.length
        ? execs
            .map(
              (e) => `[${e.id}] ${e.title}${e.startTime ? ` às ${e.startTime}` : ""} (${e.status})`,
            )
            .join("; ")
        : "nenhum compromisso hoje";
      const rem = [
        ...overdueReminders(remindersState, today),
        ...todayReminders(remindersState, today),
      ];
      const remText = rem.length
        ? rem.map((r) => `${r.text} (${r.date})`).join("; ")
        : "nenhum lembrete pendente";
      return JSON.stringify({
        card: "agenda",
        title: "Seu dia",
        items: execs,
        reminders: remText,
        summary: execs.length ? "Estes são seus compromissos de hoje." : "Nenhum compromisso hoje.",
      });
    }

    case "criar_lembrete": {
      await createReminder({ text: args.text as string, date: args.date as string });
      return `Lembrete criado: "${args.text}" pra ${args.date}.`;
    }

    case "criar_execucao": {
      const id = await createExecution({
        title: args.title as string,
        dueDate: args.dueDate as string,
        agendaDate: args.agendaDate as string | undefined,
        startTime: args.startTime as string | undefined,
        category: (args.category as string) || "generico",
      });
      return JSON.stringify({
        card: "appointment",
        id,
        title: args.title,
        date: args.agendaDate || args.dueDate,
        startTime: args.startTime,
        category: args.category,
        summary: "Compromisso marcado.",
      });
    }

    case "concluir_execucao": {
      await completeExecution(args.executionId as string);
      return `Marcado como concluído.`;
    }

    case "criar_plano": {
      const catByArea: Record<string, string> = {
        Corpo: "saude",
        Mente: "desenvolvimento",
        Carreira: "carreira",
        Relações: "relacionamentos",
        Arte: "arte",
        Finanças: "financas",
        Fé: "fe",
      };
      const { id } = await createGoal({
        title: args.title as string,
        why: args.why as string,
        trackingType: "etapas",
        kind: "projeto",
        category: catByArea[args.lifeArea as string] ?? "generico",
        lifeArea: args.lifeArea as string,
        deadlineLabel: (args.deadlineLabel as string) || "sem prazo",
        deadlineISO: args.deadlineISO as string | undefined,
        metric: { target: 1, unit: "etapas" },
        steps: args.steps as { title: string; targetDate?: string }[] | undefined,
      });
      const state = await fetchGoalsState();
      const steps = state.steps.filter((s) => s.goalId === id).sort((a, b) => a.order - b.order);
      try {
        const proposed = args.steps as { actions?: string[] }[] | undefined;
        for (let i = 0; i < steps.length; i++)
          for (const action of proposed?.[i]?.actions || []) await addSubtask(steps[i].id, action);
      } catch {
        return JSON.stringify({
          card: "plan",
          id,
          ...args,
          summary:
            "Plano e etapas salvos. Algumas ações não puderam ser salvas; revise no planejamento.",
        });
      }
      return JSON.stringify({
        card: "plan",
        id,
        ...args,
        summary: "Plano, etapas e ações criados.",
      });
    }

    case "consultar_treino_hoje": {
      const state = await fetchWorkoutState();
      const planId = todaysPlanId(state.weeklyAssignment);
      if (!planId) return "Hoje não tem treino programado.";
      const plan = state.plans.find((p) => p.id === planId);
      const exercises = exercisesForPlan(state.exercises, planId);
      const session = sessionForToday(state.sessions, planId);
      const exText = exercises
        .map((e) => `[${e.id}] ${e.name} (${e.setsTarget}x${e.repsTarget})`)
        .join("; ");
      return `Treino de hoje: ${plan?.name ?? planId} (id ${planId}). Exercícios: ${exText}. Sessão: ${session ? `em andamento (id ${session.id})` : "ainda não iniciada"}.`;
    }

    case "iniciar_treino": {
      const id = await startSession(args.planId as string);
      return `Treino iniciado (sessão ${id}).`;
    }

    case "registrar_serie": {
      await logSet(
        args.sessionId as string,
        args.exerciseId as string,
        args.weight as number,
        args.reps as number,
      );
      return `Série registrada: ${args.weight}kg x ${args.reps} reps.`;
    }

    case "concluir_treino": {
      await finishSession(args.sessionId as string);
      return `Treino finalizado.`;
    }

    case "registrar_peso_corporal": {
      await addBodyWeight(args.weight as number);
      return `Peso registrado: ${args.weight}kg.`;
    }

    case "salvar_nota_leitura": {
      const state = await fetchReadingState();
      const titleLower = (args.bookTitle as string).toLowerCase();
      const book = state.books.find((b) => b.title.toLowerCase().includes(titleLower));
      if (!book) {
        await captureToInbox(
          `Nota de leitura pra "${args.bookTitle}" (livro não encontrado): ${args.content}`,
        );
        return `Não achei "${args.bookTitle}" na biblioteca — guardei na Caixa Norte pra organizar depois.`;
      }
      await addReadingNote({
        bookId: book.id,
        type: args.type as "quote" | "insight" | "note",
        content: args.content as string,
      });
      return `Nota salva no caderno de "${book.title}".`;
    }

    case "salvar_nota_fe": {
      await fetchFeState();
      await addNotebookEntry({
        type: args.type as
          | "deus_falou"
          | "oracao"
          | "gratidao"
          | "versiculo"
          | "aprendizado"
          | "testemunho"
          | "livre",
        content: args.content as string,
      });
      return `Salvo no caderno de fé.`;
    }

    case "capturar_caixa_norte": {
      await captureToInbox(args.content as string, "agente");
      return `Guardei na sua Caixa Norte. Quando quiser, organizamos isso.`;
    }

    default:
      return `Ferramenta desconhecida: ${name}.`;
  }
}

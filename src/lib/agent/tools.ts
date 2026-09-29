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
  updateReminder,
  toggleReminder,
  removeReminder,
  hasPushSubscription,
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
  updateSet,
  removeLastSet,
  finishSession,
  addBodyWeight,
  bodyWeightsByDateDesc,
  createPlan,
  updatePlan,
  removePlan,
  addExercise,
  removeExercise,
  setWeeklyAssignment,
} from "../workout-store";
import { fetchState as fetchReadingState, addNote as addReadingNote } from "../reading-store";
import { fetchState as fetchFeState, addNotebookEntry } from "../fe-store";
import { captureToInbox } from "./inbox-store";
import { fetchState as fetchNutritionState, confirmMealOption } from "../nutrition-store";
import {
  fetchCycleState,
  createCycle,
  createPlanInBlock,
  setBlockDay,
  activateCycle,
  endCycle,
  blocksForCycle,
  plansOfBlock,
  daysOfBlock,
  blockOn,
  activeCycle,
} from "../workout-cycle-store";
import { dateAndTimeInZone, getAppTimeZone, zonedTimeToUtcISO } from "../app-time-zone";

/** Mesmo fallback usado em run-agent.ts pro "hoje" do prompt: fuso escolhido
 * no app, ou o do navegador quando a pessoa nunca configurou um. Sem isso,
 * "às 14h" ficaria sujeito ao fuso do navegador mesmo quando o app já sabe
 * que a pessoa configurou outro. */
function effectiveTimeZone(): string {
  return getAppTimeZone() ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
}

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
        "Consulta dados reais de alimentação (momentos e opções com IDs), leitura, fé, planos ou academia (treinos/exercícios/dias da semana com IDs). Consulte antes de escolher IDs. Não retorne IDs internos na mensagem ao usuário.",
      parameters: {
        type: "object",
        properties: {
          area: {
            type: "string",
            enum: ["alimentacao", "leitura", "fe", "planos", "academia"],
          },
        },
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
      description:
        "Cria um lembrete pontual pra uma data, com hora opcional. Ação reversível, execute direto. Pra 'me lembra 1h antes do dentista', primeiro consulte a agenda pra achar o executionId do compromisso, então informe relatedExecutionId e offsetMinutesBefore (não invente time nesse caso — deixe o app calcular a partir do horário real do compromisso).",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string" },
          date: { type: "string", description: "Data no formato YYYY-MM-DD" },
          time: {
            type: "string",
            description: "HH:MM, só se a pessoa deu um horário explícito (sem ser 'antes de X')",
          },
          relatedExecutionId: {
            type: "string",
            description:
              "id do compromisso, de consultar_agenda/consultar_dia, se o pedido for relativo a ele",
          },
          offsetMinutesBefore: {
            type: "number",
            description: "minutos antes do horário do compromisso referenciado; 0 = na hora exata",
          },
        },
        required: ["text", "date"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "gerenciar_lembrete",
      description:
        "Conclui, remove ou edita um lembrete já existente, pelo id retornado por consultar_dia.",
      parameters: {
        type: "object",
        properties: {
          reminderId: { type: "string" },
          action: { type: "string", enum: ["concluir", "remover", "editar"] },
          text: { type: "string", description: "Só para action=editar" },
          date: { type: "string", description: "YYYY-MM-DD, só para action=editar" },
          time: { type: "string", description: "HH:MM, só para action=editar" },
        },
        required: ["reminderId", "action"],
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
      name: "consultar_peso_corporal",
      description: "Consulta o histórico recente de peso corporal e a variação.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "corrigir_serie",
      description:
        "Corrige peso e/ou repetições de uma série já registrada nesta sessão (não cria série nova). Consulte consultar_treino_hoje pra pegar sessionId/exerciseId.",
      parameters: {
        type: "object",
        properties: {
          sessionId: { type: "string" },
          exerciseId: { type: "string" },
          setIndex: { type: "number", description: "Posição da série, começando em 0" },
          weight: { type: "number" },
          reps: { type: "number" },
        },
        required: ["sessionId", "exerciseId", "setIndex"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "remover_ultima_serie",
      description: "Remove a última série registrada de um exercício na sessão em andamento.",
      parameters: {
        type: "object",
        properties: { sessionId: { type: "string" }, exerciseId: { type: "string" } },
        required: ["sessionId", "exerciseId"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "gerenciar_plano_treino",
      description:
        "Cria, edita ou remove um treino da biblioteca (ex.: Treino A). Consulte consultar_rotina area=academia antes de editar/remover pra ter o planId. Ação reversível, execute direto.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["criar", "editar", "remover"] },
          planId: { type: "string", description: "Obrigatório para editar/remover" },
          letter: { type: "string", description: "Ex.: 'A'. Obrigatório para criar" },
          name: { type: "string", description: "Obrigatório para criar" },
          muscleGroups: { type: "string", description: "Ex.: 'Peito e tríceps'" },
          exercises: {
            type: "array",
            description:
              "Obrigatório para criar (pelo menos 1); em editar, exercícios ADICIONADOS ao treino",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                setsTarget: { type: "number" },
                repsTarget: { type: "number" },
                loadTarget: { type: "number" },
                restSeconds: { type: "number" },
                muscleGroup: {
                  type: "string",
                  enum: [
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
                  ],
                },
                equipment: {
                  type: "string",
                  enum: [
                    "barra",
                    "halteres",
                    "maquina",
                    "cabo",
                    "peso_corporal",
                    "assistido",
                    "kettlebell",
                    "elastico",
                    "outro",
                  ],
                },
              },
              required: ["name", "setsTarget", "repsTarget", "loadTarget"],
            },
          },
          removeExerciseNames: {
            type: "array",
            items: { type: "string" },
            description: "Em editar: nomes de exercícios a remover deste treino",
          },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "definir_dias_treino",
      description:
        "Define qual treino (da biblioteca) acontece em cada dia da semana. weekday: 0=domingo...6=sábado. planId nulo = descanso nesse dia.",
      parameters: {
        type: "object",
        properties: {
          assignments: {
            type: "array",
            items: {
              type: "object",
              properties: {
                weekday: { type: "number" },
                planId: { type: ["string", "null"] },
              },
              required: ["weekday", "planId"],
            },
          },
        },
        required: ["assignments"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "criar_ciclo_treino",
      description:
        "Cria um ciclo de treino completo — um ou mais blocos (fases) com datas, cada um com seus próprios treinos (ex.: A/B/C) e exercícios, e a atribuição de dias da semana dentro de cada bloco. Use pra 'quero um ciclo de 3 meses de resistência, depois 2 meses ABC'. Ativa o ciclo por padrão (activate=false só se a pessoa pedir pra deixar como rascunho). Ação reversível, execute direto sem pedir confirmação por texto — o card mostra o resultado.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          startDate: { type: "string", description: "YYYY-MM-DD" },
          why: { type: "string" },
          activate: { type: "boolean" },
          blocks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                durationDays: { type: "number" },
                focus: { type: "string" },
                muscleGroups: { type: "string" },
                plans: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      letter: { type: "string" },
                      name: { type: "string" },
                      muscleGroups: { type: "string" },
                      exercises: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            name: { type: "string" },
                            setsTarget: { type: "number" },
                            repsTarget: { type: "number" },
                            loadTarget: { type: "number" },
                            restSeconds: { type: "number" },
                          },
                          required: ["name", "setsTarget", "repsTarget", "loadTarget"],
                        },
                      },
                    },
                    required: ["letter", "name", "exercises"],
                  },
                },
                weekdayAssignment: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      weekday: { type: "number" },
                      planLetter: { type: ["string", "null"] },
                      startTime: { type: "string" },
                    },
                    required: ["weekday", "planLetter"],
                  },
                },
              },
              required: ["name", "durationDays", "plans"],
            },
          },
        },
        required: ["name", "startDate", "blocks"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "consultar_ciclo_treino",
      description: "Consulta o ciclo de treino ativo — blocos, treinos de cada bloco e datas.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "encerrar_ciclo_treino",
      description: "Encerra o ciclo de treino ativo.",
      parameters: {
        type: "object",
        properties: {
          restoreWeekly: {
            type: "boolean",
            description: "Volta o plano da semana de antes do ciclo. Padrão true.",
          },
        },
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
              : args.area === "academia"
                ? await fetchWorkoutState()
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
        ? rem
            .map(
              (r) =>
                `[${r.id}] ${r.text} (${r.date}${
                  r.remindAt
                    ? ` às ${dateAndTimeInZone(new Date(r.remindAt), effectiveTimeZone()).time}`
                    : ""
                })`,
            )
            .join("; ")
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
      const relatedExecutionId = args.relatedExecutionId as string | undefined;
      const offsetMinutes = args.offsetMinutesBefore as number | undefined;
      const zone = effectiveTimeZone();
      let remindAt: string | undefined;
      if (relatedExecutionId) {
        const state = await fetchGoalsState();
        const exec = state.executions.find((e) => e.id === relatedExecutionId);
        if (!exec?.agendaDate || !exec?.startTime)
          throw new Error(
            "Esse compromisso não tem hora marcada — consulte a agenda de novo antes de criar o lembrete.",
          );
        remindAt = new Date(
          new Date(zonedTimeToUtcISO(exec.agendaDate, exec.startTime, zone)).getTime() -
            (offsetMinutes ?? 0) * 60_000,
        ).toISOString();
      } else if (args.time) {
        remindAt = zonedTimeToUtcISO(args.date as string, args.time as string, zone);
      }
      const id = await createReminder({
        text: args.text as string,
        date: args.date as string,
        remindAt,
        relatedExecutionId,
        offsetMinutes,
      });
      const timeLabel = remindAt ? ` às ${dateAndTimeInZone(new Date(remindAt), zone).time}` : "";
      const summary = `Lembrete criado: "${args.text}" pra ${args.date}${timeLabel}.`;
      if (remindAt && !(await hasPushSubscription())) {
        return JSON.stringify({
          card: "notifications",
          id,
          description: `${summary} Ative notificações pra receber o aviso no horário certo.`,
          summary,
        });
      }
      return summary;
    }

    case "gerenciar_lembrete": {
      const reminders = await fetchRemindersState();
      const reminder = reminders.find((r) => r.id === args.reminderId);
      if (!reminder)
        throw new Error("Lembrete não encontrado. Consulte consultar_dia de novo pra pegar o id.");
      const action = args.action as "concluir" | "remover" | "editar";
      if (action === "concluir") {
        await toggleReminder(reminder.id, reminder.done);
        return `Lembrete concluído.`;
      }
      if (action === "remover") {
        await removeReminder(reminder.id);
        return `Lembrete removido.`;
      }
      const nextDate = (args.date as string | undefined) ?? reminder.date;
      const nextTime = args.time as string | undefined;
      await updateReminder(reminder.id, {
        text: args.text as string | undefined,
        date: args.date as string | undefined,
        remindAt: nextTime ? zonedTimeToUtcISO(nextDate, nextTime, effectiveTimeZone()) : undefined,
      });
      return `Lembrete atualizado.`;
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

    case "consultar_peso_corporal": {
      const state = await fetchWorkoutState();
      const sorted = bodyWeightsByDateDesc(state.bodyWeights);
      if (sorted.length === 0) return "Nenhum peso registrado ainda.";
      const latest = sorted[0];
      const oldest = sorted[sorted.length - 1];
      const delta = Math.round((latest.weight - oldest.weight) * 10) / 10;
      const history = sorted
        .slice(0, 5)
        .map((b) => `${b.weight}kg (${b.date})`)
        .join("; ");
      return `Últimos registros: ${history}. Variação desde o mais antigo mostrado: ${delta > 0 ? "+" : ""}${delta}kg.`;
    }

    case "corrigir_serie": {
      await updateSet(
        args.sessionId as string,
        args.exerciseId as string,
        args.setIndex as number,
        {
          weight: args.weight as number | undefined,
          reps: args.reps as number | undefined,
        },
      );
      return `Série corrigida.`;
    }

    case "remover_ultima_serie": {
      await removeLastSet(args.sessionId as string, args.exerciseId as string);
      return `Última série removida.`;
    }

    case "gerenciar_plano_treino": {
      const action = args.action as "criar" | "editar" | "remover";
      type ExerciseInput = {
        name: string;
        setsTarget: number;
        repsTarget: number;
        loadTarget: number;
        restSeconds?: number;
        muscleGroup?: string;
        equipment?: string;
      };
      if (action === "criar") {
        const planId = await createPlan({
          letter: args.letter as string,
          name: args.name as string,
          muscleGroups: (args.muscleGroups as string) ?? "",
        });
        for (const ex of (args.exercises as ExerciseInput[]) ?? []) {
          await addExercise(planId, {
            name: ex.name,
            setsTarget: ex.setsTarget,
            repsTarget: ex.repsTarget,
            loadTarget: ex.loadTarget,
            restSeconds: ex.restSeconds ?? 60,
            muscleGroup: ex.muscleGroup as never,
            equipment: ex.equipment as never,
          });
        }
        return `Treino "${args.name}" criado com ${((args.exercises as ExerciseInput[]) ?? []).length} exercício(s).`;
      }
      if (action === "remover") {
        await removePlan(args.planId as string);
        return `Treino removido. Sessões já registradas continuam no seu histórico.`;
      }
      // editar
      const patch: { name?: string; muscleGroups?: string } = {};
      if (args.name !== undefined) patch.name = args.name as string;
      if (args.muscleGroups !== undefined) patch.muscleGroups = args.muscleGroups as string;
      if (Object.keys(patch).length > 0) await updatePlan(args.planId as string, patch);
      let added = 0;
      for (const ex of (args.exercises as ExerciseInput[]) ?? []) {
        await addExercise(args.planId as string, {
          name: ex.name,
          setsTarget: ex.setsTarget,
          repsTarget: ex.repsTarget,
          loadTarget: ex.loadTarget,
          restSeconds: ex.restSeconds ?? 60,
          muscleGroup: ex.muscleGroup as never,
          equipment: ex.equipment as never,
        });
        added++;
      }
      let removed = 0;
      if ((args.removeExerciseNames as string[] | undefined)?.length) {
        const state = await fetchWorkoutState();
        const planExercises = state.exercises.filter((e) => e.planId === args.planId);
        for (const name of args.removeExerciseNames as string[]) {
          const match = planExercises.find((e) =>
            e.name.toLowerCase().includes(name.toLowerCase()),
          );
          if (match) {
            await removeExercise(match.id);
            removed++;
          }
        }
      }
      return `Treino atualizado${added ? `, ${added} exercício(s) adicionado(s)` : ""}${removed ? `, ${removed} removido(s)` : ""}.`;
    }

    case "definir_dias_treino": {
      const assignments = args.assignments as { weekday: number; planId: string | null }[];
      for (const a of assignments) await setWeeklyAssignment(a.weekday, a.planId);
      return `Dias da semana atualizados: ${assignments.length} dia(s).`;
    }

    case "criar_ciclo_treino": {
      type PlanSpec = {
        letter: string;
        name: string;
        muscleGroups?: string;
        exercises: {
          name: string;
          setsTarget: number;
          repsTarget: number;
          loadTarget: number;
          restSeconds?: number;
        }[];
      };
      type BlockSpec = {
        name: string;
        durationDays: number;
        focus?: string;
        muscleGroups?: string;
        plans: PlanSpec[];
        weekdayAssignment?: { weekday: number; planLetter: string | null; startTime?: string }[];
      };
      const blocks = args.blocks as BlockSpec[];
      const cycleId = await createCycle({
        name: args.name as string,
        startDate: args.startDate as string,
        why: args.why as string | undefined,
        blocks: blocks.map((b) => ({
          name: b.name,
          durationDays: b.durationDays,
          focus: b.focus,
          muscleGroups: b.muscleGroups,
        })),
      });

      const cycleState = await fetchCycleState();
      const createdBlocks = blocksForCycle(cycleState.blocks, cycleId).sort(
        (a, b) => a.order - b.order,
      );

      for (let i = 0; i < blocks.length; i++) {
        const blockSpec = blocks[i];
        const blockId = createdBlocks[i]?.id;
        if (!blockId) continue;
        const letterToPlanId: Record<string, string> = {};
        for (const planSpec of blockSpec.plans) {
          const planId = await createPlanInBlock(blockId, {
            letter: planSpec.letter,
            name: planSpec.name,
            muscleGroups: planSpec.muscleGroups,
          });
          letterToPlanId[planSpec.letter] = planId;
          for (const ex of planSpec.exercises) {
            await addExercise(planId, {
              name: ex.name,
              setsTarget: ex.setsTarget,
              repsTarget: ex.repsTarget,
              loadTarget: ex.loadTarget,
              restSeconds: ex.restSeconds ?? 60,
            });
          }
        }
        for (const day of blockSpec.weekdayAssignment ?? []) {
          const planId = day.planLetter ? (letterToPlanId[day.planLetter] ?? null) : null;
          await setBlockDay(blockId, day.weekday, planId, day.startTime);
        }
      }

      if (args.activate !== false) await activateCycle(cycleId);
      return JSON.stringify({
        card: "plan",
        id: cycleId,
        title: args.name,
        deadlineLabel: `${blocks.length} bloco(s)`,
        steps: blocks.map((b) => ({
          title: b.name,
          actions: b.plans.map((p) => `${p.letter}: ${p.name}`),
        })),
        summary: `Ciclo "${args.name}" criado com ${blocks.length} bloco(s)${args.activate !== false ? " e ativado" : ""}.`,
      });
    }

    case "consultar_ciclo_treino": {
      const cycleState = await fetchCycleState();
      const cycle = activeCycle(cycleState.cycles);
      if (!cycle) return "Nenhum ciclo de treino ativo no momento.";
      const blocks = blocksForCycle(cycleState.blocks, cycle.id).sort((a, b) => a.order - b.order);
      const current = blockOn(blocks, todayISO());
      const workoutState = await fetchWorkoutState();
      const blocksText = blocks
        .map((b) => {
          const plans = plansOfBlock(cycleState.blockPlans, workoutState.plans, b.id);
          const days = daysOfBlock(cycleState.blockDays, b.id);
          return `${b.name} (${b.startDate} a ${b.endDate})${b.id === current?.id ? " [ATUAL]" : ""}: treinos ${plans.map((p) => `${p.letter} ${p.name}`).join(", ") || "nenhum"}; ${days.length} dia(s) programado(s)`;
        })
        .join(" | ");
      return `Ciclo "${cycle.name}" (${cycle.startDate} a ${cycle.endDate}). Blocos: ${blocksText}.`;
    }

    case "encerrar_ciclo_treino": {
      const cycleState = await fetchCycleState();
      const cycle = activeCycle(cycleState.cycles);
      if (!cycle) return "Nenhum ciclo de treino ativo pra encerrar.";
      await endCycle(cycle, args.restoreWeekly !== false);
      return `Ciclo "${cycle.name}" encerrado.`;
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

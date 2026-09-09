import { createClient } from "@supabase/supabase-js";
import { AGENT_SYSTEM_PROMPT } from "../src/lib/agent/system-prompt.ts";
import { parseAndValidateToolCall, requiresConfirmation } from "../src/lib/agent/policy.ts";

const model = "gpt-4o-mini";
const apiKey = process.env.OPENAI_API_KEY;
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
if (!apiKey || !supabaseUrl || !supabaseKey) throw new Error("Credenciais locais ausentes.");

const tools = [
  tool(
    "registrar_agua",
    "Registra água bebida agora.",
    {
      amountMl: { type: "number" },
    },
    ["amountMl"],
  ),
  tool(
    "corrigir_ultima_agua",
    "Corrige o último registro de água; nunca cria outro registro.",
    {
      amountMl: { type: "number" },
    },
    ["amountMl"],
  ),
  tool(
    "registrar_transacao",
    "Registra gasto ou entrada quando valor e categoria estão claros.",
    {
      type: { type: "string", enum: ["expense", "income"] },
      amount: { type: "number" },
      description: { type: "string" },
      category: {
        type: "string",
        enum: [
          "Alimentação",
          "Transporte",
          "Lazer",
          "Compras",
          "Assinaturas",
          "Aluguel",
          "Academia",
          "Trabalho/Receita",
          "Outros",
        ],
      },
    },
    ["type", "amount", "description", "category"],
  ),
  tool("consultar_dia", "Consulta agenda e lembretes de hoje.", {}, []),
  tool(
    "criar_execucao",
    "Nível 3: prepara tarefa ou compromisso e exige confirmação.",
    {
      title: { type: "string" },
      dueDate: { type: "string" },
      agendaDate: { type: "string" },
      startTime: { type: "string" },
      category: { type: "string" },
    },
    ["title", "dueDate"],
  ),
  tool(
    "criar_plano",
    "Nível 3: prepara um novo plano e exige confirmação.",
    {
      title: { type: "string" },
      why: { type: "string" },
      lifeArea: {
        type: "string",
        enum: ["Corpo", "Mente", "Carreira", "Relações", "Arte", "Finanças", "Fé"],
      },
      deadlineISO: { type: "string" },
      deadlineLabel: { type: "string" },
    },
    ["title", "why", "lifeArea", "deadlineLabel"],
  ),
  tool(
    "capturar_caixa_norte",
    "Guarda ideia, pendência ou promessa sem classificação clara.",
    { content: { type: "string" } },
    ["content"],
  ),
];

function tool(name, description, properties, required) {
  return {
    type: "function",
    function: { name, description, parameters: { type: "object", properties, required } },
  };
}

async function ask(message, priorMessages = []) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 300,
      tools,
      tool_choice: "auto",
      messages: [
        { role: "system", content: AGENT_SYSTEM_PROMPT },
        ...priorMessages,
        { role: "user", content: message },
      ],
    }),
  });
  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${await response.text()}`);
  const result = (await response.json()).choices?.[0]?.message;
  const calls = (result?.tool_calls ?? []).map((call) => {
    try {
      const action = parseAndValidateToolCall(call);
      return {
        name: action.name,
        args: action.args,
        confirmationRequired: requiresConfirmation(action.name),
        valid: true,
      };
    } catch (error) {
      return {
        name: call.function.name,
        valid: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
  return { message, answer: result?.content ?? null, calls };
}

async function testSupabaseIsolation() {
  const clients = Array.from({ length: 3 }, () =>
    createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } }),
  );
  const users = [];
  for (const client of clients) {
    const { data, error } = await client.auth.signInAnonymously();
    if (error) throw error;
    users.push(data.user.id);
  }
  const inserted = [];
  try {
    for (let index = 0; index < clients.length; index++) {
      const { data, error } = await clients[index]
        .from("agent_inbox_items")
        .insert({ content: `persona-live-${index + 1}`, source: "agente" })
        .select("id")
        .single();
      if (error) throw error;
      inserted.push(data.id);
    }
    const visibleCounts = [];
    for (const client of clients) {
      const { data, error } = await client
        .from("agent_inbox_items")
        .select("id,content")
        .like("content", "persona-live-%");
      if (error) throw error;
      visibleCounts.push(data.length);
    }
    return {
      usersCreated: users.length,
      visibleCounts,
      isolated: visibleCounts.every((count) => count === 1),
    };
  } finally {
    for (let index = 0; index < inserted.length; index++)
      await clients[index].from("agent_inbox_items").delete().eq("id", inserted[index]);
  }
}

const personaResults = [];
const scenarios = [
  { persona: "informal", message: "bebi mei litro e gastei vintao no busao" },
  {
    persona: "perdido",
    message: "to ruim hoje joga tudo amanha ai sei la mas nao mexe sem eu confirmar",
  },
  {
    persona: "detalhista",
    message:
      "Crie um plano chamado Lançar Produto, área Carreira, objetivo validar uma nova fonte de receita, prazo final em 8 de dezembro de 2026. Não salve sem me mostrar antes.",
  },
  { persona: "correcao", message: "errei, a água que falei antes não foi 500 ml, foi 300 ml" },
];
for (const scenario of scenarios) {
  personaResults.push({ persona: scenario.persona, ...(await ask(scenario.message)) });
}
const detailed = personaResults.find((result) => result.persona === "detalhista");
if (detailed?.answer) {
  personaResults.push({
    persona: "detalhista_confirmacao",
    ...(await ask("confirmo", [
      { role: "user", content: detailed.message },
      { role: "assistant", content: detailed.answer },
    ])),
  });
}

let supabase;
try {
  supabase = await testSupabaseIsolation();
} catch (error) {
  supabase = { error: error instanceof Error ? error.message : String(error) };
}

console.log(JSON.stringify({ model, personaResults, supabase }, null, 2));

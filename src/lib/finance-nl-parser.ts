// Parser determinístico (regex + palavras-chave), sem IA — interpreta frases
// como "comprei uma barrinha de proteína por 8 reais" em campos estruturados.
// O resultado SEMPRE passa por uma tela de confirmação editável: o parser
// pode errar, mas a UI nunca finge certeza sobre o que entendeu.

export type ParsedEntry = {
  type: "expense" | "income";
  amount: number;
  description: string;
  category: string;
};

const incomeVerbs = ["recebi", "ganhei", "entrou", "caiu", "faturei"];
const expenseVerbs = ["comprei", "gastei", "paguei", "torrei"];

const categoryKeywords: { category: string; words: string[] }[] = [
  {
    category: "Alimentação",
    words: [
      "barrinha",
      "proteína",
      "proteina",
      "mercado",
      "ifood",
      "restaurante",
      "lanche",
      "almoço",
      "almoco",
      "jantar",
      "café",
      "cafe",
      "padaria",
      "comida",
      "pizza",
      "burger",
      "hamburguer",
      "hamburguer",
    ],
  },
  {
    category: "Transporte",
    words: [
      "uber",
      "99",
      "taxi",
      "táxi",
      "gasolina",
      "combustível",
      "combustivel",
      "estacionamento",
      "onibus",
      "ônibus",
      "metro",
      "metrô",
    ],
  },
  {
    category: "Lazer",
    words: ["cinema", "bar", "show", "balada", "ingresso", "viagem", "passeio", "streaming"],
  },
  {
    category: "Assinaturas",
    words: ["netflix", "spotify", "assinatura", "mensalidade"],
  },
  {
    category: "Compras",
    words: ["roupa", "tênis", "tenis", "loja", "shopping", "sapato", "eletrônico", "eletronico"],
  },
  {
    category: "Academia",
    words: ["academia", "personal", "suplemento"],
  },
  {
    category: "Aluguel",
    words: ["aluguel", "condomínio", "condominio"],
  },
  {
    category: "Trabalho/Receita",
    words: ["cliente", "freela", "freelance", "salário", "salario", "projeto", "job"],
  },
];

function detectAmount(text: string): number | null {
  const normalized = text.toLowerCase();
  // ex: "8 reais", "r$8", "r$ 8,50", "2500", "2.500,00"
  const match = normalized.match(
    /(?:r\$|\$)?\s?(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(?:reais|real)?/,
  );
  if (!match) return null;
  let raw = match[1];
  // "2.500,00" ou "2500" → normaliza separador decimal
  if (/,\d{1,2}$/.test(raw)) {
    raw = raw.replace(/\./g, "").replace(",", ".");
  } else {
    raw = raw.replace(/,/g, "");
  }
  const value = parseFloat(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function detectType(text: string): "expense" | "income" {
  const normalized = text.toLowerCase();
  if (incomeVerbs.some((v) => normalized.includes(v))) return "income";
  if (expenseVerbs.some((v) => normalized.includes(v))) return "expense";
  return "expense";
}

function detectCategory(text: string, type: "expense" | "income"): string {
  const normalized = text.toLowerCase();
  for (const { category, words } of categoryKeywords) {
    if (words.some((w) => normalized.includes(w))) return category;
  }
  return type === "income" ? "Trabalho/Receita" : "Outros";
}

function buildDescription(text: string, amountMatch: string | null): string {
  let cleaned = text.trim();
  if (amountMatch) cleaned = cleaned.replace(amountMatch, " ");
  cleaned = cleaned
    .replace(/\b(por|de)\b\s*$/i, "")
    .replace(/^\s*(comprei|gastei|paguei|torrei|recebi|ganhei|entrou|caiu|faturei)\s+/i, "")
    .replace(/\breais?\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!cleaned) cleaned = text.trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export function parseFinanceEntry(text: string): ParsedEntry | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const amount = detectAmount(trimmed);
  if (amount === null) return null;
  const type = detectType(trimmed);
  const category = detectCategory(trimmed, type);
  const amountMatch = trimmed
    .toLowerCase()
    .match(
      /(?:r\$|\$)?\s?(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(?:reais|real)?/,
    );
  const description = buildDescription(trimmed, amountMatch ? amountMatch[0] : null);
  return { type, amount, description, category };
}

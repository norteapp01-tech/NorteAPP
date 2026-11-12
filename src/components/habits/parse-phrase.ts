import type { GoalPeriod, Intent, Measure } from "@/lib/habits/types";

// ---------------------------------------------------------------------------
// "Preencher com uma frase": interpretação determinística (sem IA) de frases
// como "ler 50 páginas por semana" ou "reduzir café a 2 por dia". O resultado
// SEMPRE passa por revisão do usuário antes de salvar — o parser pode errar, a
// interface nunca finge certeza.
// ---------------------------------------------------------------------------

export type PhraseDraft = {
  name: string;
  intent: Intent;
  measure: Measure;
  unit?: string;
  value: number;
  period: GoalPeriod;
  weekdays?: number[];
};

const PERIOD_WORDS: [RegExp, GoalPeriod][] = [
  [
    /\b(por|a cada|na|no|todo|toda|todos os|todas as)\s*(dia|diari\w*)\b|\bdiari\w*|\btodos os dias\b/i,
    "day",
  ],
  [/\b(por|na|toda|todas as)\s*semana\b|\bsemanal\w*|\bna semana\b/i, "week"],
  [/\b(por|no|todo)\s*m[eê]s\b|\bmensal\w*/i, "month"],
  [/\b(por|no|todo)\s*ano\b|\banual\w*/i, "year"],
];

const UNIT_ALIASES: [RegExp, string, Measure][] = [
  [/\b(litros?|l)\b/i, "L", "quantity"],
  [/\b(ml|mililitros?)\b/i, "ml", "quantity"],
  [/\b(km|quil[oô]metros?)\b/i, "km", "quantity"],
  [/\b(min|minutos?)\b/i, "min", "duration"],
  [/\b(horas?|h)\b/i, "h", "duration"],
  [/\b(p[aá]ginas?|pags?)\b/i, "páginas", "quantity"],
  [/\b(copos?)\b/i, "copos", "count"],
  [/\b(vezes|x)\b/i, "vezes", "count"],
  [/\b(kg|quilos?)\b/i, "kg", "quantity"],
  [/\b(g|gramas?)\b/i, "g", "quantity"],
];

const NUMBER = /(\d+(?:[.,]\d+)?)/;

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export function parseHabitPhrase(text: string): PhraseDraft | null {
  // "2 litros de água" → "2 litros água": a preposição depois da unidade não é do nome.
  const raw = text
    .trim()
    .replace(
      /(\d+(?:[.,]\d+)?\s*(?:litros?|ml|mililitros?|km|quil[oô]metros?|minutos?|min|horas?|p[aá]ginas?|copos?|vezes|quilos?|kg|gramas?))\s+(?:de|do|da)\s+/i,
      "$1 ",
    );
  if (raw.length < 3) return null;
  const lower = raw.toLocaleLowerCase("pt-BR");

  let intent: Intent = "build";
  if (/\b(parar de|deixar de|abandonar|largar|nunca mais)\b/.test(lower)) intent = "quit";
  else if (/\b(reduzir|diminuir|limitar|no m[aá]ximo|at[eé])\b/.test(lower)) intent = "limit";

  let period: GoalPeriod = "day";
  for (const [re, p] of PERIOD_WORDS) {
    if (re.test(raw)) {
      period = p;
      break;
    }
  }

  const num = raw.match(NUMBER);
  const value = num ? Number(num[1].replace(",", ".")) : intent === "quit" ? 0 : 1;

  let unit: string | undefined;
  let measure: Measure = "binary";
  if (num) {
    const after = raw.slice(
      (num.index ?? 0) + num[0].length,
      (num.index ?? 0) + num[0].length + 24,
    );
    for (const [re, u, m] of UNIT_ALIASES) {
      if (re.test(after)) {
        unit = u;
        measure = m;
        break;
      }
    }
    // "reduzir café a 2 por dia": número sem unidade é contagem.
    if (!unit && (intent !== "build" || value > 1)) {
      unit = "vezes";
      measure = "count";
    }
  }

  // Nome: o que sobra depois de tirar números, unidades, período e verbos de intenção.
  let name = raw
    .replace(NUMBER, " ")
    .replace(/\b(quero|preciso|vou|gostaria de|tenho que|devo)\b/gi, " ")
    .replace(
      /\b(reduzir|diminuir|limitar|parar de|deixar de|abandonar|largar|nunca mais|no m[aá]ximo|at[eé])\b/gi,
      " ",
    )
    .replace(
      /\b(litros?|ml|mililitros?|km|quil[oô]metros?|minutos?|min|horas?|p[aá]ginas?|copos?|vezes|quilos?|kg|gramas?)\b/gi,
      " ",
    )
    .replace(
      /\b(por|a cada|na|no|todo|toda|todos os|todas as)\s*(dia|semana|m[eê]s|ano|dias)\b/gi,
      " ",
    )
    .replace(/\b(di[aá]ri\w*|semanal\w*|mensal\w*|anual\w*)\b/gi, " ")
    .replace(/\b(a|de|do|da|o|os|as|um|uma)\s*$/i, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  name = name.replace(/^(de|da|do|a|o)\s+/i, "").trim();
  if (!name) return null;

  return { name: cap(name), intent, measure, unit, value, period };
}

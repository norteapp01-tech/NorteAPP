// Unidades: converte só dentro da mesma família e nunca soma o que não é comparável.

type Family = "volume" | "distance" | "duration" | "mass";

const KNOWN: Record<string, { family: Family; toBase: number; label: string }> = {
  ml: { family: "volume", toBase: 1, label: "ml" },
  l: { family: "volume", toBase: 1000, label: "L" },
  m: { family: "distance", toBase: 1, label: "m" },
  km: { family: "distance", toBase: 1000, label: "km" },
  min: { family: "duration", toBase: 1, label: "min" },
  h: { family: "duration", toBase: 60, label: "h" },
  g: { family: "mass", toBase: 1, label: "g" },
  kg: { family: "mass", toBase: 1000, label: "kg" },
};

const norm = (u: string | undefined) => (u ?? "").trim().toLocaleLowerCase("pt-BR");

export function unitFamily(unit: string | undefined): string {
  const k = KNOWN[norm(unit)];
  // Unidade livre (copos, páginas…) só é comparável com ela mesma.
  return k ? k.family : `custom:${norm(unit)}`;
}

export function canSum(a: string | undefined, b: string | undefined): boolean {
  return unitFamily(a) === unitFamily(b);
}

/** Converte `value` de `from` para `to`; `null` quando as unidades não são compatíveis. */
export function convertUnit(
  value: number,
  from: string | undefined,
  to: string | undefined,
): number | null {
  if (norm(from) === norm(to)) return value;
  const a = KNOWN[norm(from)];
  const b = KNOWN[norm(to)];
  if (!a || !b || a.family !== b.family) return null;
  return (value * a.toBase) / b.toBase;
}

export const UNIT_SUGGESTIONS = [
  "vezes",
  "copos",
  "páginas",
  "min",
  "h",
  "ml",
  "L",
  "km",
  "g",
  "kg",
];

/** "1 treino" / "2 treinos": unidade livre vai para o singular quando o valor é 1.
 * Unidades conhecidas (ml, km, min…) não variam. */
export function unitLabel(unit: string, value: number): string {
  const known = KNOWN[norm(unit)];
  if (known) return known.label;
  if (Math.abs(value) !== 1) return unit;
  if (/ezes$/i.test(unit)) return unit.slice(0, -2); // vezes → vez
  if (/[^s]s$/i.test(unit) || /ões$/i.test(unit))
    return /ões$/i.test(unit) ? `${unit.slice(0, -3)}ão` : unit.slice(0, -1);
  return unit;
}

export function formatAmount(value: number, unit?: string): string {
  const rounded = Math.round(value * 100) / 100;
  const text = rounded.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  return unit ? `${text} ${unitLabel(unit, rounded)}` : text;
}

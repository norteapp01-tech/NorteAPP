import { timeToMinutes } from "./agenda-time";

// ---------------------------------------------------------------------------
// Geometria da linha do tempo da Agenda.
//
// A agenda ia das 07:00 às 22:00, então quem trabalha, treina ou estuda de
// madrugada não tinha onde aparecer. Agora o dia inteiro existe, e tudo é
// contado em MINUTOS DESDE 00:00 — sem offset de "hora inicial" para subtrair.
// ---------------------------------------------------------------------------

export const HOUR_HEIGHT = 52;
export const DAY_MINUTES = 24 * 60;
export const TIMELINE_HEIGHT = 24 * HOUR_HEIGHT;

/** "24:00" e "00:00" nomeiam o mesmo instante; no FIM de um evento, o que se
 * quer dizer é "até o fim do dia". */
export function endTimeToMinutes(time: string): number {
  const value = timeToMinutes(time);
  return value === 0 ? DAY_MINUTES : value;
}

/** Parte de um evento que cai DENTRO deste dia. Um compromisso que atravessa a
 * meia-noite aparece até 24:00 no primeiro dia e recomeça em 00:00 no seguinte
 * — em vez de sumir ou virar um bloco de altura negativa. */
export function spanForDay(
  startTime: string | undefined,
  endTime: string | undefined,
  part: "principal" | "continuacao",
): { start: number; end: number } | null {
  if (!startTime) return null;
  const start = timeToMinutes(startTime);
  const rawEnd = endTime ? endTimeToMinutes(endTime) : start + 60;
  // Fim menor ou igual ao início significa que o evento vira o dia.
  const crosses = rawEnd <= start;
  if (part === "continuacao") {
    if (!crosses) return null;
    return { start: 0, end: rawEnd };
  }
  // A duração mínima é VISUAL (altura do bloco), não do modelo: forçar 15
  // minutos aqui faria um compromisso das 23:50 às 23:59 terminar depois da
  // meia-noite.
  return { start, end: crosses ? DAY_MINUTES : Math.min(rawEnd, DAY_MINUTES) };
}

/** Onde abrir o dia. Sempre em 00:00 obrigaria a rolar até o horário útil toda
 * vez; a regra é: hoje → uma hora antes de agora; outro dia com compromisso →
 * uma hora antes do primeiro; dia vazio → 07:00, a visão familiar. */
export function initialScrollTop(anchorMinutes: number, viewport: number): number {
  const target = ((anchorMinutes - 60) / 60) * HOUR_HEIGHT;
  return Math.max(0, Math.min(target, TIMELINE_HEIGHT - viewport));
}

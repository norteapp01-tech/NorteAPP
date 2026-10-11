import { formatDurationClock } from "@/lib/sport-store";
import type { RestStatus } from "@/lib/workout-store";

/** Relógio do descanso: contagem regressiva e, passando do zero, contagem
 * crescente com "+" — assim dá pra saber quanto tempo se descansou de fato. */
export function restClockLabel(rest: { remaining: number; overtime: number; status: RestStatus }) {
  return rest.status === "fim"
    ? `+${formatDurationClock(rest.overtime)}`
    : formatDurationClock(rest.remaining);
}

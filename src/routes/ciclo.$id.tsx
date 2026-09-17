import { createFileRoute } from "@tanstack/react-router";
import { CyclePage } from "@/components/academia/cycle/CyclePage";

/** Página do ciclo aberta pela Academia. O mesmo conteúdo aparece em
 * `/objetivo/$id` quando o planejamento é do tipo `ciclo_treino` — é a mesma
 * linha no banco, então as duas portas precisam mostrar as mesmas coisas. */
export const Route = createFileRoute("/ciclo/$id")({
  head: () => ({ meta: [{ title: "Planejamento de treino — Norte" }] }),
  component: CicloRoute,
});

function CicloRoute() {
  const { id } = Route.useParams();
  return <CyclePage cycleId={id} backTo="/sub-agenda/academia" backLabel="Academia" />;
}

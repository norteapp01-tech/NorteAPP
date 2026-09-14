import { useEffect, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Footprints } from "lucide-react";
import { useSportRecorder } from "@/lib/sport-recorder-context";
import { computeDistanceM, formatDistanceKm, modalityLabel } from "@/lib/sport-store";

/** Acesso persistente à atividade em andamento — visível em qualquer tela
 * que não seja a própria gravação, enquanto o status for recording/paused. */
export function ActiveRecordingBar() {
  const recorder = useSportRecorder();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [, setTick] = useState(0);

  useEffect(() => {
    if (recorder.status !== "recording") return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [recorder.status]);

  if (pathname === "/esportes/gravar") return null;
  if (recorder.status !== "recording" && recorder.status !== "paused") return null;

  const elapsedS = recorder.startedAt
    ? Math.round((Date.now() - new Date(recorder.startedAt).getTime()) / 1000)
    : 0;
  const distanceM = computeDistanceM(recorder.points);

  return (
    <button
      onClick={() =>
        navigate({ to: "/esportes/gravar", search: { modalidade: recorder.modality ?? "corrida" } })
      }
      className="interactive-press fixed bottom-24 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full border border-primary/40 bg-background/95 px-4 py-2 shadow-lg backdrop-blur-xl"
    >
      <span
        className={`h-2 w-2 rounded-full ${recorder.status === "recording" ? "bg-primary" : "bg-warning"}`}
      />
      <Footprints className="h-4 w-4 text-primary" strokeWidth={1.8} />
      <span className="text-xs font-semibold">
        {recorder.modality ? modalityLabel[recorder.modality] : ""} · {formatDistanceKm(distanceM)}{" "}
        · {Math.floor(elapsedS / 60)}min
      </span>
    </button>
  );
}

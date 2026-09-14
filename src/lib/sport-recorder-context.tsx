import { createContext, useContext, type ReactNode } from "react";
import { useActivityRecorder, type ActivityRecorder } from "@/hooks/use-activity-recorder";

const SportRecorderContext = createContext<ActivityRecorder | null>(null);

/** Uma instância só, montada na raiz do app — é o que faz a gravação
 * sobreviver a navegar pra outra tela (Agenda, Hoje etc.) sem derrubar o
 * GPS. A tela de gravação e a barra persistente leem do mesmo lugar. */
export function SportRecorderProvider({ children }: { children: ReactNode }) {
  const recorder = useActivityRecorder();
  return <SportRecorderContext.Provider value={recorder}>{children}</SportRecorderContext.Provider>;
}

export function useSportRecorder(): ActivityRecorder {
  const ctx = useContext(SportRecorderContext);
  if (!ctx) throw new Error("useSportRecorder precisa estar dentro de <SportRecorderProvider>.");
  return ctx;
}

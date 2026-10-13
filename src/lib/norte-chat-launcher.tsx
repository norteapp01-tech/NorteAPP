import { createContext, useContext, type ReactNode } from "react";

/**
 * Deixa uma tela qualquer, de qualquer profundidade na árvore (ex.: o botão
 * de foto na aba Alimentação), abrir o chat global do Norte já com o
 * seletor de foto acionado — sem precisar subir estado até `__root.tsx`
 * manualmente em cada tela nova que precisar disso. Mesma arquitetura de
 * `GymSessionProvider`/`SportRecorderProvider`: montado uma vez na raiz.
 */
type NorteChatLauncher = {
  openChatWithPhoto: () => void;
  /** Abre a conversa com o texto já escrito (a pessoa revisa e envia). */
  openChatWithDraft: (text: string) => void;
};

const NorteChatLauncherContext = createContext<NorteChatLauncher | null>(null);

export function NorteChatLauncherProvider({
  value,
  children,
}: {
  value: NorteChatLauncher;
  children: ReactNode;
}) {
  return (
    <NorteChatLauncherContext.Provider value={value}>{children}</NorteChatLauncherContext.Provider>
  );
}

/** Fora do provider (ex.: uma tela testada isolada) vira no-op — nunca quebra
 * a tela por causa disso. */
export function useNorteChatLauncher(): NorteChatLauncher {
  return (
    useContext(NorteChatLauncherContext) ?? {
      openChatWithPhoto: () => {},
      openChatWithDraft: () => {},
    }
  );
}

import { QueryClient } from "@tanstack/react-query";

// Singleton único, compartilhado entre o router (Provider) e os stores de domínio
// (que disparam invalidateQueries fora de componentes React, dentro das próprias
// funções de ação — mesmo padrão de nome/assinatura que os stores já tinham).
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 10_000, retry: 1 },
  },
});

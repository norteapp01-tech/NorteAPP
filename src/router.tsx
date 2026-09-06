import { createRouter } from "@tanstack/react-router";
import { queryClient } from "./lib/query-client";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    // Prefetch a rota ao tocar/passar o mouse nos links (ex.: nav inferior) —
    // quando o clique realmente acontece, o código da rota já está baixado.
    defaultPreload: "intent",
  });

  return router;
};

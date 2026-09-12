import { createFileRoute, Outlet } from "@tanstack/react-router";

/** Rota de layout pura pra tudo sob /admin/* — o conteúdo real de cada página
 * (incluindo a checagem de acesso via AdminShell) vive nos arquivos filhos
 * (admin.index.tsx, admin.ia.tsx, ...). Sem Outlet aqui, o pai "esconde" as
 * rotas filhas — foi exatamente esse bug que a primeira versão tinha. */
export const Route = createFileRoute("/admin")({
  component: () => <Outlet />,
});

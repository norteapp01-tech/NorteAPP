import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AdminShell } from "@/components/admin/AdminShell";
import { fetchRecentAiAttempts, summarizeAiUsage } from "@/lib/admin/ai-usage-store";

export const Route = createFileRoute("/admin/")({
  head: () => ({ meta: [{ title: "Norte Admin" }] }),
  component: AdminOverview,
});

function AdminOverview() {
  const { data: attempts, isLoading } = useQuery({
    queryKey: ["admin-ai-attempts-overview"],
    queryFn: () => fetchRecentAiAttempts(500),
  });
  const summary = attempts ? summarizeAiUsage(attempts) : null;

  return (
    <AdminShell>
      <h1 className="text-2xl font-bold">Visão geral</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Etapa 0 do Norte Admin: fundação de acesso, auditoria e o ledger real de IA. Os demais
        módulos (CRM, retenção, funil, assinaturas, campanhas, financeiro) dependem de decisões
        ainda em aberto — ver pendências no relatório desta entrega.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-surface p-5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Tentativas de IA</p>
          <p className="mt-2 text-3xl font-bold">
            {isLoading ? "…" : (summary?.totalAttempts ?? 0)}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">últimas 500 registradas</p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Falhas</p>
          <p className="mt-2 text-3xl font-bold text-danger">
            {isLoading ? "…" : (summary?.failed ?? 0)}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            de {summary?.totalAttempts ?? 0} tentativas
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Pessoas usando o agente
          </p>
          <p className="mt-2 text-3xl font-bold">{isLoading ? "…" : (summary?.uniqueUsers ?? 0)}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            com pelo menos 1 tentativa registrada
          </p>
        </div>
      </div>

      <div className="mt-8 rounded-2xl border border-border bg-surface-2 p-5">
        <p className="text-sm font-semibold">Pendente para os próximos módulos</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>
            Gateway de cobrança e lojas — nenhum conectado ainda; Assinaturas/Conversão ficam sem
            dado real até isso ser decidido.
          </li>
          <li>
            Provedor de mensageria — nenhum conectado; Campanhas fica sem canal de envio real.
          </li>
          <li>
            Financeiro empresarial — precisa de fonte real de receitas/despesas da empresa (nunca as
            finanças pessoais dos usuários).
          </li>
          <li>
            Retenção/risco — precisa instrumentar eventos de produto (last_seen_at,
            last_meaningful_action_at) em cada módulo do app.
          </li>
        </ul>
      </div>
    </AdminShell>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AdminShell } from "@/components/admin/AdminShell";
import { fetchRecentAiAttempts, summarizeAiUsage } from "@/lib/admin/ai-usage-store";

export const Route = createFileRoute("/admin/ia")({
  head: () => ({ meta: [{ title: "Economia da IA — Norte Admin" }] }),
  component: AiEconomyPage,
});

const unitLabel: Record<string, string> = {
  input_tokens: "Tokens de entrada",
  cached_input_tokens: "Tokens de entrada (cache)",
  output_tokens: "Tokens de saída",
  audio_seconds: "Segundos de áudio",
};

function AiEconomyPage() {
  const {
    data: attempts,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["admin-ai-attempts"],
    queryFn: () => fetchRecentAiAttempts(200),
  });
  const summary = attempts ? summarizeAiUsage(attempts) : null;

  return (
    <AdminShell>
      <h1 className="text-2xl font-bold">Economia da IA</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Ledger real — cada linha é uma chamada de verdade à OpenAI, registrada pelo servidor com o
        consumo devolvido pelo provedor. Sem tarifa cadastrada, o custo aparece como{" "}
        <strong>não precificado</strong>, nunca como zero.
      </p>

      {error && (
        <p className="mt-4 rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
          Não consegui carregar o ledger: {error instanceof Error ? error.message : String(error)}
        </p>
      )}

      {!isLoading && attempts && attempts.length === 0 && (
        <div className="mt-6 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Nenhuma tentativa registrada ainda. Converse com o Norte (texto ou áudio) em /agente-teste
          ou na aba Hoje — a próxima chamada real já aparece aqui.
        </div>
      )}

      {summary && summary.totalAttempts > 0 && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Metric label="Tentativas" value={String(summary.totalAttempts)} />
            <Metric label="Sucesso" value={String(summary.succeeded)} />
            <Metric label="Falhas" value={String(summary.failed)} tone="danger" />
            <Metric
              label="Custo precificado"
              value={summary.pricedCostUsd > 0 ? `US$ ${summary.pricedCostUsd.toFixed(4)}` : "—"}
            />
          </div>

          <div className="mt-4 rounded-2xl border border-border bg-surface p-5">
            <p className="text-sm font-semibold">Consumo por unidade (bruto, sem preço)</p>
            <div className="mt-3 space-y-2">
              {Object.entries(summary.byUnit).map(([unit, qty]) => (
                <div key={unit} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{unitLabel[unit] ?? unit}</span>
                  <span className="font-mono font-medium">{qty.toLocaleString("pt-BR")}</span>
                </div>
              ))}
            </div>
            {summary.unpricedComponentCount > 0 && (
              <p className="mt-3 text-[11px] text-warning">
                {summary.unpricedComponentCount} componente(s) sem tarifa cadastrada em
                model_price_versions — custo real ainda não calculável. Cadastre os preços vigentes
                do provedor antes de confiar em qualquer valor em BRL aqui.
              </p>
            )}
          </div>

          <div className="mt-6 overflow-x-auto rounded-2xl border border-border bg-surface">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Quando</th>
                  <th className="px-4 py-3">Recurso</th>
                  <th className="px-4 py-3">Modelo</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Latência</th>
                  <th className="px-4 py-3">Consumo</th>
                </tr>
              </thead>
              <tbody>
                {attempts?.slice(0, 50).map((a) => (
                  <tr key={a.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {new Date(a.createdAt).toLocaleString("pt-BR", {
                        timeZone: "America/Sao_Paulo",
                      })}
                    </td>
                    <td className="px-4 py-2.5">
                      {a.feature === "agent_chat" ? "Conversa" : "Transcrição"}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">{a.model}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={
                          a.status === "succeeded"
                            ? "text-primary"
                            : a.status === "failed"
                              ? "text-danger"
                              : "text-muted-foreground"
                        }
                      >
                        {a.status === "succeeded"
                          ? "sucesso"
                          : a.status === "failed"
                            ? "falha"
                            : "pendente"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {a.latencyMs ? `${a.latencyMs}ms` : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {a.components.length
                        ? a.components
                            .map((c) => `${c.quantity} ${unitLabel[c.unit] ?? c.unit}`)
                            .join(" · ")
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </AdminShell>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "danger" }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1.5 text-2xl font-bold ${tone === "danger" ? "text-danger" : ""}`}>
        {value}
      </p>
    </div>
  );
}

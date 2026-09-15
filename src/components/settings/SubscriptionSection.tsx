import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase, useAuthUser } from "@/lib/supabase/client";
import { UnderlineTabs } from "@/components/ui/app-design-system";
import { SubscriptionPlans } from "@/components/SubscriptionPlans";

const labels: Record<string, string> = {
  base: "Base",
  essential: "Essencial",
  unlimited: "Ilimitado",
  active: "Ativa",
  past_due: "Pagamento pendente",
  canceled: "Encerrada",
  expired: "Expirada",
  trialing: "Período de teste",
  paid: "Pago",
  pending: "Pendente",
  failed: "Falhou",
  refunded: "Reembolsado",
  partially_refunded: "Reembolso parcial",
  web: "Site",
  apple: "App Store",
  google: "Google Play",
};
const date = (value: string | null) =>
  value ? new Date(value).toLocaleDateString("pt-BR") : "Não informada";
const money = (amount: number, currency: string) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(amount / 100);
type Subscription = {
  plan: string;
  status: string;
  interval: string;
  amount_minor: number;
  currency: string;
  provider: string;
  period_end: string | null;
  cancel_at_period_end: boolean;
};
type Charge = {
  id: string;
  created_at: string;
  paid_at: string | null;
  description: string;
  amount_minor: number;
  currency: string;
  status: string;
  receipt_url: string | null;
};

export function SubscriptionSection() {
  const user = useAuthUser();
  const [tab, setTab] = useState<"plan" | "charges">("plan");
  const [compare, setCompare] = useState(false);
  const [limit, setLimit] = useState(20);
  const query = useQuery({
    queryKey: ["account-billing", user?.id, limit],
    enabled: !!user && !user.isAnonymous,
    queryFn: async () => {
      const [subscription, charges] = await Promise.all([
        supabase
          .from("account_subscriptions")
          .select(
            "plan,status,interval,amount_minor,currency,provider,period_end,cancel_at_period_end",
          )
          .eq("user_id", user!.id)
          .maybeSingle(),
        supabase
          .from("account_charges")
          .select("id,created_at,paid_at,description,amount_minor,currency,status,receipt_url")
          .eq("user_id", user!.id)
          .order("created_at", { ascending: false })
          .limit(limit),
      ]);
      for (const result of [subscription, charges])
        if (result.error)
          throw new Error("Não foi possível consultar sua assinatura. Tente novamente.");
      return {
        subscription: subscription.data as Subscription | null,
        charges: (charges.data ?? []) as Charge[],
      };
    },
  });
  if (compare)
    return (
      <div>
        <button className="mb-4 text-sm text-primary" onClick={() => setCompare(false)}>
          ← Voltar ao meu plano
        </button>
        <SubscriptionPlans />
      </div>
    );
  const subscription = query.data?.subscription;
  return (
    <div className="space-y-5">
      <UnderlineTabs
        items={[
          { key: "plan", label: "Meu plano" },
          { key: "charges", label: "Cobranças" },
        ]}
        value={tab}
        onChange={setTab}
      />
      {!user || query.isLoading ? (
        <p role="status" className="text-sm text-muted-foreground">
          Consultando sua conta…
        </p>
      ) : query.isError ? (
        <div role="alert" className="space-y-3 text-sm">
          <p>{query.error.message}</p>
          <button className="text-primary" onClick={() => query.refetch()}>
            Tentar novamente
          </button>
        </div>
      ) : tab === "plan" ? (
        <>
          <section className="card-surface space-y-3 p-4">
            <h2 className="text-xl font-bold">
              {subscription
                ? (labels[subscription.plan] ?? subscription.plan)
                : "Sem assinatura registrada"}
            </h2>
            {subscription ? (
              <>
                <p>
                  {labels[subscription.status] ?? subscription.status}
                  {subscription.cancel_at_period_end ? " · Renovação cancelada" : ""}
                </p>
                <p className="text-lg font-semibold">
                  {money(subscription.amount_minor, subscription.currency)} /{" "}
                  {subscription.interval === "year" ? "ano" : "mês"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {subscription.cancel_at_period_end
                    ? "Acesso até"
                    : subscription.status === "active"
                      ? "Próxima renovação"
                      : "Fim do período"}
                  : {date(subscription.period_end)}
                </p>
                <p className="text-sm text-muted-foreground">
                  Contratado por {labels[subscription.provider] ?? subscription.provider}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Nenhum plano contratado foi encontrado para esta conta.
              </p>
            )}
          </section>
          <button
            className="interactive-press w-full rounded-xl border border-border p-3 text-sm text-primary"
            onClick={() => setCompare(true)}
          >
            Conhecer os planos
          </button>
          {subscription?.provider === "apple" ? (
            <a
              className="block text-sm text-primary"
              href="https://apps.apple.com/account/subscriptions"
              target="_blank"
              rel="noreferrer"
            >
              Gerenciar ou cancelar na App Store ↗
            </a>
          ) : subscription?.provider === "google" ? (
            <a
              className="block text-sm text-primary"
              href="https://play.google.com/store/account/subscriptions"
              target="_blank"
              rel="noreferrer"
            >
              Gerenciar ou cancelar no Google Play ↗
            </a>
          ) : (
            <p className="text-sm text-muted-foreground">
              Contratação, alteração de plano e gerenciamento de pagamento ainda não estão
              disponíveis pelo Norte.
            </p>
          )}
        </>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Pagamentos da assinatura Norte.</p>
          {!query.data?.charges.length && (
            <div className="card-surface p-4 text-sm">Nenhuma cobrança registrada.</div>
          )}
          {query.data?.charges.map((charge) => (
            <article key={charge.id} className="card-surface space-y-2 p-4">
              <p className="font-semibold">{charge.description}</p>
              <p>
                {money(charge.amount_minor, charge.currency)} ·{" "}
                {labels[charge.status] ?? charge.status}
              </p>
              <p className="text-xs text-muted-foreground">
                Emitida em {date(charge.created_at)}
                {charge.paid_at ? " · Paga em " + date(charge.paid_at) : ""}
              </p>
              {charge.receipt_url?.startsWith("https://") && (
                <a
                  className="text-sm text-primary"
                  href={charge.receipt_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Ver comprovante ↗
                </a>
              )}
            </article>
          ))}
          {query.data?.charges.length === limit && (
            <button className="text-primary" onClick={() => setLimit(limit + 20)}>
              Carregar mais
            </button>
          )}
          {subscription && subscription.provider !== "web" && (
            <p className="text-xs text-muted-foreground">
              Consulte também o histórico da loja em que contratou sua assinatura.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

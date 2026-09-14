import { useState } from "react";
import { Check, ChevronRight, Compass, Minus } from "lucide-react";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "./ui/drawer";
import "./subscription-plans.css";

type PlanId = "base" | "essential" | "unlimited";
type BillingCycle = "monthly" | "annual";

type Plan = {
  id: PlanId;
  name: string;
  summary: string;
  monthly: string;
  annual: string;
  recommended?: boolean;
  benefits: string[];
};

const plans: Plan[] = [
  {
    id: "base",
    name: "Base",
    summary: "Sem Agente",
    monthly: "9,90",
    annual: "89",
    benefits: [
      "Agenda, planos, rotinas e finanças",
      "Objetivos ativos ilimitados",
      "Histórico completo",
    ],
  },
  {
    id: "essential",
    name: "Essencial",
    summary: "15 interações/mês",
    monthly: "19,90",
    annual: "179",
    recommended: true,
    benefits: [
      "Agenda, planos, rotinas e finanças",
      "Objetivos e histórico ilimitados",
      "15 interações com o Agente por mês",
      "Retrospectiva mensal automática",
    ],
  },
  {
    id: "unlimited",
    name: "Ilimitado",
    summary: "Agente sem teto",
    monthly: "34,90",
    annual: "299",
    benefits: [
      "Agenda, planos, rotinas e finanças",
      "Objetivos e histórico ilimitados",
      "Agente sem limite mensal (uso justo)",
      "Retrospectivas e insights avançados",
      "Exportação de dados e suporte prioritário",
    ],
  },
];

const comparison = [
  ["Aplicativo completo", true, true, true],
  ["Objetivos ativos ilimitados", true, true, true],
  ["Histórico completo", true, true, true],
  ["Agente Norte", false, "15/mês", "Sem teto"],
  ["Retrospectiva automática", false, true, true],
  ["Insights avançados", false, false, true],
  ["Exportação e suporte prioritário", false, false, true],
] as const;

export function SubscriptionPlans() {
  const [billing, setBilling] = useState<BillingCycle>("monthly");
  const [selectedId, setSelectedId] = useState<PlanId>("essential");
  const [compareOpen, setCompareOpen] = useState(false);
  const selected = plans.find((plan) => plan.id === selectedId) ?? plans[1];
  const price = billing === "monthly" ? selected.monthly : selected.annual;
  const period = billing === "monthly" ? "mês" : "ano";

  return (
    <main className="subscription-page">
      <div className="subscription-shell">
        <header className="subscription-header">
          <div className="subscription-brand" aria-label="Norte">
            <span className="subscription-logo">
              <Compass size={21} />
            </span>
            <span>NORTE</span>
          </div>
          <h1>Escolha seu plano.</h1>
          <p>
            O aplicativo completo em todos os planos.
            <br />O que muda é o acesso ao Agente.
          </p>
        </header>

        <div className="subscription-billing" role="tablist" aria-label="Período de cobrança">
          {(["monthly", "annual"] as const).map((cycle) => (
            <button
              key={cycle}
              type="button"
              role="tab"
              aria-selected={billing === cycle}
              className={billing === cycle ? "active" : ""}
              onClick={() => setBilling(cycle)}
            >
              {cycle === "monthly" ? "Mensal" : "Anual"}
            </button>
          ))}
        </div>

        <section className="subscription-options" aria-label="Planos disponíveis">
          {plans.map((plan) => {
            const selectedPlan = selectedId === plan.id;
            const planPrice = billing === "monthly" ? plan.monthly : plan.annual;
            return (
              <button
                key={plan.id}
                type="button"
                className={`subscription-option ${selectedPlan ? "selected" : ""}`}
                aria-pressed={selectedPlan}
                onClick={() => setSelectedId(plan.id)}
              >
                <span className="subscription-radio" aria-hidden="true">
                  {selectedPlan && <Check size={18} strokeWidth={3} />}
                </span>
                <span className="subscription-option-copy">
                  <span className="subscription-plan-line">
                    <strong>{plan.name}</strong>
                    {plan.recommended && <em>RECOMENDADO</em>}
                  </span>
                  <small>{plan.summary}</small>
                </span>
                <span className="subscription-price-separator" aria-hidden="true" />
                <span className="subscription-price">
                  <strong>R$ {planPrice}</strong>
                  <small>/{period}</small>
                </span>
              </button>
            );
          })}
        </section>

        <section className="subscription-benefits" aria-live="polite">
          <h2>Você recebe</h2>
          <div className="subscription-benefit-list">
            {selected.benefits.map((benefit) => (
              <p key={benefit}>
                <span>
                  <Check size={16} strokeWidth={2.5} />
                </span>
                {benefit}
              </p>
            ))}
          </div>
          <button
            type="button"
            className="subscription-compare"
            onClick={() => setCompareOpen(true)}
          >
            Comparar todos os benefícios <ChevronRight size={20} />
          </button>
        </section>

        <div className="subscription-action">
          <button type="button" aria-disabled="true">
            Assinar {selected.name}
          </button>
          <p>
            R$ {price} por {period}
          </p>
        </div>
      </div>

      <Drawer open={compareOpen} onOpenChange={setCompareOpen} shouldScaleBackground={false}>
        <DrawerContent className="subscription-comparison-sheet">
          <div className="subscription-comparison-body">
            <DrawerTitle>Compare os planos</DrawerTitle>
            <DrawerDescription>Veja o que muda no acesso ao Agente Norte.</DrawerDescription>
            <div
              className="subscription-comparison-grid"
              role="table"
              aria-label="Comparação dos planos"
            >
              <div className="comparison-head" role="row">
                <span />
                {plans.map((plan) => (
                  <strong key={plan.id}>{plan.name}</strong>
                ))}
              </div>
              {comparison.map(([feature, ...values]) => (
                <div className="comparison-row" role="row" key={feature}>
                  <span>{feature}</span>
                  {values.map((value, index) => (
                    <span
                      key={`${feature}-${plans[index].id}`}
                      aria-label={`${plans[index].name}: ${String(value)}`}
                    >
                      {value === true ? (
                        <Check size={16} />
                      ) : value === false ? (
                        <Minus size={16} />
                      ) : (
                        value
                      )}
                    </span>
                  ))}
                </div>
              ))}
            </div>
            <button
              type="button"
              className="subscription-close"
              onClick={() => setCompareOpen(false)}
            >
              Fechar
            </button>
          </div>
        </DrawerContent>
      </Drawer>
    </main>
  );
}

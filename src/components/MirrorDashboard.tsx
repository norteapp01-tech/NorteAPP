import { useMemo, useState } from "react";
import { AppMenuButton, UnderlineTabs } from "@/components/ui/app-design-system";
import { todayISO } from "@/lib/goals-store";
import { resolvePeriod, type Period, type PeriodKey } from "@/lib/mirror-analytics";
import { useMirror } from "@/lib/mirror-store";
import { PeriodPicker } from "./mirror/PeriodPicker";
import { MirrorOverview } from "./mirror/MirrorOverview";
import { MirrorAgenda } from "./mirror/MirrorAgenda";
import { MirrorRoutines } from "./mirror/MirrorRoutines";

type View = "geral" | "agenda" | "rotinas";

const SCOPE: Record<PeriodKey, string> = {
  "7d": "nos últimos 7 dias",
  "30d": "nos últimos 30 dias",
  "3m": "nos últimos 3 meses",
  custom: "no período escolhido",
};

/** Espelho: como a pessoa está vivendo a agenda e as rotinas. Três visões,
 * quatro períodos. Os cálculos moram em `lib/mirror-*`. */
export function MirrorDashboard() {
  const today = todayISO();
  const [view, setView] = useState<View>("geral");
  const [key, setKey] = useState<PeriodKey>("7d");
  const [custom, setCustom] = useState<Period>(() => resolvePeriod("30d", today));
  const period = useMemo(
    () => resolvePeriod(key, today, key === "custom" ? custom : undefined),
    [key, today, custom],
  );
  const mirror = useMirror(period, SCOPE[key]);

  return (
    <main className="norte-page mirror-page">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.2em] text-muted-foreground">
            Espelho
          </p>
          <h1 className="norte-page-title mt-2">Sua agenda, com clareza.</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Um reflexo honesto de como você usa seu tempo.
          </p>
        </div>
        <AppMenuButton className="norte-local-global-action" />
      </header>

      <UnderlineTabs
        className="mt-6"
        items={
          [
            { key: "geral", label: "Visão geral" },
            { key: "agenda", label: "Agenda" },
            { key: "rotinas", label: "Rotinas" },
          ] as const
        }
        value={view}
        onChange={setView}
      />

      <div className="mt-4">
        <PeriodPicker
          value={key}
          onChange={setKey}
          custom={period}
          onCustom={setCustom}
          today={today}
        />
      </div>

      <div className="mt-4" aria-live="polite">
        {mirror.status === "loading" && <MirrorSkeleton />}
        {mirror.status === "error" && (
          <section className="card-surface p-5" role="alert">
            <p className="text-sm font-semibold">Não consegui carregar seu Espelho.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Seus dados estão guardados. Verifique a conexão e tente de novo.
            </p>
            <button
              type="button"
              onClick={mirror.retry}
              className="interactive-press mt-3 min-h-10 rounded-full border border-primary/50 px-4 text-sm font-semibold text-primary"
            >
              Tentar de novo
            </button>
          </section>
        )}
        {mirror.status === "ready" && view === "geral" && (
          <MirrorOverview
            current={mirror.current}
            comparison={mirror.comparison}
            insights={mirror.insights}
            recentUnanswered={mirror.recentUnanswered}
            historyMissing={mirror.historyMissing}
            scope={SCOPE[key]}
            onSeeAgenda={() => setView("agenda")}
          />
        )}
        {mirror.status === "ready" && view === "agenda" && (
          <MirrorAgenda
            a={mirror.current}
            comparison={mirror.comparison}
            labels={mirror.labels}
            scope={SCOPE[key]}
          />
        )}
        {mirror.status === "ready" && view === "rotinas" && (
          <MirrorRoutines
            current={mirror.routines.current}
            previous={mirror.routines.previous}
            scope={SCOPE[key]}
          />
        )}
      </div>
    </main>
  );
}

function MirrorSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Carregando o Espelho">
      <div className="card-surface h-44 animate-pulse" />
      <div className="card-surface h-32 animate-pulse" />
      <div className="card-surface h-24 animate-pulse" />
    </div>
  );
}

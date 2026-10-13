import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { UnderlineTabs } from "@/components/ui/app-design-system";
import {
  MIN_BUCKET,
  MIN_GAP,
  formatMinutes,
  untouchedLabels,
  type AgendaAnalysis,
  type Bucket,
  type Comparison,
  type LabelLookup,
} from "@/lib/mirror-analytics";
import { BarRow, Disclosure, EmptyNote, MiniColumns, NEUTRALS, pct } from "./charts";
import { groupName } from "./MirrorOverview";

const DAY_ORDER = ["1", "2", "3", "4", "5", "6", "0"]; // semana começando na segunda
const DAY_SHORT: Record<string, string> = {
  "0": "Dom",
  "1": "Seg",
  "2": "Ter",
  "3": "Qua",
  "4": "Qui",
  "5": "Sex",
  "6": "Sáb",
};

function bestOf(buckets: Bucket[]): string | undefined {
  const ok = buckets.filter((b) => b.done + b.missed >= MIN_BUCKET && b.rate !== null);
  if (ok.length < 2) return undefined;
  const sorted = [...ok].sort((a, b) => b.rate! - a.rate!);
  return sorted[0].rate! - sorted[sorted.length - 1].rate! >= MIN_GAP / 100
    ? sorted[0].key
    : undefined;
}

const asColumns = (buckets: Bucket[]) =>
  buckets.map((b) => {
    const n = b.done + b.missed;
    return {
      key: b.key,
      label: b.label,
      value: n >= MIN_BUCKET ? b.rate : null,
      sub: n ? `${n}` : "",
    };
  });

export function MirrorAgenda({
  a,
  comparison,
  labels,
  scope,
}: {
  a: AgendaAnalysis;
  comparison: Comparison;
  labels: LabelLookup[];
  scope: string;
}) {
  const [by, setBy] = useState<"rotulo" | "categoria">("rotulo");
  if (a.sufficiency === "none")
    return (
      <section className="card-surface p-5">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Sem compromissos encerrados {scope}. Compromissos futuros não entram nas contas.
        </p>
      </section>
    );

  const groups = (by === "rotulo" ? a.byLabel : a.byCategory).filter(
    (g) => g.minutes > 0 || g.done + g.missed + g.cancelled > 0,
  );
  const maxMinutes = Math.max(1, ...groups.map((g) => g.minutes));
  const untouched = untouchedLabels(a, labels);
  const weekdayColumns = DAY_ORDER.map((k) => a.weekday.find((b) => b.key === k)!).map((b) => ({
    ...b,
    label: DAY_SHORT[b.key],
  }));
  const worstDay = [...a.daysStat].sort((x, y) => y.busy - x.busy)[0];
  const feelingGroups = (by === "rotulo" ? a.byLabel : a.byCategory).filter(
    (g) => g.feeling.leve + g.feeling.neutro + g.feeling.pesado > 0,
  );

  return (
    <div className="card-surface divide-y divide-border px-5">
      <Disclosure
        title="Para onde o tempo foi"
        subtitle={`${formatMinutes(a.time.unionMinutes)} planejados · duração planejada, não tempo real`}
        defaultOpen
      >
        <UnderlineTabs
          items={
            [
              { key: "rotulo", label: "Por rótulo" },
              { key: "categoria", label: "Por categoria" },
            ] as const
          }
          value={by}
          onChange={setBy}
        />
        {groups.length === 0 ? (
          <EmptyNote>Nenhum compromisso com horário no período.</EmptyNote>
        ) : (
          <div className="mt-2 divide-y divide-border/60">
            {groups.map((g, i) => (
              <BarRow
                key={g.key}
                name={groupName(g.key, g.name)}
                value={formatMinutes(g.minutes)}
                fraction={g.minutes / maxMinutes}
                color={g.color ?? NEUTRALS[i % NEUTRALS.length]}
                detail={`${pct(g.share)} do tempo · ${g.done} ${g.done === 1 ? "concluído" : "concluídos"}${g.missed ? ` · ${g.missed} ${g.missed === 1 ? "não realizado" : "não realizados"}` : ""}${g.cancelled ? ` · ${g.cancelled} ${g.cancelled === 1 ? "cancelado" : "cancelados"}` : ""}`}
              />
            ))}
          </div>
        )}
        {a.time.overlapMinutes > 0 && (
          <p className="mt-3 text-[11px] text-muted-foreground">
            {formatMinutes(a.time.overlapMinutes)} estavam sobrepostos e foram contados uma vez só.
          </p>
        )}
        {a.untimedCount > 0 && (
          <p className="mt-1 text-[11px] text-muted-foreground">
            {a.untimedCount}{" "}
            {a.untimedCount === 1
              ? "compromisso de dia inteiro não entra"
              : "compromissos de dia inteiro não entram"}{" "}
            nas horas.
          </p>
        )}
        {untouched.length > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            Sem nenhum compromisso no período:{" "}
            <span className="text-foreground">{untouched.map((l) => l.name).join(", ")}</span>.
          </p>
        )}
      </Disclosure>

      <Disclosure
        title="Planejado × realizado"
        subtitle="Quanto do tempo planejado virou compromisso concluído"
      >
        {a.time.doneShare === null ? (
          <EmptyNote>Sem compromissos com horário para comparar.</EmptyNote>
        ) : (
          <>
            <BarRow
              name="Concluído do planejado"
              value={`${formatMinutes(a.time.doneUnionMinutes)} de ${formatMinutes(a.time.unionMinutes)}`}
              fraction={a.time.doneShare}
              detail={`Duração planejada dos concluídos: ${pct(a.time.doneShare)} do tempo planejado. O app não mede o tempo real gasto — só o que foi marcado como concluído.`}
            />
            {comparison.comparable && (
              <p className="mt-2 text-xs text-muted-foreground">
                {comparison.minutesDelta === 0
                  ? "Mesmo volume de tempo planejado do período anterior."
                  : `${formatMinutes(Math.abs(comparison.minutesDelta))} ${comparison.minutesDelta > 0 ? "a mais" : "a menos"} planejados que no período anterior.`}
              </p>
            )}
          </>
        )}
      </Disclosure>

      <Disclosure title="O que mais concluo e o que escapa">
        <p className="text-xs font-semibold text-muted-foreground">Mais concluídos</p>
        {a.topDone.length ? (
          <ul className="mt-1 divide-y divide-border/60">
            {a.topDone.map((t) => (
              <li key={t.key} className="flex justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 truncate">{t.title}</span>
                <b className="tabular-nums">{t.done}×</b>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyNote>Nenhum compromisso concluído mais de uma vez.</EmptyNote>
        )}
        <p className="mt-4 text-xs font-semibold text-muted-foreground">
          Mais adiados, cancelados ou deixados passar
        </p>
        {a.topTroubled.length ? (
          <ul className="mt-1 divide-y divide-border/60">
            {a.topTroubled.map((t) => (
              <li key={t.key} className="py-2 text-sm">
                <span className="block truncate">{t.title}</span>
                <span className="text-[11px] text-muted-foreground">
                  {[
                    t.moves ? `${t.moves}× reagendado` : "",
                    t.missed ? `${t.missed}× não realizado` : "",
                    t.cancelled ? `${t.cancelled}× cancelado` : "",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyNote>Nada se repetiu o bastante para destacar.</EmptyNote>
        )}
      </Disclosure>

      <Disclosure title="Dias e horários" subtitle="Quando você mais cumpre o que marca">
        <p className="text-xs font-semibold text-muted-foreground">Por dia da semana</p>
        <div className="mt-2">
          <MiniColumns
            label="Taxa de realização por dia da semana"
            items={asColumns(weekdayColumns)}
            highlight={bestOf(a.weekday)}
          />
        </div>
        <p className="mt-5 text-xs font-semibold text-muted-foreground">Por turno</p>
        <div className="mt-2">
          <MiniColumns
            label="Taxa de realização por turno"
            items={asColumns(a.timeOfDay).map((c) => ({
              ...c,
              label: c.label.replace("pela ", "").replace("à ", "").replace("de ", ""),
            }))}
            highlight={bestOf(a.timeOfDay)}
          />
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Colunas vazias têm menos de {MIN_BUCKET} compromissos: pouco para concluir algo. O número
          embaixo é a quantidade.
        </p>
      </Disclosure>

      <Disclosure
        title="Carga da agenda"
        subtitle={
          a.overloadedDays
            ? `${a.overloadedDays} ${a.overloadedDays === 1 ? "dia cheio" : "dias cheios"} · ${a.conflictPairs} sobreposições`
            : "Nenhum dia sobrecarregado"
        }
      >
        {a.averageLoad === null ? (
          <EmptyNote>Sem compromissos com horário no período.</EmptyNote>
        ) : (
          <>
            <BarRow
              name="Ocupação média"
              value={pct(a.averageLoad)}
              fraction={a.averageLoad}
              detail="Dos dias com compromissos, em relação ao seu dia habitual (configurações da Agenda)."
            />
            {worstDay && worstDay.busy > 0 && (
              <Link
                to="/agenda"
                search={{ date: worstDay.date }}
                className="mt-3 inline-block text-xs text-primary"
              >
                Abrir o dia mais cheio ({formatMinutes(worstDay.busy)})
              </Link>
            )}
          </>
        )}
      </Disclosure>

      <Disclosure title="Consistência" subtitle="Taxa de realização ao longo do período">
        <MiniColumns
          label="Taxa de realização por semana"
          items={a.weeks.map((w, i) => ({
            key: w.start,
            label: a.days <= 14 ? w.start.slice(8) : `S${i + 1}`,
            value: w.done + w.missed > 0 ? w.rate : null,
            sub: w.done + w.missed ? `${w.done + w.missed}` : "",
          }))}
        />
      </Disclosure>

      <Disclosure
        title="Reagendamentos"
        subtitle={`${a.reschedules} mudanças em ${a.rescheduledCommitments} compromissos`}
      >
        {a.movedCommitments.length === 0 ? (
          <EmptyNote>Nenhuma mudança de horário no período.</EmptyNote>
        ) : (
          <ul className="divide-y divide-border/60">
            {a.movedCommitments.slice(0, 6).map((m) => (
              <li key={m.key} className="flex justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 truncate">{m.title}</span>
                <b className="tabular-nums">{m.moves}×</b>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[11px] text-muted-foreground">
          Recorrências que mudam toda hora são boas candidatas a um novo horário.
        </p>
      </Disclosure>

      {a.feeling.answered > 0 && (
        <Disclosure title="Como foi" subtitle={`${a.feeling.answered} respostas suas`}>
          <ul className="divide-y divide-border/60">
            {feelingGroups.map((g) => (
              <li key={g.key} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 truncate">{groupName(g.key, g.name)}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {g.feeling.leve} leve · {g.feeling.neutro} neutro · {g.feeling.pesado} pesado
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Só entra o que você respondeu. Sem resposta não vira “leve” nem “pesado”.
          </p>
        </Disclosure>
      )}
    </div>
  );
}

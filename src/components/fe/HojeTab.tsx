import { useState } from "react";
import { HandHeart, BookOpenCheck, PenLine } from "lucide-react";
import {
  useGoalsStore,
  completeExecution,
  rescheduleExecution,
  addDays,
  toISODate,
} from "@/lib/goals-store";
import {
  useFeStore,
  nextSpiritualMoment,
  activePurpose,
  weeklyRhythm,
  type WeeklyRhythm,
} from "@/lib/fe-store";
import { Card } from "@/components/sub-agenda-shared";
import { VerseOfDayCard } from "./VerseOfDayCard";
import { PrayNowFlow } from "./PrayNowFlow";
import { NotebookEntryEditor } from "./NotebookEntryEditor";

const dimensionLabels: { key: keyof WeeklyRhythm; label: string }[] = [
  { key: "oracao", label: "Oração" },
  { key: "palavra", label: "Palavra" },
  { key: "comunhao", label: "Comunhão" },
  { key: "reflexao", label: "Reflexão" },
];

function daysElapsedThisWeek(): number {
  const day = new Date().getDay();
  return day === 0 ? 7 : day;
}

export function HojeTab({ onOpenLogReading }: { onOpenLogReading: () => void }) {
  const state = useFeStore((s) => s);
  const executions = useGoalsStore((s) => s.executions);
  const [praying, setPraying] = useState(false);
  const [writingReflection, setWritingReflection] = useState(false);

  const next = nextSpiritualMoment(state.spiritualActivities, executions);
  const purpose = activePurpose(state.purposes);
  const rhythm = weeklyRhythm(state, executions);
  const elapsed = daysElapsedThisWeek();

  return (
    <div className="space-y-5">
      <VerseOfDayCard />

      <Card title="Seu momento">
        <div className="grid grid-cols-3 gap-2">
          <MomentButton icon={HandHeart} label="Orar" onClick={() => setPraying(true)} />
          <MomentButton icon={BookOpenCheck} label="Registrar leitura" onClick={onOpenLogReading} />
          <MomentButton
            icon={PenLine}
            label="Escrever reflexão"
            onClick={() => setWritingReflection(true)}
          />
        </div>
      </Card>

      {next && (
        <Card title="Próximo">
          <p className="font-mono text-2xl font-bold text-primary">{next.execution.startTime}</p>
          <p className="mt-1 text-sm font-semibold">{next.execution.title}</p>
          {next.activity.durationMinutes && (
            <p className="text-xs text-muted-foreground">{next.activity.durationMinutes} min</p>
          )}
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={async () => {
                await completeExecution(next.execution.id);
              }}
              className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
            >
              Começar agora
            </button>
            <button
              onClick={async () => {
                await rescheduleExecution(
                  next.execution.id,
                  toISODate(addDays(new Date(), 1)),
                  next.execution.startTime ?? "09:00",
                );
              }}
              className="text-xs text-muted-foreground"
            >
              reagendar
            </button>
          </div>
        </Card>
      )}

      {purpose && (
        <Card title="Propósito atual">
          <p className="text-sm font-bold">{purpose.title}</p>
          <p className="mt-1 text-sm italic text-muted-foreground">"{purpose.intention}"</p>
        </Card>
      )}

      <Card title="Esta semana">
        <ul className="space-y-2.5">
          {dimensionLabels.map(({ key, label }) => (
            <li key={key} className="flex items-center justify-between">
              <span className="text-sm font-medium">{label}</span>
              <div className="flex gap-1">
                {Array.from({ length: elapsed }).map((_, i) => {
                  const date = toISODate(addDays(new Date(), i - (elapsed - 1)));
                  const filled = rhythm[key].includes(date);
                  return (
                    <span
                      key={i}
                      className={`h-2 w-2 rounded-full ${filled ? "bg-primary" : "bg-surface-2"}`}
                    />
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {praying && <PrayNowFlow onClose={() => setPraying(false)} />}
      {writingReflection && (
        <NotebookEntryEditor type="livre" onClose={() => setWritingReflection(false)} />
      )}
    </div>
  );
}

function MomentButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof HandHeart;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 rounded-xl bg-surface-2 py-4"
    >
      <Icon className="h-5 w-5 text-primary" />
      <span className="text-center text-[11px] font-medium leading-tight">{label}</span>
    </button>
  );
}

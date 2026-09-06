import { DateField } from "@/components/ui/date-wheel-picker";

export type ScheduleValue = { date: string; startTime: string; endTime: string };

/** Dia + início + término — mesmo trio repetido em vários fluxos de agenda do
 * plano (agendar/reagendar execução, colocar etapa na agenda, nova execução).
 * Extraído aqui pra não duplicar o JSX a cada novo lugar que precisa disso;
 * a mutação (scheduleExecution/rescheduleExecution/scheduleStepAsExecution)
 * continua sendo responsabilidade de quem usa o componente. */
export function ScheduleFields({
  value,
  onChange,
  disabled,
  size = "sm",
}: {
  value: ScheduleValue;
  onChange: (next: ScheduleValue) => void;
  disabled?: boolean;
  /** "sm" = formulários compactos dentro de cards; "md" = dentro de modais. */
  size?: "sm" | "md";
}) {
  const fieldCls =
    size === "md"
      ? "rounded-lg border border-border bg-surface px-3 py-2 text-xs outline-none focus:border-primary"
      : "rounded-md border border-border bg-surface px-1.5 py-1 text-[10px] outline-none focus:border-primary";
  const labelCls =
    size === "md"
      ? "mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground"
      : "mb-0.5 block text-[9px] uppercase tracking-wider text-muted-foreground";

  return (
    <div className={`flex flex-wrap items-end gap-1.5 ${size === "md" ? "gap-2" : ""}`}>
      <DateField
        label="Dia"
        value={value.date}
        onChange={(v) => onChange({ ...value, date: v })}
        className={`flex items-center gap-1 text-left ${fieldCls}`}
      />
      <label className="block">
        <span className={labelCls}>Início</span>
        <input
          type="time"
          disabled={disabled}
          value={value.startTime}
          onChange={(e) => onChange({ ...value, startTime: e.target.value })}
          className={fieldCls}
        />
      </label>
      <label className="block">
        <span className={labelCls}>Término</span>
        <input
          type="time"
          disabled={disabled}
          value={value.endTime}
          onChange={(e) => onChange({ ...value, endTime: e.target.value })}
          className={fieldCls}
        />
      </label>
    </div>
  );
}

export function scheduleTimesValid(value: ScheduleValue): boolean {
  return !!value.startTime && !!value.endTime && value.endTime > value.startTime;
}

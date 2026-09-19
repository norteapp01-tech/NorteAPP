import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Ellipsis } from "lucide-react";
import { cn } from "@/lib/utils";
import { nowDate } from "@/lib/test-clock";
import { officialWeek } from "@/components/ui/app-design-system-data";

export function AppMenuButton({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label="Mais opções"
      className={cn(
        "interactive-press grid h-11 w-11 shrink-0 place-items-center text-muted-foreground hover:text-foreground",
        className,
      )}
      {...props}
    >
      <Ellipsis className="h-5 w-5" />
    </button>
  );
}

export function UnderlineTabs<T extends string>({
  items,
  value,
  onChange,
  className,
}: {
  items: readonly { key: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  // As abas são `flex-1`, então todas têm a mesma largura e a posição do
  // sublinhado sai direto do índice — sem medir o DOM. Antes era um <span>
  // montado dentro da aba ativa, o que fazia o verde sumir de um lado e
  // aparecer no outro em vez de percorrer o caminho.
  const activeIndex = Math.max(
    0,
    items.findIndex((item) => item.key === value),
  );
  const slotWidth = 100 / Math.max(1, items.length);

  return (
    <div className={cn("relative flex border-b border-border", className)} role="tablist">
      {items.map((item) => {
        const active = item.key === value;
        return (
          <button
            key={item.key}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.key)}
            className={cn(
              "interactive-press relative h-[52px] flex-1 px-2 text-[13px] font-semibold transition-colors",
              active ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {item.label}
          </button>
        );
      })}
      <span
        aria-hidden
        className="absolute bottom-0 h-0.5 bg-primary transition-[left] duration-(--dur-tab) ease-(--ease-out)"
        style={{ width: `${slotWidth}%`, left: `${activeIndex * slotWidth}%` }}
      />
    </div>
  );
}

export function WeekdaySelector({
  items = officialWeek,
  selectedDay,
  currentDay = nowDate().getDay(),
  onSelect,
  primary,
  secondary,
  completed,
}: {
  items?: readonly { day: number; label: string }[];
  selectedDay?: number;
  currentDay?: number;
  onSelect: (day: number) => void;
  primary: (day: number) => ReactNode;
  secondary?: (day: number) => ReactNode;
  completed?: (day: number) => boolean;
}) {
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {items.map(({ day, label }) => {
        const current = day === currentDay;
        const selected = day === selectedDay;
        return (
          <button
            key={day}
            onClick={() => onSelect(day)}
            aria-pressed={selected}
            aria-current={current ? "date" : undefined}
            data-completed={completed?.(day) || undefined}
            className={cn(
              // Selecionado e "hoje" eram desenhados igual, então numa semana
              // em que você escolhe outro dia apareciam dois chips idênticos
              // destacados e nenhum indicava qual estava aberto. Agora a
              // seleção é preenchida e hoje fica só com a borda marcada.
              "interactive-press min-w-0 rounded-lg border p-2 text-center transition-colors hover:bg-surface",
              selected
                ? "border-primary bg-primary/15"
                : current
                  ? "border-primary/40 bg-surface-2"
                  : "border-transparent bg-surface-2",
            )}
          >
            <span
              className={cn(
                "block text-[10px]",
                current && !selected ? "text-primary" : "text-muted-foreground",
              )}
            >
              {label}
            </span>
            <strong className="mt-1 block truncate text-lg leading-none">{primary(day)}</strong>
            {secondary && (
              <span className="mt-1 block truncate text-[9px] text-muted-foreground">
                {secondary(day)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

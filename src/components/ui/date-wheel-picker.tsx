import { useEffect, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { Modal } from "@/components/ui/modal";

/**
 * Seletor de data mobile-first: 3 colunas roláveis (Dia/Mês/Ano), sem teclado.
 * Deliberadamente independente de goals-store.ts — é usado em qualquer domínio
 * do app, não só no fluxo Plano→Etapa→Execução→Agenda.
 */

const MONTH_NAMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** "YYYY-MM-DD" -> {y,m,d} por split de string — nunca passa por `Date`/UTC. */
export function parseISO(iso: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

export function toISO(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function formatBR(iso: string): string {
  const p = parseISO(iso);
  if (!p) return "";
  return `${pad(p.d)}/${pad(p.m)}/${p.y}`;
}

/** Dias no mês (1-indexado) — cobre fevereiro/ano bissexto de graça via Date nativo. */
export function daysInMonth(year: number, month1: number): number {
  return new Date(year, month1, 0).getDate();
}

function todayParts() {
  const d = new Date();
  return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() };
}

function isBeforeISO(a: string, b: string): boolean {
  return a < b; // "YYYY-MM-DD" compara lexicograficamente igual a data
}

const ITEM_HEIGHT = 40;
const VISIBLE_COUNT = 5;
const PAD_COUNT = Math.floor(VISIBLE_COUNT / 2);

function WheelColumn({
  options,
  selectedIndex,
  onSelect,
  ariaLabel,
}: {
  options: { value: number; label: string }[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const scrollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sincroniza a rolagem quando o índice muda por fora (ex.: dia clampado ao trocar mês).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const target = selectedIndex * ITEM_HEIGHT;
    if (Math.abs(el.scrollTop - target) > 1) {
      el.scrollTo({ top: target, behavior: "auto" });
    }
  }, [selectedIndex, options.length]);

  const handleScroll = () => {
    if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
    scrollTimeout.current = setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      const idx = Math.round(el.scrollTop / ITEM_HEIGHT);
      const clamped = Math.max(0, Math.min(options.length - 1, idx));
      if (clamped !== selectedIndex) onSelect(clamped);
    }, 100);
  };

  return (
    <div
      ref={ref}
      onScroll={handleScroll}
      role="listbox"
      aria-label={ariaLabel}
      className="no-scrollbar h-[200px] flex-1 snap-y snap-mandatory overflow-y-auto overscroll-contain"
      style={{ paddingTop: ITEM_HEIGHT * PAD_COUNT, paddingBottom: ITEM_HEIGHT * PAD_COUNT }}
    >
      {options.map((opt, i) => (
        <button
          key={opt.value}
          type="button"
          role="option"
          aria-selected={i === selectedIndex}
          onClick={() => onSelect(i)}
          className={`flex w-full snap-center items-center justify-center text-base transition-colors ${
            i === selectedIndex ? "font-bold text-primary" : "text-muted-foreground/60"
          }`}
          style={{ height: ITEM_HEIGHT }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function DateWheelPickerModal({
  initialISO,
  minISO,
  onCancel,
  onConfirm,
}: {
  initialISO: string;
  minISO?: string;
  onCancel: () => void;
  onConfirm: (iso: string) => void;
}) {
  const initial = parseISO(initialISO) ?? todayParts();
  const [year, setYear] = useState(initial.y);
  const [month, setMonth] = useState(initial.m);
  const [day, setDay] = useState(initial.d);
  const [error, setError] = useState("");

  const maxDay = daysInMonth(year, month);
  const clampedDay = Math.min(day, maxDay);

  const today = todayParts();
  const startYear = Math.min(year, today.y) - 3;
  const endYear = Math.max(year, today.y) + 15;
  const yearOptions = Array.from({ length: endYear - startYear + 1 }, (_, i) => ({
    value: startYear + i,
    label: String(startYear + i),
  }));
  const monthOptions = MONTH_NAMES.map((label, i) => ({ value: i + 1, label }));
  const dayOptions = Array.from({ length: maxDay }, (_, i) => ({
    value: i + 1,
    label: pad(i + 1),
  }));

  const confirm = () => {
    const iso = toISO(year, month, clampedDay);
    if (minISO && isBeforeISO(iso, minISO)) {
      setError(`Essa data não pode ser antes de ${formatBR(minISO)}.`);
      return;
    }
    onConfirm(iso);
  };

  return (
    <Modal
      onClose={onCancel}
      title="Selecionar data"
      footer={
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl border border-border bg-surface py-3 text-sm font-semibold text-muted-foreground"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirm}
            className="flex-1 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground"
          >
            Confirmar
          </button>
        </div>
      }
    >
      <div className="relative">
        <div
          className="pointer-events-none absolute inset-x-0 top-1/2 h-10 -translate-y-1/2 rounded-xl border border-primary/30 bg-primary/5"
          aria-hidden
        />
        <div className="flex gap-1">
          <WheelColumn
            ariaLabel="Dia"
            options={dayOptions}
            selectedIndex={clampedDay - 1}
            onSelect={(i) => setDay(i + 1)}
          />
          <WheelColumn
            ariaLabel="Mês"
            options={monthOptions}
            selectedIndex={month - 1}
            onSelect={(i) => setMonth(i + 1)}
          />
          <WheelColumn
            ariaLabel="Ano"
            options={yearOptions}
            selectedIndex={year - startYear}
            onSelect={(i) => setYear(startYear + i)}
          />
        </div>
      </div>
      {error && <p className="mt-3 text-center text-[11px] text-danger">{error}</p>}
    </Modal>
  );
}

export function DateField({
  label,
  value,
  onChange,
  minISO,
  placeholder = "Selecionar data",
  className,
}: {
  label?: string;
  value: string;
  onChange: (iso: string) => void;
  minISO?: string;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  const field = (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className={
        className ??
        "flex w-full items-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-left text-sm outline-none focus:border-primary"
      }
    >
      <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className={value ? "" : "text-muted-foreground"}>
        {value ? formatBR(value) : placeholder}
      </span>
    </button>
  );

  return (
    <>
      {label ? (
        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
          {field}
        </label>
      ) : (
        field
      )}
      {open && (
        <DateWheelPickerModal
          initialISO={value}
          minISO={minISO}
          onCancel={() => setOpen(false)}
          onConfirm={(iso) => {
            onChange(iso);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

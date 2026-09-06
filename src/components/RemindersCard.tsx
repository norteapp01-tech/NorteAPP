import { useEffect, useRef, useState } from "react";
import { Bell, Check, ChevronRight, Pencil, Plus, Trash2, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { DateField } from "@/components/ui/date-wheel-picker";
import {
  useRemindersStore,
  highlightedReminders,
  overdueReminders,
  todayReminders,
  upcomingReminders,
  recentlyCompletedReminders,
  reminderStatus,
  formatRelativeDate,
  createReminder,
  toggleReminder,
  updateReminder,
  removeReminder,
  type Reminder,
} from "@/lib/reminders-store";

const ROTATE_MS = 9000;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function RemindersCard({ compact = false }: { compact?: boolean }) {
  const reminders = useRemindersStore((r) => r);
  const highlighted = highlightedReminders(reminders);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Assinatura estável do conjunto em destaque — o efeito só reinicia quando os
  // IDs realmente mudam, não a cada re-render alheio da tela Hoje.
  const signature = highlighted.map((r) => r.id).join(",");

  useEffect(() => {
    setIndex(0);
  }, [signature]);

  useEffect(() => {
    if (highlighted.length <= 1 || paused || prefersReducedMotion()) return;
    const id = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIndex((i) => (i + 1) % highlighted.length);
        setVisible(true);
      }, 200);
    }, ROTATE_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, paused]);

  const pauseThenResume = () => {
    setPaused(true);
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => setPaused(false), 6000);
  };

  const current = highlighted[Math.min(index, highlighted.length - 1)];
  const isOverdue = current ? reminderStatus(current) === "atrasado" : false;

  if (compact) {
    return (
      <>
        <button
          onFocus={pauseThenResume}
          onPointerDown={pauseThenResume}
          onClick={() => setShowModal(true)}
          className="flex min-w-0 flex-1 flex-col items-start rounded-xl border border-border bg-surface p-3.5 text-left"
        >
          <span className="flex w-full items-center justify-between gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Bell className="h-3.5 w-3.5 text-warning" /> Lembrete
            </span>
            <ChevronRight className="h-3.5 w-3.5 shrink-0" />
          </span>
          {current ? (
            <span
              className={`mt-2 block w-full min-w-0 transition-opacity duration-200 ${visible ? "opacity-100" : "opacity-0"}`}
            >
              <span className="block truncate text-sm font-semibold">{current.text}</span>
              <span
                className={`block text-[11px] ${isOverdue ? "text-danger" : "text-muted-foreground"}`}
              >
                {isOverdue ? "Atrasado" : formatRelativeDate(current.date)}
              </span>
            </span>
          ) : (
            <span className="mt-2 block text-[11px] text-muted-foreground">
              Nenhum lembrete para hoje
            </span>
          )}
        </button>
        {showModal && <RemindersModal onClose={() => setShowModal(false)} />}
      </>
    );
  }

  return (
    <section
      onFocus={pauseThenResume}
      onPointerDown={pauseThenResume}
      className="mt-4 flex items-start gap-3 rounded-xl border border-border bg-surface px-4 py-3.5"
    >
      <Bell className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-muted-foreground">Lembretes</span>
          <div className="flex items-center gap-2">
            {highlighted.length > 0 && (
              <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                {highlighted.length}
              </span>
            )}
            <button
              onClick={() => setShowQuickAdd(true)}
              aria-label="Adicionar lembrete"
              className="text-muted-foreground hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {current ? (
          <button
            onClick={() => setShowModal(true)}
            className={`mt-1.5 block w-full text-left transition-opacity duration-200 ${visible ? "opacity-100" : "opacity-0"}`}
          >
            <p className="truncate text-sm font-medium">{current.text}</p>
            <p className={`text-[11px] ${isOverdue ? "text-danger" : "text-muted-foreground"}`}>
              {isOverdue ? "Atrasado" : formatRelativeDate(current.date)}
            </p>
          </button>
        ) : (
          <div className="mt-1.5">
            <p className="text-sm text-muted-foreground">Nenhum lembrete para hoje</p>
            <button
              onClick={() => setShowQuickAdd(true)}
              className="mt-1 text-[11px] font-semibold text-primary"
            >
              Adicionar lembrete
            </button>
          </div>
        )}

        <div className="mt-2 flex items-center justify-between">
          {highlighted.length > 1 ? (
            <div className="flex items-center gap-1">
              {highlighted.map((r, i) => (
                <button
                  key={r.id}
                  onClick={() => {
                    setIndex(i);
                    pauseThenResume();
                  }}
                  aria-label={`Ver lembrete ${i + 1} de ${highlighted.length}`}
                  className={`h-1.5 rounded-full transition-all ${i === index ? "w-3 bg-primary" : "w-1.5 bg-surface-2"}`}
                />
              ))}
            </div>
          ) : (
            <span />
          )}
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-0.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
          >
            ver todos <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      </div>

      {showQuickAdd && <QuickAddReminderModal onClose={() => setShowQuickAdd(false)} />}
      {showModal && <RemindersModal onClose={() => setShowModal(false)} />}
    </section>
  );
}

function QuickAddReminderModal({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState("");
  const [date, setDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (!text.trim() || !date || saving) return;
    setSaving(true);
    setError("");
    try {
      await createReminder({ text: text.trim(), date });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar. Tente de novo.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} title="Novo lembrete">
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">
            Lembrete
          </span>
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder='Ex: "Ligar pro dentista"'
            className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-primary"
          />
        </label>
        <DateField label="Data" value={date} onChange={setDate} />
        {error && <p className="text-[11px] text-danger">{error}</p>}
        <button
          disabled={!text.trim() || !date || saving}
          onClick={save}
          className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40"
        >
          {saving ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </Modal>
  );
}

function RemindersModal({ onClose }: { onClose: () => void }) {
  const reminders = useRemindersStore((r) => r);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const overdue = overdueReminders(reminders);
  const today = todayReminders(reminders);
  const upcoming = upcomingReminders(reminders);
  const completed = recentlyCompletedReminders(reminders);

  return (
    <Modal onClose={onClose} title="Lembretes">
      <div className="space-y-5">
        <button
          onClick={() => setShowQuickAdd(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2.5 text-sm font-semibold text-primary hover:border-primary/40"
        >
          <Plus className="h-4 w-4" /> Adicionar lembrete
        </button>

        <ReminderSection title="Atrasados" items={overdue} emphasis="danger" />
        <ReminderSection title="Hoje" items={today} emphasis="primary" />
        <ReminderSection title="Próximos" items={upcoming} emphasis="muted" />
        <ReminderSection title="Concluídos recentes" items={completed} emphasis="muted" />

        {reminders.length === 0 && (
          <p className="text-center text-sm text-muted-foreground">Nenhum lembrete ainda.</p>
        )}
      </div>
      {showQuickAdd && <QuickAddReminderModal onClose={() => setShowQuickAdd(false)} />}
    </Modal>
  );
}

function ReminderSection({
  title,
  items,
  emphasis,
}: {
  title: string;
  items: Reminder[];
  emphasis: "danger" | "primary" | "muted";
}) {
  if (items.length === 0) return null;
  const tone =
    emphasis === "danger"
      ? "text-danger"
      : emphasis === "primary"
        ? "text-primary"
        : "text-muted-foreground";
  return (
    <div>
      <p className={`text-[11px] font-bold uppercase tracking-wider ${tone}`}>
        {title} ({items.length})
      </p>
      <div className="mt-2 space-y-1.5">
        {items.map((r) => (
          <ReminderRow key={r.id} reminder={r} />
        ))}
      </div>
    </div>
  );
}

function ReminderRow({ reminder: r }: { reminder: Reminder }) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(r.text);
  const [editDate, setEditDate] = useState(r.date);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <div className="rounded-lg border border-border bg-surface-2 p-2.5">
        <input
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-primary"
        />
        <div className="mt-1.5">
          <DateField value={editDate} onChange={setEditDate} />
        </div>
        <div className="mt-1.5 flex gap-1.5">
          <button
            disabled={busy || !editText.trim() || !editDate}
            onClick={() =>
              run(async () => {
                await updateReminder(r.id, { text: editText.trim(), date: editDate });
                setEditing(false);
              })
            }
            className="rounded-md bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground disabled:opacity-50"
          >
            salvar
          </button>
          <button
            onClick={() => {
              setEditText(r.text);
              setEditDate(r.date);
              setEditing(false);
            }}
            className="text-[11px] text-muted-foreground"
          >
            cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 p-2.5">
      <button
        disabled={busy}
        onClick={() => run(() => toggleReminder(r.id, r.done))}
        aria-label={r.done ? "Reabrir lembrete" : "Concluir lembrete"}
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border disabled:opacity-50 ${r.done ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface"}`}
      >
        {r.done && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
      </button>
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm ${r.done ? "text-muted-foreground line-through" : ""}`}>
          {r.text}
        </p>
        <p className="text-[10px] text-muted-foreground">{formatRelativeDate(r.date)}</p>
      </div>
      {!r.done && (
        <button
          onClick={() => setEditing(true)}
          aria-label="Editar lembrete"
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
      {!confirmDelete ? (
        <button
          onClick={() => setConfirmDelete(true)}
          aria-label="Excluir lembrete"
          className="shrink-0 text-muted-foreground hover:text-danger"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      ) : (
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => run(() => removeReminder(r.id))}
            className="rounded-md bg-danger px-1.5 py-1 text-[10px] font-semibold text-white"
          >
            excluir
          </button>
          <button
            onClick={() => setConfirmDelete(false)}
            className="text-[10px] text-muted-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}

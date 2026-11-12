import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { InlineError } from "@/components/ui/inline-error";
import { todayISO } from "@/lib/goals-store";
import {
  REFLECTIONS_KEY,
  addReflection,
  deleteReflection,
  fetchReflections,
} from "@/lib/habits/store";
import { useSupabaseUserId } from "@/lib/supabase/client";
import type { Habit, Reflection } from "@/lib/habits/types";

const MOODS: { value: NonNullable<Reflection["mood"]>; label: string }[] = [
  { value: "muito_bem", label: "Muito bem" },
  { value: "bem", label: "Bem" },
  { value: "neutro", label: "Neutro" },
  { value: "dificil", label: "Difícil" },
  { value: "muito_dificil", label: "Muito difícil" },
];

/** Reflexões: um espaço leve para dizer como foi o dia ou uma rotina. Opcional. */
export function ReflectionsSheet({ habits, onClose }: { habits: Habit[]; onClose: () => void }) {
  const userId = useSupabaseUserId();
  const [mood, setMood] = useState<Reflection["mood"] | undefined>();
  const [note, setNote] = useState("");
  const [habitId, setHabitId] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const q = useInfiniteQuery({
    queryKey: [...REFLECTIONS_KEY, search],
    queryFn: ({ pageParam }) => fetchReflections(search, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.length : undefined),
    enabled: !!userId,
  });
  const rows = q.data?.pages.flatMap((p) => p.rows) ?? [];
  const nameOf = (id?: string) => habits.find((h) => h.id === id)?.name;

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await addReflection({ localDate: todayISO(), habitId: habitId || undefined, mood, note });
      setNote("");
      setMood(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} title="Reflexões">
      <div className="space-y-5">
        <section className="space-y-3" aria-label="Nova reflexão">
          <div role="group" aria-label="Como foi o dia" className="flex flex-wrap gap-2">
            {MOODS.map((m) => (
              <button
                key={m.value}
                type="button"
                aria-pressed={mood === m.value}
                onClick={() => setMood((cur) => (cur === m.value ? undefined : m.value))}
                className={`interactive-press min-h-10 rounded-full border px-3.5 text-xs font-semibold ${
                  mood === m.value
                    ? "border-primary/60 bg-primary/15 text-primary"
                    : "border-border text-muted-foreground"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <textarea
            value={note}
            maxLength={4000}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="O que ficou do dia? (opcional)"
            aria-label="Reflexão"
            className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
          />
          {habits.length > 0 && (
            <select
              value={habitId}
              onChange={(e) => setHabitId(e.target.value)}
              aria-label="Sobre qual rotina"
              className="min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
            >
              <option value="">Sobre o dia em geral</option>
              {habits
                .filter((h) => !h.archivedAt)
                .map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
            </select>
          )}
          <button
            type="button"
            onClick={save}
            disabled={saving || (!mood && !note.trim())}
            className="interactive-press min-h-12 w-full rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-40"
          >
            {saving ? "Salvando…" : "Guardar reflexão"}
          </button>
          {error && <InlineError message={error} />}
        </section>

        <section aria-label="Histórico de reflexões">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar nas reflexões"
            aria-label="Buscar nas reflexões"
            className="mb-3 min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary"
          />
          {q.isLoading ? (
            <div
              className="card-surface h-20 animate-pulse"
              role="status"
              aria-label="Carregando"
            />
          ) : q.isError ? (
            <p role="alert" className="text-sm">
              Não consegui carregar.{" "}
              <button onClick={() => void q.refetch()} className="font-semibold text-primary">
                Tentar de novo
              </button>
            </p>
          ) : rows.length === 0 ? (
            <p className="py-3 text-sm text-muted-foreground">
              {search ? "Nada encontrado." : "Nenhuma reflexão ainda. Quando quiser, é aqui."}
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {rows.map((r) => (
                <li key={r.id} className="flex items-start gap-3 px-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] text-muted-foreground">
                      {r.localDate.split("-").reverse().join("/")}
                      {r.mood ? ` · ${MOODS.find((m) => m.value === r.mood)?.label}` : ""}
                      {nameOf(r.habitId) ? ` · ${nameOf(r.habitId)}` : ""}
                    </p>
                    {r.note && <p className="mt-0.5 whitespace-pre-wrap text-sm">{r.note}</p>}
                  </div>
                  <button
                    onClick={() => void deleteReflection(r.id)}
                    aria-label="Apagar reflexão"
                    className="habit-icon-btn interactive-press"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {q.hasNextPage && (
            <button
              onClick={() => void q.fetchNextPage()}
              disabled={q.isFetchingNextPage}
              className="interactive-press mt-2 min-h-11 w-full rounded-xl border border-border text-sm font-semibold"
            >
              {q.isFetchingNextPage ? "Carregando…" : "Mostrar mais"}
            </button>
          )}
        </section>
      </div>
    </Modal>
  );
}

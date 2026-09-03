import { useEffect, useRef, useState } from "react";
import { Plus, Search, Sparkles, X } from "lucide-react";
import {
  useFeStore,
  notebookTimeline,
  getResurfacingCandidate,
  markResurfaced,
  type NotebookEntryType,
} from "@/lib/fe-store";
import { Card } from "@/components/sub-agenda-shared";
import { NotebookEntryEditor } from "./NotebookEntryEditor";

const typeMeta: Record<NotebookEntryType, string> = {
  deus_falou: "Deus falou comigo",
  oracao: "Oração",
  gratidao: "Gratidão",
  versiculo: "Versículo",
  aprendizado: "Aprendizado",
  testemunho: "Testemunho",
  livre: "Reflexão",
};

const typeOptions: NotebookEntryType[] = [
  "deus_falou",
  "oracao",
  "gratidao",
  "versiculo",
  "aprendizado",
  "testemunho",
  "livre",
];

function dayLabel(iso: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (iso === today) return "Hoje";
  if (iso === yesterday) return "Ontem";
  const [, m, d] = iso.split("-");
  const months = [
    "JAN",
    "FEV",
    "MAR",
    "ABR",
    "MAI",
    "JUN",
    "JUL",
    "AGO",
    "SET",
    "OUT",
    "NOV",
    "DEZ",
  ];
  return `${d} ${months[parseInt(m, 10) - 1]}`;
}

export function CadernoTab() {
  const state = useFeStore((s) => s);
  const [query, setQuery] = useState("");
  const [pickingType, setPickingType] = useState(false);
  const [editingType, setEditingType] = useState<NotebookEntryType | null>(null);

  const candidate = getResurfacingCandidate(state.notebookEntries);
  const markedRef = useRef<string | null>(null);
  useEffect(() => {
    if (candidate && markedRef.current !== candidate.id) {
      markedRef.current = candidate.id;
      markResurfaced(candidate.id);
    }
  }, [candidate]);

  const results = notebookTimeline(state.notebookEntries, query);
  const groups = new Map<string, typeof results>();
  for (const e of results) {
    const day = e.createdAt.slice(0, 10);
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day)!.push(e);
  }
  const orderedDays = [...groups.keys()].sort((a, b) => b.localeCompare(a));

  return (
    <div className="space-y-5">
      {candidate && (
        <Card title="Memórias">
          <div className="flex items-start gap-2">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Há algum tempo você registrou:</p>
              <p className="mt-1 text-sm italic">"{candidate.content || candidate.verseText}"</p>
            </div>
          </div>
        </Card>
      )}

      <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar no caderno..."
          className="w-full bg-transparent text-sm outline-none"
        />
      </div>

      <button
        onClick={() => setPickingType(true)}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-3 text-sm font-semibold text-primary"
      >
        <Plus className="h-4 w-4" /> Novo registro
      </button>

      {orderedDays.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Um espaço para guardar aquilo que você não quer esquecer.
        </p>
      )}

      {orderedDays.map((day) => (
        <div key={day}>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            {dayLabel(day)}
          </p>
          <div className="card-surface p-4">
            <ul className="divide-y divide-border">
              {groups.get(day)!.map((e) => (
                <li key={e.id} className="py-2.5 first:pt-0 last:pb-0">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {typeMeta[e.type]}
                  </p>
                  {e.verseReference && (
                    <p className="mt-0.5 text-sm font-semibold">{e.verseReference}</p>
                  )}
                  {(e.content || e.verseText) && (
                    <p className="mt-0.5 text-sm">"{e.content || e.verseText}"</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ))}

      {pickingType && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-background/85 backdrop-blur-sm sm:items-center sm:justify-center"
          onClick={() => setPickingType(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="card-surface w-full max-w-md rounded-b-none rounded-t-3xl border-x-0 border-b-0 p-5 sm:rounded-3xl sm:border"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">Novo registro</h3>
              <button onClick={() => setPickingType(false)}>
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
            <div className="mt-4 space-y-2">
              {typeOptions.map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    setPickingType(false);
                    setEditingType(t);
                  }}
                  className="w-full rounded-lg bg-surface-2 p-3 text-left text-sm font-semibold hover:border-primary/40"
                >
                  {typeMeta[t]}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {editingType && (
        <NotebookEntryEditor type={editingType} onClose={() => setEditingType(null)} />
      )}
    </div>
  );
}

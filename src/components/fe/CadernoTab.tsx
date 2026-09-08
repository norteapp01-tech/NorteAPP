import { useState } from "react";
import { BookOpen, ChevronRight, Lightbulb, Plus, Search, Sparkles } from "lucide-react";
import {
  notebookTimeline,
  useFeStore,
  type NotebookEntry,
  type NotebookEntryType,
} from "@/lib/fe-store";
import { Modal } from "@/components/ui/modal";
import { NotebookEntryEditor } from "./NotebookEntryEditor";

type Filter = "todas" | "estudos" | "experiencias" | "reflexoes";
const filters: { key: Filter; label: string }[] = [
  { key: "todas", label: "Todas" },
  { key: "estudos", label: "Estudos" },
  { key: "experiencias", label: "Experiências" },
  { key: "reflexoes", label: "Reflexões" },
];
const filterTypes: Record<Exclude<Filter, "todas">, NotebookEntryType[]> = {
  estudos: ["aprendizado", "versiculo"],
  experiencias: ["testemunho", "deus_falou", "gratidao"],
  reflexoes: ["livre"],
};
const choices: {
  type: NotebookEntryType;
  title: string;
  description: string;
  icon: typeof BookOpen;
}[] = [
  {
    type: "aprendizado",
    title: "Estudo bíblico",
    description: "Passagem, entendimento e aplicação",
    icon: BookOpen,
  },
  {
    type: "testemunho",
    title: "Experiência",
    description: "Algo que você viveu e quer recordar",
    icon: Sparkles,
  },
  {
    type: "livre",
    title: "Reflexão",
    description: "Um pensamento ou aprendizado pessoal",
    icon: Lightbulb,
  },
  {
    type: "versiculo",
    title: "Versículo",
    description: "Uma palavra que você quer guardar",
    icon: BookOpen,
  },
];

export function CadernoTab() {
  const entries = useFeStore((state) => state.notebookEntries);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("todas");
  const [picking, setPicking] = useState(false);
  const [editingType, setEditingType] = useState<NotebookEntryType | null>(null);
  const searched = notebookTimeline(entries, query);
  const visible =
    filter === "todas"
      ? searched
      : searched.filter((entry) => filterTypes[filter].includes(entry.type));
  return (
    <div className="space-y-5">
      <section>
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Seu caderno
            </p>
            <h2 className="mt-1 text-xl font-bold">O que você não quer esquecer?</h2>
          </div>
          <button
            onClick={() => setPicking(true)}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>
      </section>
      <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2.5">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar palavra, passagem ou tema…"
          className="w-full bg-transparent text-sm outline-none"
        />
      </div>
      <div className="flex gap-1 overflow-x-auto">
        {filters.map((item) => (
          <button
            key={item.key}
            onClick={() => setFilter(item.key)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${filter === item.key ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}
          >
            {item.label}
          </button>
        ))}
      </div>
      {visible.length === 0 ? (
        <div className="py-8 text-center">
          <BookOpen className="mx-auto h-6 w-6 text-primary" />
          <p className="mt-3 text-sm font-semibold">Seu caderno começa aqui</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Registre um estudo, uma experiência ou uma reflexão.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((entry) => (
            <EntryCard key={entry.id} entry={entry} />
          ))}
        </div>
      )}
      {picking && (
        <Modal title="O que você quer registrar?" onClose={() => setPicking(false)}>
          <div className="space-y-2">
            {choices.map(({ type, title, description, icon: Icon }) => (
              <button
                key={type}
                onClick={() => {
                  setPicking(false);
                  setEditingType(type);
                }}
                className="flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left"
              >
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10">
                  <Icon className="h-5 w-5 text-primary" />
                </span>
                <span className="min-w-0 flex-1">
                  <strong className="block text-sm">{title}</strong>
                  <span className="text-[11px] text-muted-foreground">{description}</span>
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        </Modal>
      )}
      {editingType && (
        <NotebookEntryEditor type={editingType} onClose={() => setEditingType(null)} />
      )}
    </div>
  );
}

function EntryCard({ entry }: { entry: NotebookEntry }) {
  const label =
    entry.type === "aprendizado"
      ? "Estudo"
      : entry.type === "testemunho" || entry.type === "deus_falou"
        ? "Experiência"
        : entry.type === "versiculo"
          ? "Versículo"
          : entry.type === "gratidao"
            ? "Gratidão"
            : "Reflexão";
  return (
    <article className="card-surface p-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
          {label}
        </span>
        <time className="text-[10px] text-muted-foreground">
          {new Date(entry.createdAt).toLocaleDateString("pt-BR")}
        </time>
      </div>
      {entry.title && <h3 className="mt-2 text-sm font-bold">{entry.title}</h3>}
      {entry.verseReference && (
        <p className="mt-1 text-xs font-semibold text-muted-foreground">{entry.verseReference}</p>
      )}
      <p className="mt-1 line-clamp-3 text-sm leading-relaxed">
        {entry.content || entry.verseText}
      </p>
      {entry.tags.length > 0 && (
        <p className="mt-2 truncate text-[10px] text-muted-foreground">
          {entry.tags.map((tag) => `#${tag}`).join("  ")}
        </p>
      )}
    </article>
  );
}

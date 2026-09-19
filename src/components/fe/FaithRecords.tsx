import { useState } from "react";
import {
  BookOpen,
  FileText,
  Heart,
  PenLine,
  Plus,
  ChevronRight,
  Sparkles,
  HandHeart,
  CalendarDays,
  Search,
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import {
  useFeStore,
  getResurfacingCandidate,
  notebookTimeline,
  kindLabel,
  type NotebookEntry,
  type NotebookEntryType,
  type SpiritualActivity,
  type SpiritualActivityKind,
} from "@/lib/fe-store";
import { NotebookEntryEditor } from "./NotebookEntryEditor";
import { SpiritualActivitySetup } from "./SpiritualActivitySetup";

const choices = [
  { type: "testemunho", label: "Experiência", icon: FileText },
  { type: "gratidao", label: "Gratidão", icon: Heart },
  { type: "livre", label: "Reflexão", icon: PenLine },
  { type: "aprendizado", label: "Estudo", icon: BookOpen },
] as const;
const labels: Record<NotebookEntryType, string> = {
  testemunho: "Experiência",
  gratidao: "Gratidão",
  livre: "Reflexão",
  aprendizado: "Estudo bíblico",
  versiculo: "Versículo",
  oracao: "Oração",
  deus_falou: "Deus falou comigo",
};
export function FaithRecords({ onOpenPrayer }: { onOpenPrayer: () => void }) {
  const state = useFeStore((s) => s);
  const [editor, setEditor] = useState<NotebookEntryType | null>(null);
  const [picker, setPicker] = useState(false);
  const [all, setAll] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [entry, setEntry] = useState<NotebookEntry | null>(null);
  const [routines, setRoutines] = useState(false);
  const [routine, setRoutine] = useState<{
    kind: SpiritualActivityKind;
    existing?: SpiritualActivity;
  } | null>(null);
  const recent = notebookTimeline(state.notebookEntries, "").slice(0, 3);
  const memory = getResurfacingCandidate(state.notebookEntries);
  const active = state.prayerSubjects.filter((p) => p.status === "em_oracao").length;
  const records = notebookTimeline(state.notebookEntries, query).filter(
    (e) => filter === "all" || e.type === filter,
  );
  const row = (e: NotebookEntry, highlight = false) => (
    <button
      key={e.id}
      onClick={() => setEntry(e)}
      className={`faith-record ${highlight ? "is-featured" : ""}`}
    >
      <span>
        <small>
          <span>{labels[e.type]}</span> ·{" "}
          {new Date(e.createdAt).toLocaleDateString("pt-BR", { day: "numeric", month: "short" })}
        </small>
        {(e.title || e.verseReference) && <strong>{e.title || e.verseReference}</strong>}
        <p>{e.content || e.verseText || "Abrir registro"}</p>
      </span>
      <ChevronRight size={18} />
    </button>
  );
  return (
    <div className="faith-records">
      <section className="faith-capture">
        <h2>O que você quer guardar?</h2>
        <p>Registre algo que viveu, aprendeu ou quer lembrar.</p>
        <button className="faith-new" onClick={() => setPicker(true)}>
          <Plus size={23} /> Novo registro
        </button>
        <div className="faith-quick">
          {choices.map(({ type, label, icon: Icon }) => (
            <button key={type} onClick={() => setEditor(type)}>
              <Icon size={23} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </section>
      <section>
        <div className="faith-heading">
          <h2>Registros recentes</h2>
          <button onClick={() => setAll(true)}>Ver todos →</button>
        </div>
        {recent.map((e, i) => row(e, i === 0))}
        {!recent.length && (
          <p className="faith-empty">
            Suas experiências e aprendizados aparecerão aqui. Guarde seu primeiro registro.
          </p>
        )}
      </section>
      {memory && (
        <section>
          <h2>Para lembrar</h2>
          <button className="faith-memory" onClick={() => setEntry(memory)}>
            <Sparkles size={24} />
            <span>
              <small>Você escreveu há algum tempo</small>
              <p>{memory.content || memory.verseText || memory.title}</p>
              <span className="faith-link">Abrir registro →</span>
            </span>
          </button>
        </section>
      )}
      <div className="faith-navigation">
        <button onClick={onOpenPrayer}>
          <HandHeart size={26} />
          <span>
            <strong>Alvos em oração</strong>
            <small>
              {active} {active === 1 ? "situação acompanhada" : "situações acompanhadas"}
            </small>
          </span>
          <ChevronRight size={18} />
        </button>
        <button onClick={() => setRoutines(true)}>
          <CalendarDays size={26} />
          <span>
            <strong>Rotina espiritual</strong>
            <small>Opcional · dias e horários</small>
          </span>
          <ChevronRight size={18} />
        </button>
      </div>
      {picker && (
        <Modal title="O que você quer guardar?" onClose={() => setPicker(false)}>
          <div className="space-y-2">
            {Object.entries(labels).map(([type, label]) => (
              <button
                key={type}
                className="w-full rounded-xl border border-border p-3 text-left text-sm"
                onClick={() => {
                  setPicker(false);
                  setEditor(type as NotebookEntryType);
                }}
              >
                {label}
              </button>
            ))}
            <button
              className="w-full rounded-xl border border-border p-3 text-left text-sm"
              onClick={() => {
                setPicker(false);
                onOpenPrayer();
              }}
            >
              Alvo de oração →
            </button>
          </div>
        </Modal>
      )}
      {editor && <NotebookEntryEditor type={editor} onClose={() => setEditor(null)} />}
      {all && (
        <Modal title="Seus registros" onClose={() => setAll(false)}>
          <div className="faith-records">
            <label className="faith-search">
              <Search size={18} />
              <input
                aria-label="Buscar registros"
                placeholder="Buscar palavra, passagem ou tema…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <select
              aria-label="Tipo de registro"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="rounded-lg border border-border bg-surface p-2 text-sm"
            >
              <option value="all">Todos os registros</option>
              {Object.entries(labels).map(([key, value]) => (
                <option key={key} value={key}>
                  {value}
                </option>
              ))}
            </select>
            {records.map((e) => row(e))}
            {!records.length && <p className="faith-empty">Nenhum registro encontrado.</p>}
          </div>
        </Modal>
      )}
      {entry && (
        <Modal title={entry.title || labels[entry.type]} onClose={() => setEntry(null)}>
          <p className="mb-3 text-xs text-muted-foreground">
            {labels[entry.type]} · {new Date(entry.createdAt).toLocaleDateString("pt-BR")}
          </p>
          {entry.verseReference && <h3 className="mb-2 font-semibold">{entry.verseReference}</h3>}
          {entry.verseText && (
            <blockquote className="mb-4 whitespace-pre-wrap text-sm italic">
              {entry.verseText}
            </blockquote>
          )}
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{entry.content}</p>
          {entry.context && (
            <p className="mt-4 whitespace-pre-wrap text-sm text-muted-foreground">
              {entry.context}
            </p>
          )}
          {entry.tags.length > 0 && (
            <p className="mt-4 text-xs text-primary">{entry.tags.map((t) => "#" + t).join(" ")}</p>
          )}
        </Modal>
      )}
      {routines && (
        <Modal title="Rotina espiritual" onClose={() => setRoutines(false)}>
          <p className="mb-4 text-sm text-muted-foreground">
            Reserve um horário na sua agenda, se fizer sentido para você.
          </p>
          {state.spiritualActivities.map((a) => (
            <button
              key={a.id}
              onClick={() => {
                setRoutines(false);
                setRoutine({ kind: a.kind, existing: a });
              }}
              className="mb-2 flex w-full justify-between rounded-xl border border-border p-3 text-sm"
            >
              <span>{a.title}</span>
              <span>{a.time}</span>
            </button>
          ))}
          <p className="my-3 text-xs text-muted-foreground">Adicionar à rotina</p>
          {Object.entries(kindLabel).map(([kind, label]) => (
            <button
              key={kind}
              onClick={() => {
                setRoutines(false);
                setRoutine({ kind: kind as SpiritualActivityKind });
              }}
              className="mb-2 block w-full rounded-xl border border-border p-3 text-left text-sm"
            >
              + {label}
            </button>
          ))}
        </Modal>
      )}
      {routine && (
        <SpiritualActivitySetup
          kind={routine.kind}
          existing={routine.existing}
          onClose={() => setRoutine(null)}
        />
      )}
    </div>
  );
}

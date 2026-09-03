import { useState } from "react";
import { Plus, HandHeart } from "lucide-react";
import {
  useFeStore,
  addPrayerSubject,
  addNotebookEntry,
  type PrayerSubjectStatus,
} from "@/lib/fe-store";
import { Card } from "@/components/sub-agenda-shared";
import { PrayNowFlow } from "./PrayNowFlow";
import { PrayerSubjectDetail } from "./PrayerSubjectDetail";
import { PurposeSetup } from "./PurposeSetup";

const statusLabel: Record<PrayerSubjectStatus, string> = {
  em_oracao: "Em oração",
  quero_agradecer: "Quero agradecer",
  encerrada: "Encerrada",
};

export function OracaoTab() {
  const state = useFeStore((s) => s);
  const [praying, setPraying] = useState(false);
  const [openSubjectId, setOpenSubjectId] = useState<string | null>(null);
  const [addingSubject, setAddingSubject] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [creatingPurpose, setCreatingPurpose] = useState(false);
  const [gratitude, setGratitude] = useState("");

  const active = state.prayerSubjects.filter((p) => p.status !== "encerrada");
  const purposes = state.purposes.filter((p) => !p.archived);

  const saveSubject = () => {
    if (!newTitle.trim()) return;
    addPrayerSubject({ title: newTitle, description: newDescription });
    setNewTitle("");
    setNewDescription("");
    setAddingSubject(false);
  };

  const saveGratitude = () => {
    if (!gratitude.trim()) return;
    addNotebookEntry({ type: "gratidao", content: gratitude });
    setGratitude("");
  };

  return (
    <div className="space-y-5">
      <Card title="Em oração">
        {active.length === 0 && !addingSubject && (
          <p className="text-sm text-muted-foreground">
            Guarde aqui pessoas e situações que você quer lembrar em oração.
          </p>
        )}
        <ul className="space-y-2">
          {active.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => setOpenSubjectId(p.id)}
                className="w-full rounded-lg bg-surface-2 p-3 text-left"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold uppercase tracking-wide">{p.title}</p>
                  <span className="text-[10px] text-muted-foreground">{statusLabel[p.status]}</span>
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{p.description}</p>
              </button>
            </li>
          ))}
        </ul>

        {!addingSubject ? (
          <button
            onClick={() => setAddingSubject(true)}
            className="mt-2 flex items-center gap-1.5 text-xs text-primary"
          >
            <Plus className="h-3.5 w-3.5" /> adicionar assunto
          </button>
        ) : (
          <div className="mt-2 space-y-2 rounded-lg border border-dashed border-border p-3">
            <input
              autoFocus
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="ex: Família"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <textarea
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="ex: Saúde e proteção da minha família."
              className="min-h-14 w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <div className="flex gap-2">
              <button
                onClick={saveSubject}
                disabled={!newTitle.trim()}
                className="rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40"
              >
                Salvar
              </button>
              <button
                onClick={() => setAddingSubject(false)}
                className="text-xs text-muted-foreground"
              >
                cancelar
              </button>
            </div>
          </div>
        )}

        <button
          onClick={() => setPraying(true)}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground"
        >
          <HandHeart className="h-4 w-4" /> Orar agora
        </button>
      </Card>

      <Card title="Meus propósitos">
        {purposes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Existe algo que você deseja colocar diante de Deus nesta fase?
          </p>
        ) : (
          <ul className="space-y-2">
            {purposes.map((p) => (
              <li key={p.id} className="rounded-lg bg-surface-2 p-3">
                <p className="text-sm font-bold">{p.title}</p>
                <p className="mt-0.5 text-sm italic text-muted-foreground">"{p.intention}"</p>
              </li>
            ))}
          </ul>
        )}
        <button
          onClick={() => setCreatingPurpose(true)}
          className="mt-2 flex items-center gap-1.5 text-xs text-primary"
        >
          <Plus className="h-3.5 w-3.5" /> novo propósito
        </button>
      </Card>

      <Card title="Gratidão">
        <p className="text-sm">Sou grato por...</p>
        <textarea
          value={gratitude}
          onChange={(e) => setGratitude(e.target.value)}
          className="mt-2 min-h-16 w-full resize-none rounded-lg border border-border bg-surface-2 p-3 text-sm outline-none focus:border-primary"
        />
        <button
          onClick={saveGratitude}
          disabled={!gratitude.trim()}
          className="mt-2 rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40"
        >
          Salvar
        </button>
      </Card>

      {praying && <PrayNowFlow onClose={() => setPraying(false)} />}
      {openSubjectId && (
        <PrayerSubjectDetail subjectId={openSubjectId} onClose={() => setOpenSubjectId(null)} />
      )}
      {creatingPurpose && <PurposeSetup onClose={() => setCreatingPurpose(false)} />}
    </div>
  );
}

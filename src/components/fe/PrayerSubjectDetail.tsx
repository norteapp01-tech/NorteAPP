import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import {
  useFeStore,
  updatePrayerSubject,
  setPrayerSubjectStatus,
  addPrayerNote,
  notesForSubject,
  type PrayerSubjectStatus,
} from "@/lib/fe-store";

const statusOptions: { value: PrayerSubjectStatus; label: string }[] = [
  { value: "em_oracao", label: "Em oração" },
  { value: "quero_agradecer", label: "Quero agradecer" },
  { value: "encerrada", label: "Encerrada" },
];

export function PrayerSubjectDetail({
  subjectId,
  onClose,
}: {
  subjectId: string;
  onClose: () => void;
}) {
  const state = useFeStore((s) => s);
  const subject = state.prayerSubjects.find((p) => p.id === subjectId);
  const notes = notesForSubject(state.prayerNotes, subjectId);

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(subject?.title ?? "");
  const [description, setDescription] = useState(subject?.description ?? "");
  const [noteText, setNoteText] = useState("");

  if (!subject) return null;

  const saveEdit = async () => {
    await updatePrayerSubject(subject.id, { title, description });
    setEditing(false);
  };

  return (
    <Modal onClose={onClose} title={subject.title}>
      <div className="space-y-4">
        {!editing ? (
          <div>
            <p className="text-sm text-muted-foreground">{subject.description}</p>
            <button onClick={() => setEditing(true)} className="mt-2 text-xs text-primary">
              editar
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-16 w-full resize-none rounded-lg border border-border bg-surface-2 p-3 text-sm outline-none focus:border-primary"
            />
            <button
              onClick={saveEdit}
              className="rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground"
            >
              Salvar
            </button>
          </div>
        )}

        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Status
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {statusOptions.map((o) => (
              <button
                key={o.value}
                onClick={() => setPrayerSubjectStatus(subject.id, o.value)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${subject.status === o.value ? "bg-primary text-primary-foreground" : "bg-surface-2 text-muted-foreground"}`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Observações
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <input
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Adicionar observação..."
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <button
              onClick={async () => {
                if (!noteText.trim()) return;
                const text = noteText;
                setNoteText("");
                await addPrayerNote(subject.id, text);
              }}
              className="shrink-0 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
            >
              +
            </button>
          </div>
          {notes.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {notes.map((n) => (
                <li key={n.id} className="rounded-lg bg-surface-2 p-2 text-xs">
                  <p>{n.text}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {n.createdAt.slice(0, 10).split("-").reverse().join("/")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}

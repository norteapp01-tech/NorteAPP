import { useState } from "react";
import { CheckCircle2, ChevronDown, ChevronRight, Plus } from "lucide-react";
import { addPrayerSubject, useFeStore } from "@/lib/fe-store";
import { Modal } from "@/components/ui/modal";
import { PrayerSubjectDetail } from "./PrayerSubjectDetail";

export function OracaoTab() {
  const subjects = useFeStore((state) => state.prayerSubjects);
  const active = subjects.filter((subject) => subject.status === "em_oracao");
  const answered = subjects.filter((subject) => subject.status === "quero_agradecer");
  const archived = subjects.filter((subject) => subject.status === "encerrada");
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [showAnswered, setShowAnswered] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  return (
    <div className="space-y-6">
      <section>
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Seus alvos
            </p>
            <h2 className="mt-1 text-xl font-bold">O que você tem colocado em oração?</h2>
          </div>
          <button
            onClick={() => setAdding(true)}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-bold">Em oração</h3>
          <span className="text-xs text-muted-foreground">{active.length}</span>
        </div>
        {active.length === 0 ? (
          <button
            onClick={() => setAdding(true)}
            className="w-full rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground"
          >
            Adicione seu primeiro alvo de oração
          </button>
        ) : (
          <div className="card-surface divide-y divide-border p-0">
            {active.map((subject) => (
              <button
                key={subject.id}
                onClick={() => setOpenId(subject.id)}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
              >
                <span className="h-5 w-5 shrink-0 rounded-full border border-primary" />
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-sm">{subject.title}</strong>
                  <span className="text-[11px] text-muted-foreground">
                    {subject.category || "Pessoal"} · desde {formatDate(subject.createdAt)}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        )}
      </section>

      <Drawer
        title="Respondidas"
        count={answered.length}
        open={showAnswered}
        onToggle={() => setShowAnswered(!showAnswered)}
        icon={<CheckCircle2 className="h-4 w-4 text-primary" />}
      >
        {answered.map((subject) => (
          <button
            key={subject.id}
            onClick={() => setOpenId(subject.id)}
            className="flex w-full justify-between border-t border-border py-3 text-left text-sm"
          >
            <span>{subject.title}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        ))}
      </Drawer>
      <Drawer
        title="Arquivadas"
        count={archived.length}
        open={showArchived}
        onToggle={() => setShowArchived(!showArchived)}
      >
        {archived.map((subject) => (
          <button
            key={subject.id}
            onClick={() => setOpenId(subject.id)}
            className="flex w-full justify-between border-t border-border py-3 text-left text-sm"
          >
            <span>{subject.title}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        ))}
      </Drawer>

      {adding && <NewPrayerTarget onClose={() => setAdding(false)} />}
      {openId && <PrayerSubjectDetail subjectId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function Drawer({
  title,
  count,
  open,
  onToggle,
  icon,
  children,
}: {
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-border">
      <button onClick={onToggle} className="flex w-full items-center gap-2 py-3 text-left">
        {icon}
        <strong className="flex-1 text-sm">{title}</strong>
        <span className="text-xs text-muted-foreground">{count}</span>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && <div>{children}</div>}
    </section>
  );
}

function NewPrayerTarget({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <Modal title="Novo alvo de oração" onClose={onClose}>
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">
            Alvo
          </span>
          <input
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Ex: Saúde da minha mãe"
            className="w-full rounded-xl border border-border bg-surface-2 px-3 py-3 text-sm outline-none focus:border-primary"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">
            Categoria opcional
          </span>
          <input
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            placeholder="Família, trabalho, pessoal…"
            className="w-full rounded-xl border border-border bg-surface-2 px-3 py-3 text-sm outline-none focus:border-primary"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">
            Contexto opcional
          </span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Algo que você queira lembrar"
            className="min-h-20 w-full resize-none rounded-xl border border-border bg-surface-2 p-3 text-sm outline-none focus:border-primary"
          />
        </label>
      </div>
      <button
        disabled={!title.trim() || saving}
        onClick={async () => {
          setSaving(true);
          try {
            await addPrayerSubject({ title, category, description });
            onClose();
          } finally {
            setSaving(false);
          }
        }}
        className="mt-5 w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40"
      >
        {saving ? "Salvando…" : "Guardar alvo"}
      </button>
    </Modal>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short" }).format(
    new Date(value),
  );
}

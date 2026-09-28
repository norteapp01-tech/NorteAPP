import { useState } from "react";
import { Archive, CheckCircle2, ChevronDown, ChevronRight, FilePenLine, Plus } from "lucide-react";
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
    <div className="faith-prayers">
      <section className="faith-prayer-intro">
        <div className="faith-prayer-title-row">
          <div>
            <p className="faith-eyebrow">Seus alvos</p>
            <h2>O que você tem colocado em oração?</h2>
          </div>
          <button
            onClick={() => setAdding(true)}
            className="faith-prayer-add"
            aria-label="Adicionar alvo de oração"
          >
            <Plus />
          </button>
        </div>
        <p className="faith-prayer-caption">
          Acompanhe cada situação com calma, um dia de cada vez.
        </p>
      </section>

      <section className="faith-prayer-active">
        <div className="faith-prayer-section-heading">
          <h3>Em oração</h3>
          <span>{active.length}</span>
        </div>
        {active.length === 0 ? (
          <button onClick={() => setAdding(true)} className="faith-prayer-empty">
            Adicione seu primeiro alvo de oração
          </button>
        ) : (
          <div className="faith-prayer-card">
            {active.map((subject) => (
              <button
                key={subject.id}
                onClick={() => setOpenId(subject.id)}
                className="faith-prayer-row"
              >
                <span className="faith-prayer-circle" />
                <span className="faith-prayer-row-copy">
                  <strong>{subject.title}</strong>
                  <span>
                    {subject.category || "Pessoal"} · desde {formatDate(subject.createdAt)}
                  </span>
                </span>
                <ChevronRight />
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
        icon={<Archive className="h-4 w-4" />}
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

      <p className="faith-prayer-helper">
        <FilePenLine /> Abra um alvo para registrar uma atualização.
      </p>

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
    <section className="faith-prayer-drawer">
      <button onClick={onToggle}>
        {icon}
        <strong>{title}</strong>
        <span>{count}</span>
        <ChevronDown className={`faith-drawer-chevron ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="faith-prayer-drawer-content">{children}</div>}
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

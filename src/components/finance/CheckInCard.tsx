import { useState } from "react";
import { answerCheckIn, type CheckIn, type CheckInAnswer } from "@/lib/finance-store";
import { Card } from "@/components/sub-agenda-shared";

const options: { value: CheckInAnswer; label: string }[] = [
  { value: "consegui", label: "Consegui" },
  { value: "mais_ou_menos", label: "Mais ou menos" },
  { value: "nao_consegui", label: "Não consegui" },
];

/** Discreto, nunca intrusivo — reflexão semanal, não fiscalização. */
export function CheckInCard({ checkIn }: { checkIn: CheckIn }) {
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);

  return (
    <Card title="Check-in">
      <p className="text-sm">{checkIn.question}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => answerCheckIn(checkIn.id, o.value, note || undefined)}
            className="rounded-full border border-border bg-surface-2 px-3 py-1.5 text-xs font-semibold hover:border-primary/40"
          >
            {o.label}
          </button>
        ))}
      </div>
      {!showNote ? (
        <button
          onClick={() => setShowNote(true)}
          className="mt-2 text-[11px] text-muted-foreground"
        >
          + adicionar observação
        </button>
      ) : (
        <textarea
          autoFocus
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Como foi..."
          className="mt-2 min-h-14 w-full resize-none rounded-lg border border-border bg-surface-2 p-2 text-xs outline-none focus:border-primary"
        />
      )}
    </Card>
  );
}

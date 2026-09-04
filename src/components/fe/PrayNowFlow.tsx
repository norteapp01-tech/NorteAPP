import { useEffect, useState } from "react";
import { X, ChevronLeft, ChevronRight, Timer } from "lucide-react";
import { useFeStore, recordPrayerActivity, type PrayerSubject } from "@/lib/fe-store";

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function PrayNowFlow({ onClose }: { onClose: () => void }) {
  const subjects = useFeStore((s) => s.prayerSubjects.filter((p) => p.status !== "encerrada"));
  const [index, setIndex] = useState(0);
  const [showTimer, setShowTimer] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!showTimer) return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [showTimer]);

  const finish = async () => {
    await recordPrayerActivity();
    onClose();
  };

  if (subjects.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background px-8 text-center">
        <button onClick={onClose} className="absolute right-5 top-12">
          <X className="h-5 w-5 text-muted-foreground" />
        </button>
        <p className="text-sm text-muted-foreground">
          Guarde aqui pessoas e situações que você quer lembrar em oração.
        </p>
      </div>
    );
  }

  const subject: PrayerSubject = subjects[Math.min(index, subjects.length - 1)];

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center justify-between px-5 pt-12">
        <span className="text-xs text-muted-foreground">
          {index + 1} de {subjects.length}
        </span>
        <button onClick={onClose}>
          <X className="h-5 w-5 text-muted-foreground" />
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
        <p className="text-2xl font-bold">{subject.title}</p>
        {subject.description && (
          <p className="mt-3 text-base text-muted-foreground">{subject.description}</p>
        )}

        {!showTimer ? (
          <button
            onClick={() => setShowTimer(true)}
            className="mt-8 flex items-center gap-1.5 text-xs text-muted-foreground"
          >
            <Timer className="h-3.5 w-3.5" /> presença silenciosa
          </button>
        ) : (
          <p className="mt-8 font-mono text-lg text-primary">{formatElapsed(elapsed)}</p>
        )}
      </div>

      <div className="flex items-center justify-between px-5 pb-10">
        <button
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
          className="flex items-center gap-1 text-sm text-muted-foreground disabled:opacity-30"
        >
          <ChevronLeft className="h-4 w-4" /> anterior
        </button>
        {index < subjects.length - 1 ? (
          <button
            onClick={() => setIndex((i) => i + 1)}
            className="flex items-center gap-1 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            próximo <ChevronRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            onClick={finish}
            className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            Finalizar
          </button>
        )}
      </div>
    </div>
  );
}

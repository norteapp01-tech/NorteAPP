import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronDown, Sparkles } from "lucide-react";
import { useNorteChatLauncher } from "@/lib/norte-chat-launcher";
import type { Insight, InsightAction } from "@/lib/mirror-insights";

export function ActionButton({ action, className }: { action: InsightAction; className?: string }) {
  const launcher = useNorteChatLauncher();
  const base = `interactive-press inline-flex min-h-10 items-center justify-center rounded-full border border-primary/50 px-4 text-sm font-semibold text-primary ${className ?? ""}`;
  if (action.kind === "agenda")
    return (
      <Link to="/agenda" search={{ date: action.date }} className={base}>
        {action.label}
      </Link>
    );
  return (
    <button
      type="button"
      className={base}
      onClick={() => launcher.openChatWithDraft(action.prompt)}
    >
      {action.label}
    </button>
  );
}

const TONE = {
  positive: "text-primary",
  attention: "text-warning",
  neutral: "text-muted-foreground",
} as const;

/** Um insight do Norte: frase, de onde veio e (se houver) o que fazer. */
export function InsightCard({
  insight,
  featured,
  label,
}: {
  insight: Insight;
  featured?: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className={`${featured ? "card-surface-featured" : "card-surface"} p-5`}>
      <p
        className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[.16em] ${TONE[insight.tone]}`}
      >
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        {label ?? "O Norte percebeu"}
      </p>
      <p className="mt-3 text-lg font-semibold leading-snug">{insight.text}</p>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="mt-3 flex items-center gap-1 text-xs text-muted-foreground"
      >
        De onde vem isso?
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{insight.evidence}</p>
      )}
      {insight.action && <ActionButton action={insight.action} className="mt-4" />}
    </section>
  );
}

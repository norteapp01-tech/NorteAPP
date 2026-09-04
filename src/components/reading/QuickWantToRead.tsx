import { useState } from "react";
import { Plus } from "lucide-react";
import { quickAddWantToRead } from "@/lib/reading-store";

/** "+ Quero ler" — um campo só, sem fricção nenhuma. */
export function QuickWantToRead() {
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);

  const add = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    const value = title;
    setTitle("");
    try {
      await quickAddWantToRead(value);
    } catch {
      setTitle(value);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && add()}
        placeholder="+ Quero ler..."
        className="w-full rounded-lg border border-dashed border-border bg-surface-2 px-3 py-2 text-xs outline-none focus:border-primary"
      />
      <button
        onClick={add}
        disabled={!title.trim() || saving}
        className="shrink-0 text-primary disabled:opacity-30"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

import { useState, type ChangeEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Share2, Trash2, Camera } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { formatDateBR } from "@/lib/goals-store";
import { supabase } from "@/lib/supabase/client";
import {
  fetchActivityPoints,
  updateActivity,
  deleteActivity,
  formatDistanceKm,
  formatDurationClock,
  formatPace,
  formatSpeedKmh,
  type SportActivity,
} from "@/lib/sport-store";
import { RoutePreview } from "./RoutePreview";
import { ShareActivitySheet } from "./ShareActivitySheet";

export function ActivityDetailModal({
  activity,
  onClose,
}: {
  activity: SportActivity;
  onClose: () => void;
}) {
  const { data: points } = useQuery({
    queryKey: ["sport-activity-points", activity.id],
    queryFn: () => fetchActivityPoints(activity.id),
    enabled: activity.source === "gravado",
  });

  const [title, setTitle] = useState(activity.title);
  const [note, setNote] = useState(activity.note ?? "");
  const [editingTitle, setEditingTitle] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const photoUrl = activity.photoUrl
    ? supabase.storage.from("sport-photos").getPublicUrl(activity.photoUrl).data.publicUrl
    : null;

  const saveTitle = async () => {
    if (title.trim() && title !== activity.title)
      await updateActivity(activity.id, { title: title.trim() });
    setEditingTitle(false);
  };

  const saveNote = async () => {
    if (note !== (activity.note ?? "")) await updateActivity(activity.id, { note });
  };

  const onPhotoFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return;
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${userId}/${activity.id}.${ext}`;
      const { error } = await supabase.storage
        .from("sport-photos")
        .upload(path, file, { upsert: true });
      if (!error) await updateActivity(activity.id, { photoUrl: path });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Modal
      title={
        editingTitle ? (
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => e.key === "Enter" && saveTitle()}
            className="w-full rounded-md border border-border bg-surface-2 px-2 py-1 text-base outline-none focus:border-primary"
          />
        ) : (
          <button onClick={() => setEditingTitle(true)} className="text-left">
            {activity.title}
          </button>
        )
      }
      onClose={onClose}
    >
      <div className="space-y-4">
        <RoutePreview
          points={points ?? []}
          hideRoute={activity.privacyHideRoute}
          hideStartEnd={activity.privacyHideStartEnd}
          className="h-48"
        />

        {photoUrl && <img src={photoUrl} alt="" className="h-40 w-full rounded-xl object-cover" />}

        <p className="text-xs text-muted-foreground">
          {formatDateBR(activity.startedAt.slice(0, 10))}
        </p>

        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded-xl bg-primary/10 p-3">
            <p className="text-xl font-bold text-primary">{formatDistanceKm(activity.distanceM)}</p>
            <p className="text-[10px] uppercase text-muted-foreground">distância</p>
          </div>
          <div className="rounded-xl bg-surface-2 p-3">
            <p className="text-xl font-bold">{formatDurationClock(activity.activeDurationS)}</p>
            <p className="text-[10px] uppercase text-muted-foreground">tempo ativo</p>
          </div>
          <div className="rounded-xl bg-surface-2 p-3">
            <p className="text-xl font-bold">{formatDurationClock(activity.totalDurationS)}</p>
            <p className="text-[10px] uppercase text-muted-foreground">tempo total</p>
          </div>
          <div className="rounded-xl bg-surface-2 p-3">
            <p className="text-xl font-bold">
              {activity.modality === "ciclismo"
                ? formatSpeedKmh(activity.avgSpeedKmh ?? null)
                : formatPace(activity.avgPaceSPerKm ?? null)}
            </p>
            <p className="text-[10px] uppercase text-muted-foreground">
              {activity.modality === "ciclismo" ? "velocidade média" : "ritmo médio"}
            </p>
          </div>
        </div>

        <label className="block text-sm">
          <span className="mb-1 block text-[11px] uppercase text-muted-foreground">Observação</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={saveNote}
            rows={2}
            placeholder="Como foi essa atividade?"
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </label>

        <label className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border py-2.5 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary">
          <Camera className="h-3.5 w-3.5" />
          {uploading ? "Enviando…" : photoUrl ? "Trocar foto" : "Adicionar foto"}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onPhotoFile}
            disabled={uploading}
          />
        </label>

        <div className="flex gap-2">
          <button
            onClick={() => setShareOpen(true)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground"
          >
            <Share2 className="h-4 w-4" /> Compartilhar
          </button>
          <button
            onClick={() => setConfirmDelete(true)}
            aria-label="Excluir atividade"
            className="flex items-center justify-center rounded-lg border border-border px-3 text-danger"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        {confirmDelete && (
          <div className="rounded-lg border border-danger/30 bg-danger/10 p-3">
            <p className="text-xs text-foreground">
              Excluir esta atividade? Não pode ser desfeito.
            </p>
            <div className="mt-2 flex gap-2">
              <button
                onClick={async () => {
                  await deleteActivity(activity.id);
                  onClose();
                }}
                className="flex-1 rounded-lg bg-danger py-1.5 text-xs font-semibold text-white"
              >
                Excluir
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 rounded-lg border border-border py-1.5 text-xs font-semibold"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      {shareOpen && (
        <ShareActivitySheet
          activity={activity}
          points={points ?? []}
          onClose={() => setShareOpen(false)}
        />
      )}
    </Modal>
  );
}

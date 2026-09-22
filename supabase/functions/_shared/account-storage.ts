import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const USER_BUCKETS = ["avatars", "sport-photos", "book-covers", "financial-goal-images"] as const;

/** Remove every object under this user's prefix, including nested folders. */
export async function removeUserFiles(admin: SupabaseClient, userId: string) {
  for (const bucket of USER_BUCKETS) {
    await removeFolder(admin, bucket, userId);
  }
}

async function removeFolder(admin: SupabaseClient, bucket: string, folder: string) {
  for (let pass = 0; pass < 1000; pass++) {
    const { data, error } = await admin.storage.from(bucket).list(folder, { limit: 100 });
    if (error) throw error;
    if (!data?.length) return;

    const files = data.filter((item) => item.id).map((item) => `${folder}/${item.name}`);
    const folders = data.filter((item) => !item.id).map((item) => `${folder}/${item.name}`);
    for (const child of folders) await removeFolder(admin, bucket, child);
    if (files.length) {
      const { error: removeError } = await admin.storage.from(bucket).remove(files);
      if (removeError) throw removeError;
    }
  }
  throw new Error(`Não foi possível esvaziar ${bucket}/${folder}.`);
}

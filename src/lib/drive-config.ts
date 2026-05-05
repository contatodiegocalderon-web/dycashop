import { createAdminClient } from "@/lib/supabase/admin";

/** Pasta raiz do catálogo: primeiro Supabase (`admin`), depois env legado. */
export async function getDriveRootFolderId(): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("catalog_settings")
    .select("drive_folder_id")
    .eq("id", 1)
    .maybeSingle();

  const fromDb = data?.drive_folder_id?.trim();
  if (fromDb) return fromDb;
  return process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID?.trim() ?? null;
}

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Só permite proxy de imagens do Drive para IDs que pertencem ao catálogo ou a recibos
 * (evita usar credenciais Google para ler ficheiros arbitrários por ID).
 */
export async function isDriveFileIdAllowedForPublicProxy(
  fileId: string
): Promise<boolean> {
  const admin = createAdminClient();

  const { data: prod } = await admin
    .from("products")
    .select("id")
    .eq("drive_file_id", fileId)
    .limit(1)
    .maybeSingle();

  if (prod) return true;

  const { data: item } = await admin
    .from("order_items")
    .select("id")
    .eq("snapshot_drive_file_id", fileId)
    .limit(1)
    .maybeSingle();

  return !!item;
}

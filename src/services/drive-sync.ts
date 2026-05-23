import { ensureDriveAuthorized, getDriveAuth } from "@/lib/drive-auth";
import { isTransientSyncError, withRetry } from "@/lib/retry";
import { getAdminClient } from "@/lib/supabase/admin";
import {
  fetchDriveProductRows,
  type DriveImportRow,
  type DriveImportUpsert,
} from "@/services/drive-import";
import {
  deleteStorageForDriveFileIds,
  markProductImageSyncError,
  syncOneProductImageToStorage,
  type ImageSyncItem,
} from "@/services/catalog-storage-sync";
import { renameDriveFilesToCurrentStock } from "@/services/drive-rename-stock";

const IN_CHUNK = 120;
const UPSERT_CHUNK = 80;
/** Uma imagem de cada vez — evita «Too many connections» no Supabase. */
const BETWEEN_IMAGES_MS = 400;

export type SyncResult = {
  imported: number;
  totalParsed: number;
  removedMissingFromDrive: number;
  storageRemoved: number;
  message?: string;
  storageUploaded: number;
  storageSkipped: number;
  storageErrors: { id: string; drive_file_id?: string; message: string }[];
  driveRenameOk: number;
  driveRenameErrors: { productId: string; message: string }[];
};

export type SyncProgressEvent =
  | { type: "phase"; phase: string }
  | {
      type: "progress";
      phase: "images";
      current: number;
      total: number;
      skipped: number;
    }
  | { type: "complete"; result: SyncResult }
  | { type: "fatal"; message: string };

type SyncOptions = {
  preserveExistingStock?: boolean;
  /** Se true, renomeia ficheiros no Drive ao final para refletir stock atual da app. */
  renameDriveFiles?: boolean;
};

function rowForUpsert(row: DriveImportRow): DriveImportUpsert {
  const { drive_modified_at, ...rest } = row;
  void drive_modified_at;
  return rest;
}

function mergePreservingStock(
  fromDrive: DriveImportRow[],
  existing: { drive_file_id: string; stock: number }[]
): DriveImportRow[] {
  const map = new Map(existing.map((p) => [p.drive_file_id, p.stock]));
  return fromDrive.map((row) => {
    const kept = map.get(row.drive_file_id);
    if (kept === undefined) {
      return row;
    }
    const stock = kept;
    return {
      ...row,
      stock,
      status: stock <= 0 ? ("ESGOTADO" as const) : ("ATIVO" as const),
    };
  });
}

type AdminClient = ReturnType<typeof getAdminClient>;

type ImageStateRow = {
  id: string;
  drive_file_id: string;
  drive_updated_at: string | null;
  image_url: string | null;
  sync_status: string | null;
};

async function removeLegacyImportProducts(admin: AdminClient): Promise<void> {
  const { data: orderRows } = await admin
    .from("order_items")
    .select("product_id");
  const protectedIds = new Set(
    (orderRows ?? [])
      .map((r: { product_id: string | null }) => r.product_id)
      .filter((id): id is string => Boolean(id))
  );

  async function deleteBatch(kind: "null" | "streetwear") {
    let query = admin.from("products").select("id");
    if (kind === "null") {
      query = query.is("category", null);
    } else {
      query = query.eq("category", "STREETWEAR");
    }
    const { data: targets, error: selErr } = await query;
    if (selErr) throw new Error(selErr.message);
    const safeIds = (targets ?? [])
      .map((t: { id: string }) => t.id)
      .filter((id: string) => !protectedIds.has(id));
    if (safeIds.length === 0) return;
    const { error: delErr } = await admin
      .from("products")
      .delete()
      .in("id", safeIds);
    if (delErr) throw new Error(delErr.message);
  }

  await deleteBatch("null");
  await deleteBatch("streetwear");
}

async function fetchProductIdsInOrders(
  admin: AdminClient
): Promise<Set<string>> {
  const { data: orderRows, error } = await admin
    .from("order_items")
    .select("product_id");
  if (error) throw new Error(error.message);
  return new Set(
    (orderRows ?? [])
      .map((r: { product_id: string | null }) => r.product_id)
      .filter((id): id is string => Boolean(id))
  );
}

async function pruneProductsMissingFromDrive(
  admin: AdminClient,
  driveFileIds: string[]
): Promise<{ removed: number; removedDriveFileIds: string[] }> {
  const driveSet = new Set(driveFileIds);
  const protectedIds = await fetchProductIdsInOrders(admin);

  const { data: products, error: listErr } = await admin
    .from("products")
    .select("id, drive_file_id");
  if (listErr) throw new Error(listErr.message);

  const removable: string[] = [];
  const removedDriveFileIds: string[] = [];
  for (const p of products ?? []) {
    const row = p as { id: string; drive_file_id: string | null };
    const driveId = row.drive_file_id?.trim() ?? "";
    if (!driveId || driveSet.has(driveId)) continue;
    if (protectedIds.has(row.id)) continue;
    removable.push(row.id);
    removedDriveFileIds.push(driveId);
  }

  if (removable.length === 0) {
    return { removed: 0, removedDriveFileIds: [] };
  }

  let removed = 0;
  for (let i = 0; i < removable.length; i += IN_CHUNK) {
    const slice = removable.slice(i, i + IN_CHUNK);
    const { error: delErr, count } = await admin
      .from("products")
      .delete({ count: "exact" })
      .in("id", slice);
    if (delErr) throw new Error(delErr.message);
    removed += count ?? slice.length;
  }

  return { removed, removedDriveFileIds };
}

function emptySyncResult(partial: Partial<SyncResult>): SyncResult {
  return {
    imported: 0,
    totalParsed: 0,
    removedMissingFromDrive: 0,
    storageRemoved: 0,
    storageUploaded: 0,
    storageSkipped: 0,
    storageErrors: [],
    driveRenameOk: 0,
    driveRenameErrors: [],
    ...partial,
  };
}

async function fetchExistingStockByDriveIds(
  admin: AdminClient,
  ids: string[]
): Promise<{ drive_file_id: string; stock: number }[]> {
  const out: { drive_file_id: string; stock: number }[] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const slice = ids.slice(i, i + IN_CHUNK);
    const { data, error } = await admin
      .from("products")
      .select("drive_file_id, stock")
      .in("drive_file_id", slice);
    if (error) {
      throw new Error(error.message);
    }
    out.push(...(data ?? []));
  }
  return out;
}

async function fetchImageStateByDriveIds(
  admin: AdminClient,
  ids: string[]
): Promise<ImageStateRow[]> {
  const out: ImageStateRow[] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const slice = ids.slice(i, i + IN_CHUNK);
    const { data, error } = await admin
      .from("products")
      .select("id, drive_file_id, drive_updated_at, image_url, sync_status")
      .in("drive_file_id", slice);
    if (error) {
      throw new Error(error.message);
    }
    out.push(...((data ?? []) as ImageStateRow[]));
  }
  return out;
}

async function fetchMirrorTargetsByDriveIds(
  admin: AdminClient,
  ids: string[]
): Promise<{ id: string; drive_file_id: string }[]> {
  const out: { id: string; drive_file_id: string }[] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const slice = ids.slice(i, i + IN_CHUNK);
    const { data, error } = await admin
      .from("products")
      .select("id, drive_file_id")
      .in("drive_file_id", slice);
    if (error) {
      throw new Error(error.message);
    }
    out.push(...((data ?? []) as { id: string; drive_file_id: string }[]));
  }
  return out;
}

function timesClose(isoDrive: string, isoDb: string | null | undefined): boolean {
  const a = Date.parse(isoDrive);
  const b = isoDb ? Date.parse(isoDb) : NaN;
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  return Math.abs(a - b) < 3000;
}

function needsImageSync(
  driveModifiedIso: string,
  db: ImageStateRow
): boolean {
  if (!db.image_url?.trim()) return true;
  const st = db.sync_status?.toLowerCase();
  if (st === "error" || st === "pending") return true;
  if (st === "done" && db.image_url?.trim()) {
    return !timesClose(driveModifiedIso, db.drive_updated_at);
  }
  return true;
}

function buildImageQueue(
  rows: DriveImportRow[],
  states: ImageStateRow[]
): ImageSyncItem[] {
  const byDrive = new Map(states.map((s) => [s.drive_file_id, s]));
  const queue: ImageSyncItem[] = [];
  for (const row of rows) {
    const db = byDrive.get(row.drive_file_id);
    if (!db) continue;
    if (needsImageSync(row.drive_modified_at, db)) {
      queue.push({
        id: db.id,
        drive_file_id: row.drive_file_id,
        driveModifiedIso: row.drive_modified_at,
      });
    }
  }
  return queue;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function processImageQueue(
  admin: AdminClient,
  queue: ImageSyncItem[],
  emit: ((e: SyncProgressEvent) => void) | undefined,
  skippedCount: number
): Promise<{
  uploaded: number;
  errors: { id: string; drive_file_id?: string; message: string }[];
}> {
  const errors: { id: string; drive_file_id?: string; message: string }[] = [];
  let uploaded = 0;
  let completed = 0;
  const total = queue.length;

  const driveAuth = await getDriveAuth();
  await ensureDriveAuthorized(driveAuth);

  for (let i = 0; i < queue.length; i++) {
    const item = queue[i]!;
    try {
      await withRetry(
        () => syncOneProductImageToStorage(admin, item, driveAuth),
        { label: `image-sync:${item.id}`, attempts: 3, baseDelayMs: 900 }
      );
      uploaded++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro";
      errors.push({
        id: item.id,
        drive_file_id: item.drive_file_id,
        message: msg,
      });
      if (isTransientSyncError(e)) {
        await delay(1200);
      }
      await withRetry(() => markProductImageSyncError(admin, item.id), {
        label: `mark-sync-error:${item.id}`,
        attempts: 3,
        baseDelayMs: 500,
      }).catch(() => {});
    }
    completed++;
    emit?.({
      type: "progress",
      phase: "images",
      current: completed,
      total,
      skipped: skippedCount,
    });
    if (i + 1 < queue.length) {
      await delay(BETWEEN_IMAGES_MS);
    }
  }

  return { uploaded, errors };
}

async function runSync(
  rootFolderId: string,
  emit?: (e: SyncProgressEvent) => void,
  opts?: SyncOptions
): Promise<SyncResult> {
  emit?.({ type: "phase", phase: "drive_scan" });

  const fromDrive = await fetchDriveProductRows(rootFolderId);

  const admin = getAdminClient();
  await removeLegacyImportProducts(admin);

  const ids = fromDrive.map((r) => r.drive_file_id);
  const prune = await pruneProductsMissingFromDrive(admin, ids);
  let storageRemoved = 0;
  if (prune.removedDriveFileIds.length > 0) {
    storageRemoved = await deleteStorageForDriveFileIds(
      admin,
      prune.removedDriveFileIds
    );
  }

  if (!fromDrive.length) {
    return emptySyncResult({
      removedMissingFromDrive: prune.removed,
      storageRemoved,
      message:
        "Nenhuma imagem válida nas pastas M, G ou GG. Estrutura: uma subpasta por categoria; dentro, M, G, GG com ficheiros «MARCA COR».",
    });
  }

  emit?.({ type: "phase", phase: "produtos" });
  const preserveExistingStock = opts?.preserveExistingStock === true;
  const rows = preserveExistingStock
    ? mergePreservingStock(
        fromDrive,
        await fetchExistingStockByDriveIds(admin, ids)
      )
    : fromDrive;

  let totalUpserted = 0;
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK).map(rowForUpsert);
    const { data, error } = await admin
      .from("products")
      .upsert(chunk, { onConflict: "drive_file_id" })
      .select("id");
    if (error) {
      throw new Error(error.message);
    }
    totalUpserted += data?.length ?? chunk.length;
  }

  emit?.({ type: "phase", phase: "imagens" });

  const imageStates = await fetchImageStateByDriveIds(admin, ids);
  const queue = buildImageQueue(rows, imageStates);
  const skippedCount = ids.length - queue.length;

  const { uploaded, errors } = await processImageQueue(
    admin,
    queue,
    emit,
    skippedCount
  );

  const shouldRenameDrive = opts?.renameDriveFiles !== false;
  let driveRenameOk = 0;
  let driveRenameErrors: { productId: string; message: string }[] = [];
  if (shouldRenameDrive) {
    emit?.({ type: "phase", phase: "drive_rename" });
    const targets = await fetchMirrorTargetsByDriveIds(admin, ids);
    const rename = await renameDriveFilesToCurrentStock(targets.map((t) => t.id));
    driveRenameOk = rename.ok.length;
    driveRenameErrors = rename.errors;
  }

  return {
    imported: totalUpserted,
    totalParsed: rows.length,
    removedMissingFromDrive: prune.removed,
    storageRemoved,
    storageUploaded: uploaded,
    storageSkipped: skippedCount,
    storageErrors: errors,
    driveRenameOk,
    driveRenameErrors,
  };
}

export async function syncProductsFromDriveFolder(
  rootFolderId: string,
  opts?: SyncOptions
): Promise<SyncResult> {
  return runSync(rootFolderId, undefined, opts);
}

/** NDJSON: uma linha JSON por evento (progresso + resultado final). */
export function syncProductsFromDriveFolderStreaming(
  rootFolderId: string,
  opts?: SyncOptions
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      try {
        const result = await runSync(
          rootFolderId,
          (e) => {
          controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
          },
          opts
        );
        controller.enqueue(
          encoder.encode(
            JSON.stringify({ type: "complete", result } satisfies SyncProgressEvent) +
              "\n"
          )
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Erro na sincronização";
        controller.enqueue(
          encoder.encode(
            JSON.stringify({ type: "fatal", message: msg } satisfies SyncProgressEvent) +
              "\n"
          )
        );
      } finally {
        controller.close();
      }
    },
  });
}

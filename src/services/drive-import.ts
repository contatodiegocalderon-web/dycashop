import { google, drive_v3 } from "googleapis";
import type { ProductSize } from "@/types";
import { driveThumbnailUrl } from "@/lib/drive-image-url";
import { ensureDriveAuthorized, getDriveAuth } from "@/lib/drive-auth";
import {
  buildSku,
  defaultInitialStockFromEnv,
  IMAGE_FILENAME_EXT,
  parseProductFileName,
  stripImageExtension,
} from "@/lib/parse-filename";

const SIZE_FOLDER_MAP: Record<string, ProductSize> = {
  m: "M",
  g: "G",
  gg: "GG",
};

type DriveListOptions = {
  supportsAllDrives: true;
  includeItemsFromAllDrives: true;
  corpora?: "drive" | "allDrives";
  driveId?: string;
};

export interface DriveImportRow {
  drive_file_id: string;
  /** ISO 8601 — modifiedTime do ficheiro no Drive (para sync incremental). */
  drive_modified_at: string;
  drive_image_url: string;
  original_file_name: string;
  /** Nome da pasta de categoria no Drive (ex.: BERMUDAS ELASTANO, CAMISETAS STREETWEAR). */
  category: string | null;
  brand: string;
  color: string;
  size: ProductSize;
  stock: number;
  sku: string;
  status: "ATIVO" | "ESGOTADO";
}

/** Campos gravados em `products` (sem metadados só para decisão de sync). */
export type DriveImportUpsert = Omit<DriveImportRow, "drive_modified_at">;

function getDriveListOptionsFromEnv(): DriveListOptions {
  const sharedDriveId = process.env.GOOGLE_DRIVE_SHARED_DRIVE_ID?.trim();
  if (sharedDriveId) {
    return {
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      corpora: "drive",
      driveId: sharedDriveId,
    };
  }

  return {
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    corpora: "allDrives",
  };
}

function sizeFromFolderName(name: string): ProductSize | null {
  const key = name.trim().toLowerCase();
  return SIZE_FOLDER_MAP[key] ?? null;
}

/**
 * Raiz do catálogo contém só M, G, GG (sem pastas de categoria).
 * Categoria na BD fica null.
 */
function isSizeOnlyAtRoot(folders: { name: string }[]): boolean {
  if (folders.length === 0) return false;
  return folders.every((f) => sizeFromFolderName(f.name) !== null);
}

function isImportableImageFile(
  name: string,
  mime: string | null | undefined
): boolean {
  if (IMAGE_FILENAME_EXT.test(name)) return true;
  if (mime && mime.startsWith("image/")) return true;
  return false;
}

async function listFolders(
  drive: drive_v3.Drive,
  parentId: string,
  listOptions: DriveListOptions
): Promise<{ id: string; name: string }[]> {
  const folders: { id: string; name: string }[] = [];
  let pageToken: string | undefined;
  let sawExtraPages = false;
  do {
    const res = await drive.files.list({
      q: `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "nextPageToken, files(id, name)",
      pageSize: 100,
      pageToken,
      ...listOptions,
    });
    for (const f of res.data.files ?? []) {
      if (f.id && f.name) folders.push({ id: f.id, name: f.name });
    }
    if (res.data.nextPageToken) sawExtraPages = true;
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  // #region agent log
  fetch(
    "http://127.0.0.1:7446/ingest/24af6af5-b59d-45ad-acbf-6e5e9842079c",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "6883b3",
      },
      body: JSON.stringify({
        sessionId: "6883b3",
        runId: "import",
        hypothesisId: "H-folder-page",
        location: "drive-import.ts:listFolders",
        message: "folders_list",
        data: {
          parentId,
          folderCount: folders.length,
          paginatedPastFirstPage: sawExtraPages,
        },
        timestamp: Date.now(),
      }),
    }
  ).catch(() => {});
  // #endregion

  return folders;
}

async function listImageFiles(
  drive: drive_v3.Drive,
  folderId: string,
  listOptions: DriveListOptions
): Promise<{ id: string; name: string; modifiedTime?: string | null }[]> {
  /**
   * Lista todos os ficheiros não-pasta (paginação completa) e filtra imagens.
   * O Drive muitas vezes marca JPEG/HEIC como `application/octet-stream`; a query só
   * `mimeType contains 'image/'` omitia esses ficheiros (import “parava” a meio).
   */
  const out: { id: string; name: string; modifiedTime?: string | null }[] = [];
  const seen = new Set<string>();
  let pageToken: string | undefined;
  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder' and mimeType != 'application/vnd.google-apps.shortcut'`,
      fields: "nextPageToken, files(id, name, mimeType, modifiedTime)",
      pageSize: 200,
      pageToken,
      ...listOptions,
    });
    for (const f of res.data.files ?? []) {
      if (!f.id || !f.name) continue;
      if (!isImportableImageFile(f.name, f.mimeType ?? null)) continue;
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      out.push({
        id: f.id,
        name: f.name,
        modifiedTime: f.modifiedTime ?? null,
      });
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  // #region agent log
  fetch(
    "http://127.0.0.1:7446/ingest/24af6af5-b59d-45ad-acbf-6e5e9842079c",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "6883b3",
      },
      body: JSON.stringify({
        sessionId: "6883b3",
        runId: "import",
        hypothesisId: "H-mime",
        location: "drive-import.ts:listImageFiles",
        message: "image_files_filtered",
        data: {
          folderId,
          importableImageCount: out.length,
        },
        timestamp: Date.now(),
      }),
    }
  ).catch(() => {});
  // #endregion

  return out;
}

async function pushRowsFromImageFolder(
  drive: drive_v3.Drive,
  folderId: string,
  size: ProductSize,
  category: string | null,
  listOptions: DriveListOptions,
  rows: DriveImportRow[]
): Promise<void> {
  const files = await listImageFiles(drive, folderId, listOptions);
  const defaultStock = defaultInitialStockFromEnv();

  let parseOk = 0;
  let parseFail = 0;

  for (const file of files) {
    const parsed = parseProductFileName(file.name);
    if (!parsed) {
      parseFail++;
      continue;
    }
    parseOk++;

    const initial = parsed.initialStockFromFilename ?? defaultStock;
    const sku = buildSku(file.id, size, parsed.brand, parsed.color);
    const status = initial <= 0 ? "ESGOTADO" : "ATIVO";
    const modifiedIso =
      file.modifiedTime ?? new Date().toISOString();

    rows.push({
      drive_file_id: file.id,
      drive_modified_at: modifiedIso,
      drive_image_url: driveThumbnailUrl(file.id, 640),
      original_file_name: stripImageExtension(file.name),
      category,
      brand: parsed.brand,
      color: parsed.color,
      size,
      stock: initial,
      sku,
      status,
    });
  }

  // #region agent log
  fetch(
    "http://127.0.0.1:7446/ingest/24af6af5-b59d-45ad-acbf-6e5e9842079c",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "6883b3",
      },
      body: JSON.stringify({
        sessionId: "6883b3",
        runId: "import",
        hypothesisId: "H-parse",
        location: "drive-import.ts:pushRowsFromImageFolder",
        message: "parse_counts",
        data: {
          folderId,
          size,
          category: category ?? "(null)",
          totalListedImages: files.length,
          parseOk,
          parseFail,
        },
        timestamp: Date.now(),
      }),
    }
  ).catch(() => {});
  // #endregion
}

/**
 * Pasta principal do catálogo (ID/link configurado) → cada subpasta **é uma categoria**
 * (ex.: BERMUDAS ELASTANO, CAMISETAS STREETWEAR). Dentro de cada uma: pastas **M**, **G**, **GG** com as fotos.
 *
 * Exceção rara: se na raiz só existirem M, G e GG (sem nomes de categoria), importa com `category` null.
 */
export async function fetchDriveProductRows(
  rootFolderId: string
): Promise<DriveImportRow[]> {
  const auth = await getDriveAuth();
  await ensureDriveAuthorized(auth);
  const drive = google.drive({ version: "v3", auth });
  const listOptions = getDriveListOptionsFromEnv();

  const topFolders = await listFolders(drive, rootFolderId, listOptions);
  const rows: DriveImportRow[] = [];

  if (isSizeOnlyAtRoot(topFolders)) {
    for (const folder of topFolders) {
      const size = sizeFromFolderName(folder.name);
      if (!size) continue;
      await pushRowsFromImageFolder(
        drive,
        folder.id,
        size,
        null,
        listOptions,
        rows
      );
    }
    return rows;
  }

  for (const catFolder of topFolders) {
    if (sizeFromFolderName(catFolder.name)) {
      continue;
    }
    const categoryLabel = catFolder.name.trim();
    const sizeFolders = await listFolders(drive, catFolder.id, listOptions);

    for (const sf of sizeFolders) {
      const size = sizeFromFolderName(sf.name);
      if (!size) continue;

      await pushRowsFromImageFolder(
        drive,
        sf.id,
        size,
        categoryLabel,
        listOptions,
        rows
      );
    }
  }

  return rows;
}

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
import {
  parseSizeFolder,
  parseSizeStockGrid,
  variantDriveFileId,
} from "@/lib/size-stock-name";

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
  return parseSizeFolder(name)?.size ?? null;
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
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

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

  return out;
}

function pushProductRow(
  rows: DriveImportRow[],
  file: { id: string; name: string; modifiedTime?: string | null },
  opts: {
    driveFileId: string;
    size: ProductSize;
    category: string | null;
    brand: string;
    color: string;
    stock: number;
    originalFileName: string;
  }
): void {
  const status = opts.stock <= 0 ? "ESGOTADO" : "ATIVO";
  rows.push({
    drive_file_id: opts.driveFileId,
    drive_modified_at: file.modifiedTime ?? new Date().toISOString(),
    drive_image_url: driveThumbnailUrl(file.id, 640),
    original_file_name: opts.originalFileName,
    category: opts.category,
    brand: opts.brand,
    color: opts.color,
    size: opts.size,
    stock: opts.stock,
    sku: buildSku(opts.driveFileId, opts.size, opts.brand, opts.color),
    status,
  });
}

async function pushRowsFromImageFolder(
  drive: drive_v3.Drive,
  folderId: string,
  size: ProductSize,
  category: string | null,
  listOptions: DriveListOptions,
  rows: DriveImportRow[],
  folderStock: number | null
): Promise<void> {
  const files = await listImageFiles(drive, folderId, listOptions);
  const defaultStock = defaultInitialStockFromEnv();
  const numericSize = /^\d+$/.test(size);

  for (const file of files) {
    if (parseSizeStockGrid(file.name)) continue;

    const parsed = parseProductFileName(file.name);
    const brand = parsed?.brand ?? (numericSize ? category?.trim() || "MODELO" : "");
    const color = parsed?.color ?? "";
    if (!brand) continue;

    const initial =
      folderStock ??
      parsed?.initialStockFromFilename ??
      defaultStock;
    pushProductRow(rows, file, {
      driveFileId: file.id,
      size,
      category,
      brand,
      color,
      stock: initial,
      originalFileName: stripImageExtension(file.name),
    });
  }
}

/**
 * Foto única com vários tamanhos no nome (`38-4/40-5` ou `NIKE PRETO 38-4/40-5`).
 * Cada tamanho vira uma linha, todas com a mesma imagem.
 */
async function pushRowsFromSizeGridFiles(
  drive: drive_v3.Drive,
  folderId: string,
  category: string | null,
  listOptions: DriveListOptions,
  rows: DriveImportRow[]
): Promise<void> {
  const files = await listImageFiles(drive, folderId, listOptions);
  const fallbackBrand = category?.trim() || "MODELO";

  for (const file of files) {
    const grid = parseSizeStockGrid(file.name);
    if (!grid) continue;

    let brand = fallbackBrand;
    let color = "";
    if (grid.labelPrefix) {
      const parsed = parseProductFileName(grid.labelPrefix);
      if (parsed) {
        brand = parsed.brand;
        color = parsed.color;
      } else {
        brand = grid.labelPrefix;
      }
    }

    const originalFileName = stripImageExtension(file.name);
    for (const cell of grid.cells) {
      if (cell.stock <= 0) continue;
      pushProductRow(rows, file, {
        driveFileId: variantDriveFileId(file.id, cell.size),
        size: cell.size,
        category,
        brand,
        color,
        stock: cell.stock,
        originalFileName,
      });
    }
  }
}

function dedupeDriveRows(rows: DriveImportRow[]): DriveImportRow[] {
  const byId = new Map<string, DriveImportRow>();
  for (const row of rows) {
    if (byId.has(row.drive_file_id)) continue;
    byId.set(row.drive_file_id, row);
  }
  return Array.from(byId.values());
}

/**
 * Pasta principal do catálogo (ID/link configurado) → cada subpasta **é uma categoria**
 * (ex.: BERMUDAS ELASTANO, CAMISETAS STREETWEAR). Dentro de cada uma: pastas **M**, **G**, **GG**
 * ou numeradas (`38`, `38-4`) com as fotos.
 *
 * Calça e tênis: a foto fica direto na categoria e o nome lista os tamanhos
 * (`38-4/40-5/42-4`). Cada tamanho vira um produto com a mesma imagem.
 *
 * Exceção rara: se na raiz só existirem pastas de tamanho, importa com `category` null.
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
      const parsedFolder = parseSizeFolder(folder.name);
      if (!parsedFolder) continue;
      await pushRowsFromImageFolder(
        drive,
        folder.id,
        parsedFolder.size,
        null,
        listOptions,
        rows,
        parsedFolder.stock
      );
    }
    return dedupeDriveRows(rows);
  }

  for (const catFolder of topFolders) {
    if (sizeFromFolderName(catFolder.name)) {
      continue;
    }
    const categoryLabel = catFolder.name.trim();
    const sizeFolders = await listFolders(drive, catFolder.id, listOptions);

    for (const sf of sizeFolders) {
      const parsedFolder = parseSizeFolder(sf.name);
      if (!parsedFolder) continue;

      await pushRowsFromImageFolder(
        drive,
        sf.id,
        parsedFolder.size,
        categoryLabel,
        listOptions,
        rows,
        parsedFolder.stock
      );
    }

    await pushRowsFromSizeGridFiles(
      drive,
      catFolder.id,
      categoryLabel,
      listOptions,
      rows
    );
  }

  return dedupeDriveRows(rows);
}

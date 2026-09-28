import { stripImageExtension } from "@/lib/parse-filename";

/** Separa o ID real do Drive do tamanho: `arquivo~38`. */
const VARIANT_MARK = "~";

const SIZE_QTY = /^(\d{2})-(\d+)$/;

export type SizeStockCell = {
  size: string;
  stock: number;
};

export type SizeStockGrid = {
  /** Palavras antes do primeiro tamanho, quando o ficheiro traz marca e cor. */
  labelPrefix: string | null;
  cells: SizeStockCell[];
};

export function variantDriveFileId(driveFileId: string, size: string): string {
  return `${driveFileId}${VARIANT_MARK}${size}`;
}

/** ID do ficheiro no Drive. Variantes `id~38` voltam ao ficheiro original. */
export function sourceDriveFileId(storedId: string): string {
  const mark = storedId.lastIndexOf(VARIANT_MARK);
  if (mark <= 0) return storedId;
  const size = storedId.slice(mark + 1);
  if (!/^\d{2}$/.test(size)) return storedId;
  return storedId.slice(0, mark);
}

export function isSizeVariantDriveId(storedId: string): boolean {
  return sourceDriveFileId(storedId) !== storedId;
}

/**
 * Nome no padrão `38-4/40-5` ou `NIKE PRETO 38-4/40-5`.
 * Devolve null se alguma parte não for tamanho-quantidade.
 */
export function parseSizeStockGrid(fileName: string): SizeStockGrid | null {
  const base = stripImageExtension(fileName).trim();
  const parts = base
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;

  let labelPrefix: string | null = null;
  const cells: SizeStockCell[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    const exact = part.match(SIZE_QTY);
    if (exact) {
      const size = exact[1]!;
      const stock = Number.parseInt(exact[2]!, 10);
      if (!Number.isFinite(stock) || stock < 0 || seen.has(size)) return null;
      seen.add(size);
      cells.push({ size, stock });
      continue;
    }

    if (i !== 0 || cells.length > 0) return null;
    const lead = part.match(/^(.*\S)\s+(\d{2})-(\d+)$/);
    if (!lead) return null;
    labelPrefix = lead[1]!.trim();
    const size = lead[2]!;
    const stock = Number.parseInt(lead[3]!, 10);
    if (!labelPrefix || !Number.isFinite(stock) || stock < 0 || seen.has(size)) {
      return null;
    }
    seen.add(size);
    cells.push({ size, stock });
  }

  if (cells.length === 0) return null;
  return { labelPrefix, cells };
}

/** Regrava o nome só com tamanhos que ainda têm peça (`38-4/40-2`). */
export function formatSizeStockGrid(
  cells: SizeStockCell[],
  labelPrefix?: string | null
): string {
  const body = cells
    .filter((cell) => cell.stock > 0)
    .sort((a, b) => Number(a.size) - Number(b.size))
    .map((cell) => `${cell.size}-${cell.stock}`)
    .join("/");
  if (!body) return "";
  const prefix = labelPrefix?.trim();
  return prefix ? `${prefix} ${body}` : body;
}

/**
 * Pasta de tamanho: `M`, `G`, `GG`, `38` ou `38-4` (tamanho e, se houver, estoque).
 */
export function parseSizeFolder(
  name: string
): { size: string; stock: number | null } | null {
  const key = name.trim();
  const lower = key.toLowerCase();
  if (lower === "m" || lower === "g" || lower === "gg") {
    return { size: lower === "gg" ? "GG" : lower.toUpperCase(), stock: null };
  }
  const numbered = key.match(/^(\d{2})(?:-(\d+))?$/);
  if (!numbered) return null;
  const stock =
    numbered[2] != null ? Number.parseInt(numbered[2], 10) : null;
  if (stock != null && (!Number.isFinite(stock) || stock < 0)) return null;
  return { size: numbered[1]!, stock };
}

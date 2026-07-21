import type { ParsedFileName } from "@/types";

/** Extensões de imagem aceites no import (inclui ficheiros que o Drive classifica como octet-stream). */
export const IMAGE_FILENAME_EXT = /\.(jpe?g|png|gif|webp|bmp|heic|avif|tiff?)$/i;

const IMAGE_EXT = IMAGE_FILENAME_EXT;

/** Remove extensão de imagem comum do nome exibido/importado. */
export function stripImageExtension(name: string): string {
  return name.replace(IMAGE_EXT, "").trim();
}

/**
 * Padrão: MARCA … COR [número opcional]
 * - Mínimo: MARCA COR (2 palavras; última não é só número).
 * - Se o último token for um inteiro ≥ 0 e houver ≥ 3 tokens: penúltimo = cor, resto = marca; último = quantidade derivada do nome.
 * - Sem esse sufixo numérico (ou só 2 tokens): usa `DEFAULT_INITIAL_STOCK` (env), não um número no nome.
 *
 * Sincronização com o Drive (`syncProductsFromDriveFolder` via API admin, com
 * `preserveExistingStock: false`): cada import faz upsert e **volta a gravar**
 * `stock` na BD com o valor acima. Ou seja, alterar o número no nome do ficheiro
 * no Drive e sincronizar atualiza o stock na app para esse número (regras de parsing
 * aplicadas). Entre syncs, vendas/pedidos podem alterar o stock na BD; um novo
 * sync completo repõe-o de acordo com o nome no Drive, salvo futuras opções que
 * preservem stock existente.
 */
export function parseProductFileName(fileName: string): ParsedFileName | null {
  const base = stripImageExtension(fileName);
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;

  const last = parts[parts.length - 1]!;
  const lastIsStock = /^\d+$/.test(last);
  const stockNum = lastIsStock ? Number.parseInt(last, 10) : NaN;

  if (lastIsStock && parts.length >= 3) {
    if (!Number.isFinite(stockNum) || stockNum < 0) return null;
    const color = parts[parts.length - 2]!;
    const brand = parts.slice(0, -2).join(" ").trim();
    if (!brand) return null;
    return {
      brand,
      color,
      initialStockFromFilename: stockNum,
      baseLabel: base,
    };
  }

  const color = last;
  const brand = parts.slice(0, -1).join(" ").trim();
  if (!brand) return null;

  return {
    brand,
    color,
    initialStockFromFilename: null,
    baseLabel: base,
  };
}

export function defaultInitialStockFromEnv(): number {
  const raw = process.env.DEFAULT_INITIAL_STOCK?.trim();
  const n = raw ? Number.parseInt(raw, 10) : 1;
  return Number.isFinite(n) && n >= 0 ? n : 1;
}

export function buildSku(
  driveFileId: string,
  size: string,
  brand: string,
  color: string
): string {
  const slug = `${brand}-${color}-${size}`
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
  const idPart = driveFileId.replace(/[^a-zA-Z0-9]/g, "").slice(-8);
  return `SW-${slug || "ITEM"}-${idPart}`;
}

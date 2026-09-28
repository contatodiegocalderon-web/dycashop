/** Onde a calça jogador aparece na navegação do Jeans. O tamanho do produto não muda. */
const JEANS_NAV_GROUP: Record<string, string> = {
  "38": "M",
  "40": "M",
  "42": "G",
  "44": "G",
  "46": "GG",
};

export function isJeansCategory(category: string | null | undefined): boolean {
  return (category ?? "").trim().toLocaleUpperCase("pt-BR") === "JEANS";
}

/**
 * Grupo de navegação no Jeans: 38 e 40 entram com M, 42 e 44 com G, 46 com GG.
 * O tamanho gravado e o do card continuam 38, 40, 42, 44 ou 46.
 */
export function jeansCatalogSize(
  category: string | null | undefined,
  size: string
): string {
  const trimmed = size.trim();
  if (!isJeansCategory(category)) return trimmed;
  return JEANS_NAV_GROUP[trimmed] ?? trimmed;
}

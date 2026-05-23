import type { Product, ProductSize } from "@/types";

/**
 * Assistente em 3 passos na página `/categoria/[slug]`.
 * Para voltar ao comportamento anterior: defina `false` e faça deploy.
 */
export const ENABLE_GUIDED_CATEGORY_WIZARD = true;

export const WIZARD_SIZE_ORDER: ProductSize[] = ["M", "G", "GG"];

export function isWizardCatalogProduct(p: Product): boolean {
  return p.status === "ATIVO" && p.stock > 0;
}

export function wizardSizeOptions(products: Product[]): ProductSize[] {
  const available = new Set<ProductSize>();
  for (const p of products) {
    if (isWizardCatalogProduct(p)) available.add(p.size);
  }
  return WIZARD_SIZE_ORDER.filter((s) => available.has(s));
}

export function wizardColorOptions(
  products: Product[],
  size: ProductSize
): string[] {
  const s = new Set<string>();
  for (const p of products) {
    if (!isWizardCatalogProduct(p) || p.size !== size) continue;
    const c = p.color?.trim();
    if (c) s.add(c);
  }
  return Array.from(s).sort((a, b) =>
    a.localeCompare(b, "pt", { sensitivity: "base" })
  );
}

export function wizardBrandOptions(
  products: Product[],
  size: ProductSize,
  colors: string[]
): string[] {
  const colorSet = new Set(colors.map((c) => c.trim()).filter(Boolean));
  if (colorSet.size === 0) return [];

  const s = new Set<string>();
  for (const p of products) {
    if (!isWizardCatalogProduct(p) || p.size !== size) continue;
    const c = p.color?.trim();
    if (!c || !colorSet.has(c)) continue;
    const b = p.brand?.trim();
    if (b) s.add(b);
  }
  return Array.from(s).sort((a, b) =>
    a.localeCompare(b, "pt", { sensitivity: "base" })
  );
}

export type GuidedWizardSelection = {
  size: ProductSize;
  colors: string[];
  brands: string[];
};

export type WizardGuidedFilter = {
  colors: string[];
  brands: string[];
};

export function filterProductsByWizardSelection(
  products: Product[],
  filter: WizardGuidedFilter
): Product[] {
  const colorSet = new Set(filter.colors.map((c) => c.trim()));
  const brandSet = new Set(filter.brands.map((b) => b.trim()));
  return products.filter((p) => {
    const c = p.color?.trim() ?? "";
    const b = p.brand?.trim() ?? "";
    return colorSet.has(c) && brandSet.has(b);
  });
}

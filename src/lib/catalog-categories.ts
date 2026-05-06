import { createClient } from "@supabase/supabase-js";
import { productPublicImageUrl } from "@/lib/product-image-url";
import { isMissingSchemaColumnError } from "@/lib/schema-errors";

export type CategorySummary = {
  slug: string;
  label: string;
  count: number;
  /** URLs prontas para `<img src>` (Storage ou proxy Drive). */
  previewImageUrls: string[];
  /** Capa definida no admin (substitui preview automático na home). */
  coverImageUrl: string | null;
};

function supabaseAnon() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

/** Gera slug estável para URL a partir do rótulo da pasta no Drive. */
export function categorySlugFromLabel(label: string): string {
  const base = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
  return base || "categoria";
}

const PREVIEW_LIMIT = 5;
const PAGE_SIZE = 1000;

/**
 * Valor default da coluna `display_order` na migração — tratado como «sem ordem personalizada»,
 * para não empatar todas as categorias no mesmo número (senão ↑/↓ não altera nada).
 */
export const DISPLAY_ORDER_DEFAULT_SENTINEL = 100000;

/**
 * Ordem na home: `display_order` da BD (menor primeiro); sem valor ou sentinela usa posição alfabética ×100.
 */
export function sortCategoryLabelsForCatalog(
  labels: string[],
  orderFromDb: Map<string, number | null | undefined>
): string[] {
  const alpha = [...labels].sort((a, b) => a.localeCompare(b, "pt"));
  const alphaIdx = new Map(alpha.map((l, i) => [l, i]));
  return [...labels].sort((a, b) => {
    const rawA = orderFromDb.get(a);
    const rawB = orderFromDb.get(b);
    const va =
      rawA != null &&
      Number.isFinite(Number(rawA)) &&
      Number(rawA) !== DISPLAY_ORDER_DEFAULT_SENTINEL
        ? Number(rawA)
        : (alphaIdx.get(a)! + 1) * 100;
    const vb =
      rawB != null &&
      Number.isFinite(Number(rawB)) &&
      Number(rawB) !== DISPLAY_ORDER_DEFAULT_SENTINEL
        ? Number(rawB)
        : (alphaIdx.get(b)! + 1) * 100;
    if (va !== vb) return va - vb;
    return a.localeCompare(b, "pt");
  });
}

/**
 * Categorias = valor exacto de `products.category` (nome da pasta no Drive).
 * Pré-visualizações: query **por categoria** (não reutiliza imagens entre pastas).
 */
export async function getCatalogCategories(): Promise<CategorySummary[]> {
  const supabase = supabaseAnon();

  const allRows: { category: string | null }[] = [];
  let offset = 0;
  while (true) {
    const { data: page, error: countErr } = await supabase
      .from("products")
      .select("category")
      .range(offset, offset + PAGE_SIZE - 1);

    if (countErr) {
      throw new Error(countErr.message);
    }

    const chunk = (page ?? []) as { category: string | null }[];
    allRows.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  const countMap = new Map<string, number>();
  for (const row of allRows ?? []) {
    const label =
      row.category != null && String(row.category).trim() !== ""
        ? String(row.category).trim()
        : "Sem categoria";
    countMap.set(label, (countMap.get(label) ?? 0) + 1);
  }

  const labelKeys = Array.from(countMap.keys());

  const coverMap = new Map<string, string | null>();
  const orderMap = new Map<string, number | null | undefined>();

  const full = await supabase
    .from("category_showcase_settings")
    .select("category_label, catalog_cover_image_url, display_order");

  if (full.error && isMissingSchemaColumnError(full.error)) {
    const minimal = await supabase
      .from("category_showcase_settings")
      .select("category_label");
    if (minimal.error) {
      throw new Error(minimal.error.message);
    }
  } else if (full.error) {
    throw new Error(full.error.message);
  } else {
    for (const r of full.data ?? []) {
      const row = r as {
        category_label?: string | null;
        catalog_cover_image_url?: string | null;
        display_order?: number | null;
      };
      const lab =
        row.category_label != null && String(row.category_label).trim() !== ""
          ? String(row.category_label).trim()
          : "";
      if (!lab) continue;
      coverMap.set(lab, row.catalog_cover_image_url?.trim() || null);
      const ord = row.display_order;
      orderMap.set(
        lab,
        typeof ord === "number" && ord !== DISPLAY_ORDER_DEFAULT_SENTINEL
          ? ord
          : null
      );
    }
  }

  const sortedLabels = sortCategoryLabelsForCatalog(labelKeys, orderMap);

  const usedSlugs = new Set<string>();
  const out: CategorySummary[] = [];

  for (const label of sortedLabels) {
    let previewQuery = supabase
      .from("products")
      .select("drive_file_id, image_url, catalog_image_url")
      .order("updated_at", { ascending: false })
      .limit(PREVIEW_LIMIT * 3);

    if (label === "Sem categoria") {
      previewQuery = previewQuery.is("category", null);
    } else {
      previewQuery = previewQuery.eq("category", label);
    }

    const { data: prevRows, error: prevErr } = await previewQuery;
    if (prevErr) {
      throw new Error(prevErr.message);
    }

    const seen = new Set<string>();
    const previewImageUrls: string[] = [];
    for (const p of prevRows ?? []) {
      const id = p.drive_file_id as string;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const row = p as {
        drive_file_id: string;
        image_url?: string | null;
        catalog_image_url?: string | null;
      };
      previewImageUrls.push(
        productPublicImageUrl({ ...row, drive_file_id: id }, 480)
      );
      if (previewImageUrls.length >= PREVIEW_LIMIT) break;
    }

    let slug = categorySlugFromLabel(label);
    if (usedSlugs.has(slug)) {
      let i = 2;
      while (usedSlugs.has(`${slug}-${i}`)) i += 1;
      slug = `${slug}-${i}`;
    }
    usedSlugs.add(slug);

    out.push({
      slug,
      label,
      count: countMap.get(label) ?? 0,
      previewImageUrls,
      coverImageUrl: coverMap.get(label) ?? null,
    });
  }

  return out;
}

function normalizeSlugParam(slug: unknown): string {
  const raw = typeof slug === "string" ? slug.trim() : "";
  if (!raw) return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * Resolve `/categoria/[slug]` para o resumo da pasta.
 * `preloaded` evita segunda query quando a página já carregou a lista completa.
 */
export async function getCategoryBySlug(
  slug: string | undefined,
  preloaded?: CategorySummary[]
): Promise<CategorySummary | null> {
  const normalized = normalizeSlugParam(slug);
  if (!normalized) return null;

  const all = preloaded ?? (await getCatalogCategories());

  const exact =
    all.find((c) => c.slug === normalized) ??
    all.find((c) => c.slug.toLowerCase() === normalized.toLowerCase());

  if (exact) return exact;

  /** Slug antigo ou digitado à mão: tenta casar pelo slug derivado do rótulo. */
  return (
    all.find(
      (c) => categorySlugFromLabel(c.label) === normalized.toLowerCase()
    ) ?? null
  );
}

import { createClient } from "@supabase/supabase-js";
import { isMissingSchemaColumnError } from "@/lib/schema-errors";

export type WholesaleTier = {
  minQty: number;
  maxQty: number | null;
  price: number;
};

export type CategoryShowcaseConfig = {
  videoUrl: string | null;
  videoPoster?: string;
  wholesaleTiers: WholesaleTier[];
  /** Preço unitário de varejo (< 5 peças no carrinho). */
  retailPricePerPiece?: number | null;
  /** Banner largo no topo da página da categoria (`catalog_cover_image_url`). */
  catalogCoverImageUrl?: string | null;
};

export type CategoryPricingBatch = {
  wholesaleTiers: WholesaleTier[];
  retailPricePerPiece: number | null;
};

export const DEFAULT_SHOWCASE: CategoryShowcaseConfig = {
  videoUrl: null,
  wholesaleTiers: [
    { minQty: 3, maxQty: 5, price: 39.9 },
    { minQty: 6, maxQty: 11, price: 36.9 },
    { minQty: 12, maxQty: null, price: 33.9 },
  ],
};

function supabaseAnon() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

export function sanitizeWholesaleTiers(raw: unknown): WholesaleTier[] {
  const tiersRaw = Array.isArray(raw) ? raw : [];
  const tiers = tiersRaw
    .map((t) => normalizeTier(t))
    .filter((t): t is WholesaleTier => t != null);
  return tiers.length > 0 ? tiers : DEFAULT_SHOWCASE.wholesaleTiers;
}

function normalizeTier(raw: unknown): WholesaleTier | null {
  const t = raw as { minQty?: unknown; maxQty?: unknown; price?: unknown };
  const minQty = Number(t.minQty);
  const maxQty = t.maxQty == null ? null : Number(t.maxQty);
  const price = Number(t.price);
  if (!Number.isFinite(minQty) || minQty < 1) return null;
  if (maxQty != null && (!Number.isFinite(maxQty) || maxQty < minQty)) return null;
  if (!Number.isFinite(price) || price < 0) return null;
  return { minQty, maxQty, price };
}

function normalizeRetailPrice(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function normalizeShowcaseRow(row: {
  video_url?: string | null;
  video_poster_url?: string | null;
  wholesale_tiers?: unknown;
  retail_price_per_piece?: unknown;
  catalog_cover_image_url?: string | null;
}): CategoryShowcaseConfig {
  const tiersRaw = Array.isArray(row.wholesale_tiers) ? row.wholesale_tiers : [];
  const tiers = tiersRaw
    .map((t) => normalizeTier(t))
    .filter((t): t is WholesaleTier => t != null);
  return {
    videoUrl: row.video_url?.trim() || null,
    videoPoster: row.video_poster_url?.trim() || undefined,
    wholesaleTiers: tiers.length > 0 ? tiers : DEFAULT_SHOWCASE.wholesaleTiers,
    retailPricePerPiece: normalizeRetailPrice(row.retail_price_per_piece),
    catalogCoverImageUrl: row.catalog_cover_image_url?.trim() || null,
  };
}

/** ILIKE sem `%`: igualdade sem distinguir maiúsculas; escapa metacaracteres. */
function ilikeExactPattern(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export async function getCategoryShowcaseConfig(
  categoryLabel: string
): Promise<CategoryShowcaseConfig> {
  const label = categoryLabel.trim();
  if (!label) return DEFAULT_SHOWCASE;
  const supabase = supabaseAnon();

  async function pickRow(cols: string) {
    const exact = await supabase
      .from("category_showcase_settings")
      .select(cols)
      .eq("category_label", label)
      .maybeSingle();
    if (exact.data) return exact;
    if (exact.error) return exact;
    return supabase
      .from("category_showcase_settings")
      .select(cols)
      .ilike("category_label", ilikeExactPattern(label))
      .maybeSingle();
  }

  let q = await pickRow(
    "video_url, video_poster_url, wholesale_tiers, retail_price_per_piece, catalog_cover_image_url"
  );

  if (q.error && isMissingSchemaColumnError(q.error)) {
    q = await pickRow("video_url, video_poster_url, wholesale_tiers, catalog_cover_image_url");
  }

  if (q.error && isMissingSchemaColumnError(q.error)) {
    q = await pickRow("video_url, video_poster_url, wholesale_tiers");
  }

  const row = q.data;
  if (q.error || row == null || typeof row !== "object") {
    return DEFAULT_SHOWCASE;
  }
  return normalizeShowcaseRow(
    row as {
      video_url?: string | null;
      video_poster_url?: string | null;
      wholesale_tiers?: unknown;
      retail_price_per_piece?: unknown;
      catalog_cover_image_url?: string | null;
    }
  );
}

/** Faixas de atacado e preço varejo para várias categorias. */
export async function getCategoryPricingBatch(
  categoryLabels: string[]
): Promise<Record<string, CategoryPricingBatch>> {
  const unique = Array.from(
    new Set(
      categoryLabels
        .map((l) => l.trim())
        .filter((l) => l.length > 0)
    )
  );
  if (!unique.length) return {};

  const supabase = supabaseAnon();
  let data: Array<{
    category_label?: string;
    wholesale_tiers?: unknown;
    retail_price_per_piece?: unknown;
  }> | null = null;

  const full = await supabase
    .from("category_showcase_settings")
    .select("category_label, wholesale_tiers, retail_price_per_piece");
  if (!full.error) {
    data = full.data ?? [];
  } else if (isMissingSchemaColumnError(full.error)) {
    const legacy = await supabase
      .from("category_showcase_settings")
      .select("category_label, wholesale_tiers");
    if (legacy.error) return buildDefaultPricingBatch(unique);
    data = legacy.data ?? [];
  } else {
    return buildDefaultPricingBatch(unique);
  }

  const byExact = new Map<string, CategoryPricingBatch>();
  const byLower = new Map<string, CategoryPricingBatch>();
  for (const row of data) {
    const rawLabel = String(row.category_label ?? "").trim();
    if (!rawLabel) continue;
    const entry: CategoryPricingBatch = {
      wholesaleTiers: sanitizeWholesaleTiers(row.wholesale_tiers),
      retailPricePerPiece: normalizeRetailPrice(row.retail_price_per_piece),
    };
    byExact.set(rawLabel, entry);
    byLower.set(rawLabel.toLowerCase(), entry);
  }

  const result: Record<string, CategoryPricingBatch> = {};
  for (const label of unique) {
    result[label] =
      byExact.get(label) ??
      byLower.get(label.toLowerCase()) ?? {
        wholesaleTiers: DEFAULT_SHOWCASE.wholesaleTiers,
        retailPricePerPiece: null,
      };
  }
  return result;
}

function buildDefaultPricingBatch(
  labels: string[]
): Record<string, CategoryPricingBatch> {
  const result: Record<string, CategoryPricingBatch> = {};
  for (const label of labels) {
    result[label] = {
      wholesaleTiers: DEFAULT_SHOWCASE.wholesaleTiers,
      retailPricePerPiece: null,
    };
  }
  return result;
}

/** @deprecated Use getCategoryPricingBatch */
export async function getCategoryWholesaleTiersBatch(
  categoryLabels: string[]
): Promise<Record<string, WholesaleTier[]>> {
  const batch = await getCategoryPricingBatch(categoryLabels);
  const result: Record<string, WholesaleTier[]> = {};
  for (const [label, cfg] of Object.entries(batch)) {
    result[label] = cfg.wholesaleTiers;
  }
  return result;
}

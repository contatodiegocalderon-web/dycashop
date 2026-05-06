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
  /** Banner largo no topo da página da categoria (`catalog_cover_image_url`). */
  catalogCoverImageUrl?: string | null;
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

function normalizeShowcaseRow(row: {
  video_url?: string | null;
  video_poster_url?: string | null;
  wholesale_tiers?: unknown;
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
    catalogCoverImageUrl: row.catalog_cover_image_url?.trim() || null,
  };
}

export async function getCategoryShowcaseConfig(
  categoryLabel: string
): Promise<CategoryShowcaseConfig> {
  const label = categoryLabel.trim();
  if (!label) return DEFAULT_SHOWCASE;
  const supabase = supabaseAnon();

  let q = await supabase
    .from("category_showcase_settings")
    .select(
      "video_url, video_poster_url, wholesale_tiers, catalog_cover_image_url"
    )
    .eq("category_label", label)
    .maybeSingle();

  if (q.error && isMissingSchemaColumnError(q.error)) {
    q = await supabase
      .from("category_showcase_settings")
      .select("video_url, video_poster_url, wholesale_tiers")
      .eq("category_label", label)
      .maybeSingle();
  }

  const { data, error } = q;
  if (error || !data) return DEFAULT_SHOWCASE;
  return normalizeShowcaseRow(data);
}

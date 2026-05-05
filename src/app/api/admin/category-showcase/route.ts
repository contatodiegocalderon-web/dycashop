import { NextRequest, NextResponse } from "next/server";
import { assertAdmin, assertOwnerAccess } from "@/lib/admin-auth";
import { DEFAULT_SHOWCASE, type WholesaleTier } from "@/lib/category-showcase";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
const PAGE_SIZE = 1000;

type ShowcaseRow = {
  category_label: string;
  video_url: string | null;
  video_poster_url: string | null;
  wholesale_tiers: WholesaleTier[];
};

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

function sanitizeTiers(raw: unknown): WholesaleTier[] {
  if (!Array.isArray(raw)) return DEFAULT_SHOWCASE.wholesaleTiers;
  const tiers = raw
    .map((t) => normalizeTier(t))
    .filter((t): t is WholesaleTier => t != null);
  return tiers.length > 0 ? tiers : DEFAULT_SHOWCASE.wholesaleTiers;
}

async function loadCatalogCategoryLabels(admin: ReturnType<typeof createAdminClient>) {
  const labels = new Set<string>();
  let offset = 0;
  while (true) {
    const { data, error } = await admin
      .from("products")
      .select("category")
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const chunk = (data ?? []) as { category: string | null }[];
    for (const row of chunk) {
      const label =
        row.category != null && String(row.category).trim() !== ""
          ? String(row.category).trim()
          : "Sem categoria";
      labels.add(label);
    }
    if (chunk.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  if (labels.size === 0) labels.add("Sem categoria");
  return Array.from(labels).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export async function GET(request: NextRequest) {
  try {
    await assertAdmin(request);
  } catch (e) {
    const status = (e as Error & { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro" },
      { status }
    );
  }

  try {
    const admin = createAdminClient();
    const labels = await loadCatalogCategoryLabels(admin);
    const { data, error } = await admin
      .from("category_showcase_settings")
      .select("category_label, video_url, video_poster_url, wholesale_tiers");
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const map = new Map<string, ShowcaseRow>();
    for (const row of data ?? []) {
      const label = String(row.category_label ?? "").trim();
      if (!label) continue;
      map.set(label, {
        category_label: label,
        video_url: row.video_url?.trim() || null,
        video_poster_url: row.video_poster_url?.trim() || null,
        wholesale_tiers: sanitizeTiers(row.wholesale_tiers),
      });
    }
    const rows = labels.map((category_label) => {
      const found = map.get(category_label);
      return (
        found ?? {
          category_label,
          video_url: null,
          video_poster_url: null,
          wholesale_tiers: DEFAULT_SHOWCASE.wholesaleTiers,
        }
      );
    });
    return NextResponse.json({ rows });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    await assertOwnerAccess(request);
  } catch (e) {
    const status = (e as Error & { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro" },
      { status }
    );
  }

  try {
    const body = (await request.json()) as {
      entries?: {
        category_label: string;
        video_url?: string | null;
        video_poster_url?: string | null;
        wholesale_tiers?: unknown;
      }[];
    };
    if (!Array.isArray(body.entries) || body.entries.length === 0) {
      return NextResponse.json(
        { error: "Informe entries com category_label." },
        { status: 400 }
      );
    }
    const entries = body.entries.map((raw) => {
      const category_label = String(raw.category_label ?? "").trim();
      if (!category_label) throw new Error("Categoria inválida.");
      return {
        category_label,
        video_url: raw.video_url?.trim() || null,
        video_poster_url: raw.video_poster_url?.trim() || null,
        wholesale_tiers: sanitizeTiers(raw.wholesale_tiers),
      };
    });
    const admin = createAdminClient();
    const { error } = await admin.from("category_showcase_settings").upsert(entries, {
      onConflict: "category_label",
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro" },
      { status: 400 }
    );
  }
}

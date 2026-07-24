import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sortHomeBanners, type HomeBanner } from "@/lib/home-banners";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/home-banners — banners ativos para a home (público). */
export async function GET() {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("home_banners")
      .select("id, image_url, image_url_mobile, href, sort_order, active, created_at")
      .eq("active", true)
      .order("sort_order", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const banners = sortHomeBanners((data ?? []) as HomeBanner[]);
    return NextResponse.json(
      { banners },
      {
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
        },
      }
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro" },
      { status: 500 }
    );
  }
}

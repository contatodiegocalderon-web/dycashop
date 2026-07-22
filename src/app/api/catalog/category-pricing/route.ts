import { NextRequest, NextResponse } from "next/server";
import { getCategoryPricingBatch } from "@/lib/category-showcase";

export async function GET(req: NextRequest) {
  try {
    const raw = req.nextUrl.searchParams.get("categories") ?? "";
    const labels = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const pricingByCategory = await getCategoryPricingBatch(labels);
    const tiersByCategory: Record<string, (typeof pricingByCategory)[string]["wholesaleTiers"]> = {};
    const retailByCategory: Record<string, number | null> = {};
    for (const [label, cfg] of Object.entries(pricingByCategory)) {
      tiersByCategory[label] = cfg.wholesaleTiers;
      retailByCategory[label] = cfg.retailPricePerPiece;
    }

    return NextResponse.json({ tiersByCategory, retailByCategory, pricingByCategory });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

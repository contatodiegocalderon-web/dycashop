import { NextResponse } from "next/server";
import { getCatalogCategories } from "@/lib/catalog-categories";

export async function GET() {
  try {
    const categories = await getCatalogCategories();
    return NextResponse.json({ categories });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

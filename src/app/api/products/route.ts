import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { productPublicImageUrl } from "@/lib/product-image-url";

function supabaseAnon() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const size = searchParams.get("size");
    const brand = searchParams.get("brand");
    const color = searchParams.get("color");
    const brandExact = searchParams.get("brandExact") === "1";
    const colorExact = searchParams.get("colorExact") === "1";
    const category = searchParams.get("category");
    /** `exact`: filtro pela categoria exacta (página da pasta); omitir = busca parcial (filtro livre). */
    const categoryMatch = searchParams.get("categoryMatch");

    let q = supabaseAnon()
      .from("products")
      .select("*")
      .order("brand", { ascending: true })
      .order("color", { ascending: true });

    if (size && ["M", "G", "GG"].includes(size)) {
      q = q.eq("size", size);
    }
    if (brand?.trim()) {
      const b = brand.trim();
      q = brandExact ? q.eq("brand", b) : q.ilike("brand", `%${b}%`);
    }
    if (color?.trim()) {
      const c = color.trim();
      q = colorExact ? q.eq("color", c) : q.ilike("color", `%${c}%`);
    }
    if (category?.trim()) {
      const c = category.trim();
      if (categoryMatch === "exact") {
        if (c === "Sem categoria") {
          q = q.is("category", null);
        } else {
          q = q.eq("category", c);
        }
      } else {
        q = q.ilike("category", `%${c}%`);
      }
    }

    const { data, error } = await q;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const products = (data ?? []).map((p) => {
      const row = p as {
        drive_file_id: string;
        image_url?: string | null;
        catalog_image_url?: string | null;
        category: string | null;
        [key: string]: unknown;
      };
      return {
        ...row,
        category: row.category ?? null,
        drive_image_url: productPublicImageUrl(row),
      };
    });

    return NextResponse.json({ products });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

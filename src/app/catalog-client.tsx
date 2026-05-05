"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CategorySummary } from "@/lib/catalog-categories";
import type { Product, ProductSize } from "@/types";
import { CatalogFilters } from "@/components/catalog-filters";
import { CatalogSections } from "@/components/catalog-sections";

function buildQuery(
  size: "" | ProductSize,
  category: string,
  brand: string,
  color: string,
  categoryExact: boolean
) {
  const p = new URLSearchParams();
  if (size) p.set("size", size);
  if (category.trim()) {
    p.set("category", category.trim());
    if (categoryExact) p.set("categoryMatch", "exact");
  }
  if (brand.trim()) {
    p.set("brand", brand.trim());
    p.set("brandExact", "1");
  }
  if (color.trim()) {
    p.set("color", color.trim());
    p.set("colorExact", "1");
  }
  const q = p.toString();
  return q ? `?${q}` : "";
}

type Props = {
  /** Pasta/categoria fixa (página `/categoria/[slug]`). */
  categoryFixed?: string;
  /** Lista para pesquisa / troca rápida de categoria na página da pasta. */
  categories?: CategorySummary[];
  activeCategorySlug?: string;
};

export function CatalogClient({
  categoryFixed,
  categories,
  activeCategorySlug,
}: Props) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [size, setSize] = useState<"" | ProductSize>("");
  const [categoryFree, setCategoryFree] = useState("");
  const [brand, setBrand] = useState("");
  const [color, setColor] = useState("");

  const effectiveCategory = (categoryFixed ?? categoryFree).trim();
  const categoryExact = Boolean(categoryFixed);

  const query = useMemo(
    () =>
      buildQuery(size, effectiveCategory, brand, color, categoryExact),
    [size, effectiveCategory, brand, color, categoryExact]
  );

  const brandOptions = useMemo(() => {
    const s = new Set<string>();
    for (const p of products) {
      const b = p.brand?.trim();
      if (b) s.add(b);
    }
    return Array.from(s).sort((a, b) =>
      a.localeCompare(b, "pt", { sensitivity: "base" })
    );
  }, [products]);

  const colorOptions = useMemo(() => {
    const s = new Set<string>();
    for (const p of products) {
      const c = p.color?.trim();
      if (c) s.add(c);
    }
    return Array.from(s).sort((a, b) =>
      a.localeCompare(b, "pt", { sensitivity: "base" })
    );
  }, [products]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/products${query}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao carregar");
      setProducts(data.products ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (brand && brandOptions.length > 0 && !brandOptions.includes(brand)) {
      setBrand("");
    }
  }, [brand, brandOptions]);

  useEffect(() => {
    if (color && colorOptions.length > 0 && !colorOptions.includes(color)) {
      setColor("");
    }
  }, [color, colorOptions]);

  return (
    <div className="space-y-8">
      <CatalogFilters
        size={size}
        category={categoryFree}
        brand={brand}
        color={color}
        brandOptions={brandOptions}
        colorOptions={colorOptions}
        showCategoryFilter={!categoryFixed}
        categoryNavigation={
          categoryFixed && categories?.length && activeCategorySlug
            ? { categories, currentSlug: activeCategorySlug }
            : undefined
        }
        onSize={setSize}
        onCategory={setCategoryFree}
        onBrand={setBrand}
        onColor={setColor}
      />

      {loading && (
        <p className="text-center text-sm text-stone-400">Carregando catálogo…</p>
      )}
      {error && (
        <div className="rounded-xl border border-red-900/50 bg-red-950/50 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}
      {!loading && !error && products.length === 0 && (
        <p className="text-center text-stone-400">
          Nenhum produto encontrado. Rode a importação do Drive e verifique filtros.
        </p>
      )}
      {!loading && !error && products.length > 0 && (
        <CatalogSections products={products} />
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CategorySummary } from "@/lib/catalog-categories";
import {
  ENABLE_GUIDED_CATEGORY_WIZARD,
  filterProductsByWizardSelection,
  type GuidedWizardSelection,
  type WizardGuidedFilter,
} from "@/lib/catalog-guided-wizard";
import type { Product, ProductSize } from "@/types";
import { CatalogFilters } from "@/components/catalog-filters";
import { CatalogSections } from "@/components/catalog-sections";
import { CategoryGuidedWizard } from "@/components/category-guided-wizard";
import { WizardCatalogHint } from "@/components/wizard-catalog-hint";

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
  const guidedMode =
    Boolean(categoryFixed?.trim()) && ENABLE_GUIDED_CATEGORY_WIZARD;

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(!guidedMode);
  const [error, setError] = useState<string | null>(null);
  const [size, setSize] = useState<"" | ProductSize>("");
  const [categoryFree, setCategoryFree] = useState("");
  const [brand, setBrand] = useState("");
  const [color, setColor] = useState("");
  const [wizardDone, setWizardDone] = useState(!guidedMode);
  const [wizardGuidedFilter, setWizardGuidedFilter] =
    useState<WizardGuidedFilter | null>(null);
  const [wizardImageHint, setWizardImageHint] = useState(false);

  const effectiveCategory = (categoryFixed ?? categoryFree).trim();
  const categoryExact = Boolean(categoryFixed);
  const showCatalog = !guidedMode || wizardDone;

  const query = useMemo(() => {
    const useApiBrandColor = !wizardGuidedFilter;
    return buildQuery(
      size,
      effectiveCategory,
      useApiBrandColor ? brand : "",
      useApiBrandColor ? color : "",
      categoryExact
    );
  }, [
    size,
    effectiveCategory,
    brand,
    color,
    categoryExact,
    wizardGuidedFilter,
  ]);

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

  const displayedProducts = useMemo(() => {
    if (!wizardGuidedFilter) return products;
    return filterProductsByWizardSelection(products, wizardGuidedFilter);
  }, [products, wizardGuidedFilter]);

  const load = useCallback(async () => {
    if (!showCatalog) return;
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
  }, [query, showCatalog]);

  useEffect(() => {
    void load();
  }, [load]);

  function handleWizardComplete(sel: GuidedWizardSelection) {
    setSize(sel.size);
    setColor("");
    setBrand("");
    setWizardGuidedFilter({ colors: sel.colors, brands: sel.brands });
    setWizardDone(true);
    setWizardImageHint(true);
  }

  const dismissWizardImageHint = useCallback(() => {
    setWizardImageHint(false);
  }, []);

  function handleBrandChange(v: string) {
    setWizardGuidedFilter(null);
    setBrand(v);
  }

  function handleColorChange(v: string) {
    setWizardGuidedFilter(null);
    setColor(v);
  }

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
      {guidedMode && !wizardDone && categoryFixed && (
        <CategoryGuidedWizard
          categoryLabel={categoryFixed}
          onComplete={handleWizardComplete}
        />
      )}

      {showCatalog && (
        <>
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
        onSize={(v) => {
          setWizardGuidedFilter(null);
          setSize(v);
        }}
        onCategory={setCategoryFree}
        onBrand={handleBrandChange}
        onColor={handleColorChange}
      />

      {loading && (
        <p className="text-center text-sm text-stone-400">Carregando catálogo…</p>
      )}
      {error && (
        <div className="rounded-xl border border-red-900/50 bg-red-950/50 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}
      {!loading && !error && displayedProducts.length === 0 && (
        <p className="text-center text-stone-400">
          Nenhum produto encontrado. Rode a importação do Drive e verifique filtros.
        </p>
      )}
      {!loading && !error && displayedProducts.length > 0 && (
        <CatalogSections products={displayedProducts} />
      )}
        </>
      )}

      <WizardCatalogHint
        visible={wizardImageHint && showCatalog}
        onDismiss={dismissWizardImageHint}
      />
    </div>
  );
}

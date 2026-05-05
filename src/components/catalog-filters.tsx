"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";
import type { CategorySummary } from "@/lib/catalog-categories";
import type { ProductSize } from "@/types";

const filterSelectClass =
  "w-full cursor-pointer appearance-none rounded-xl border border-white/10 bg-black/30 bg-[length:1rem] bg-[right_0.65rem_center] bg-no-repeat px-3 py-2.5 pr-9 text-sm text-stone-100 outline-none ring-white/5 focus:ring-2 focus:ring-white/15";

type Props = {
  size: "" | ProductSize;
  category: string;
  brand: string;
  color: string;
  /** Valores distintos dos produtos carregados (lista suspensa). */
  brandOptions: string[];
  colorOptions: string[];
  /** Na página inicial: filtro livre pelo nome da pasta. */
  showCategoryFilter?: boolean;
  /** Na página `/categoria/[slug]`: pesquisa e atalhos para outras pastas. */
  categoryNavigation?: {
    categories: CategorySummary[];
    currentSlug: string;
  };
  onSize: (v: "" | ProductSize) => void;
  onCategory: (v: string) => void;
  onBrand: (v: string) => void;
  onColor: (v: string) => void;
};

const sizes: ProductSize[] = ["M", "G", "GG"];

export function CatalogFilters({
  size,
  category,
  brand,
  color,
  brandOptions,
  colorOptions,
  showCategoryFilter = true,
  categoryNavigation,
  onSize,
  onCategory,
  onBrand,
  onColor,
}: Props) {
  const router = useRouter();

  const sortedNavCategories = useMemo(() => {
    if (!categoryNavigation) return [];
    return [...categoryNavigation.categories].sort((a, b) =>
      a.label.localeCompare(b.label, "pt", { sensitivity: "base" })
    );
  }, [categoryNavigation]);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/[0.06] bg-zinc-900/35 p-3 ring-1 ring-white/[0.03] sm:flex-row sm:flex-wrap sm:items-end">
      {categoryNavigation && (
        <div className="flex min-w-[min(100%,260px)] flex-1 flex-col gap-1">
          <label
            htmlFor="category-nav-select"
            className="text-[11px] font-medium uppercase tracking-[0.18em] text-stone-500"
          >
            Categoria
          </label>
          <select
            id="category-nav-select"
            value={categoryNavigation.currentSlug}
            onChange={(e) => {
              const slug = e.target.value;
              if (slug && slug !== categoryNavigation.currentSlug) {
                router.push(`/categoria/${encodeURIComponent(slug)}`);
              }
            }}
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23a8a29e'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
            }}
            className={filterSelectClass}
          >
            {sortedNavCategories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.label} ({c.count})
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-medium uppercase tracking-[0.18em] text-stone-500">
          Tamanho
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onSize("")}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              size === ""
                ? "bg-stone-100 text-zinc-900"
                : "bg-white/[0.06] text-stone-300 hover:bg-white/[0.1]"
            }`}
          >
            Todos
          </button>
          {sizes.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onSize(s)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                size === s
                  ? "bg-stone-100 text-zinc-900"
                  : "bg-white/[0.06] text-stone-300 hover:bg-white/[0.1]"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      {showCategoryFilter && (
        <div className="flex min-w-[140px] flex-1 flex-col gap-1">
          <label
            htmlFor="filter-category"
            className="text-[11px] font-medium uppercase tracking-[0.18em] text-stone-500"
          >
            Categoria
          </label>
          <input
            id="filter-category"
            value={category}
            onChange={(e) => onCategory(e.target.value)}
            placeholder="Filtrar nome da pasta"
            className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-stone-100 outline-none ring-white/5 placeholder:text-stone-600 focus:ring-2 focus:ring-white/15"
          />
        </div>
      )}
      <div className="flex min-w-[160px] flex-1 flex-col gap-1">
        <label
          htmlFor="filter-brand"
          className="text-[11px] font-medium uppercase tracking-[0.18em] text-stone-500"
        >
          Marca
        </label>
        <select
          id="filter-brand"
          value={brand}
          onChange={(e) => onBrand(e.target.value)}
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23a8a29e'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
          }}
          className={filterSelectClass}
        >
          <option value="">Todas as marcas</option>
          {brandOptions.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </div>
      <div className="flex min-w-[160px] flex-1 flex-col gap-1">
        <label
          htmlFor="filter-color"
          className="text-[11px] font-medium uppercase tracking-[0.18em] text-stone-500"
        >
          Cor
        </label>
        <select
          id="filter-color"
          value={color}
          onChange={(e) => onColor(e.target.value)}
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23a8a29e'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
          }}
          className={filterSelectClass}
        >
          <option value="">Todas as cores</option>
          {colorOptions.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

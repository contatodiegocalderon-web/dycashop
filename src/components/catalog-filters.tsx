"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { CategorySummary } from "@/lib/catalog-categories";
import type { ProductSize } from "@/types";

const filterSelectClass =
  "w-full cursor-pointer appearance-none rounded-xl border border-white/10 bg-black/30 bg-[length:1rem] bg-[right_0.65rem_center] bg-no-repeat px-3 py-2.5 pr-9 text-sm text-stone-100 outline-none ring-white/5 focus:ring-2 focus:ring-white/15";

const chevronBg = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23a8a29e'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
};

type Props = {
  size: "" | ProductSize;
  category: string;
  brands: string[];
  colors: string[];
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
  onBrands: (v: string[]) => void;
  onColors: (v: string[]) => void;
};

const sizes: ProductSize[] = ["M", "G", "GG"];

function toggleInList(list: string[], value: string): string[] {
  return list.includes(value)
    ? list.filter((x) => x !== value)
    : [...list, value];
}

function MultiSelectFilter({
  id,
  label,
  options,
  selected,
  allLabel,
  onChange,
}: {
  id: string;
  label: string;
  options: string[];
  selected: string[];
  allLabel: string;
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const summary =
    selected.length === 0
      ? allLabel
      : selected.length === 1
        ? selected[0]!
        : `${selected.length} selecionadas`;

  return (
    <div ref={rootRef} className="relative flex min-w-[160px] flex-1 flex-col gap-1">
      <label
        htmlFor={id}
        className="text-[11px] font-medium uppercase tracking-[0.18em] text-stone-500"
      >
        {label}
      </label>
      <button
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        style={chevronBg}
        className={`${filterSelectClass} text-left`}
      >
        <span className="block truncate">{summary}</span>
      </button>
      {open ? (
        <div
          id={listId}
          role="listbox"
          aria-multiselectable="true"
          aria-label={label}
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-auto rounded-xl border border-white/10 bg-zinc-950 py-1 shadow-xl shadow-black/40 ring-1 ring-white/[0.06]"
        >
          <button
            type="button"
            role="option"
            aria-selected={selected.length === 0}
            onClick={() => {
              onChange([]);
              setOpen(false);
            }}
            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-white/[0.06] ${
              selected.length === 0 ? "text-stone-100" : "text-stone-400"
            }`}
          >
            {allLabel}
          </button>
          {options.map((opt) => {
            const checked = selected.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                role="option"
                aria-selected={checked}
                onClick={() => onChange(toggleInList(selected, opt))}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-stone-200 transition-colors hover:bg-white/[0.06]"
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                    checked
                      ? "border-stone-100 bg-stone-100 text-zinc-900"
                      : "border-white/25 bg-transparent"
                  }`}
                  aria-hidden
                >
                  {checked ? (
                    <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none">
                      <path
                        d="M2.5 6.2 4.8 8.5 9.5 3.5"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : null}
                </span>
                <span className="truncate">{opt}</span>
              </button>
            );
          })}
          {options.length === 0 ? (
            <p className="px-3 py-2 text-sm text-stone-500">Sem opções</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function CatalogFilters({
  size,
  category,
  brands,
  colors,
  brandOptions,
  colorOptions,
  showCategoryFilter = true,
  categoryNavigation,
  onSize,
  onCategory,
  onBrands,
  onColors,
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
            style={chevronBg}
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
      <MultiSelectFilter
        id="filter-color"
        label="Cor"
        options={colorOptions}
        selected={colors}
        allLabel="Todas as cores"
        onChange={onColors}
      />
      <MultiSelectFilter
        id="filter-brand"
        label="Marca"
        options={brandOptions}
        selected={brands}
        allLabel="Todas as marcas"
        onChange={onBrands}
      />
    </div>
  );
}

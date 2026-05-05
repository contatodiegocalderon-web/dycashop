import Link from "next/link";
import { notFound } from "next/navigation";
import { CatalogClient } from "@/app/catalog-client";
import { CategoryShowcaseBanner } from "@/components/category-showcase-banner";
import {
  getCatalogCategories,
  getCategoryBySlug,
} from "@/lib/catalog-categories";
import { getCategoryShowcaseConfig } from "@/lib/category-showcase";

type Props = { params: { slug: string } };

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CategoriaPage({ params }: Props) {
  const categories = await getCatalogCategories();
  const cat = await getCategoryBySlug(params.slug, categories);
  if (!cat) notFound();
  const showcaseConfig = await getCategoryShowcaseConfig(cat.label);

  return (
    <div className="mx-auto max-w-7xl px-3 py-6 sm:px-4">
      <nav className="mb-4 text-sm text-stone-500">
        <Link href="/" className="font-medium text-stone-400 transition-colors hover:text-stone-200">
          ← Catálogo
        </Link>
      </nav>

      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-stone-50">{cat.label}</h1>
        <p className="mt-1 text-sm text-stone-500">
          Escolha outra pasta na lista ou os filtros de tamanho, marca e cor (listas abaixo).
          Toque em &quot;Todos&quot; ou em M / G / GG.
        </p>
      </div>

      <CategoryShowcaseBanner categoryLabel={cat.label} config={showcaseConfig} />

      <CatalogClient
        categoryFixed={cat.label}
        categories={categories}
        activeCategorySlug={cat.slug}
      />
    </div>
  );
}

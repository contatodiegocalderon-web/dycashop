import Link from "next/link";
import { CategoryGrid } from "@/components/category-grid";
import { VideoCallCta } from "@/components/video-call-cta";
import { getCatalogCategories } from "@/lib/catalog-categories";

/** Lista pastas/categorias sempre com dados atuais (evita HTML estático desatualizado). */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HomePage() {
  const categories = await getCatalogCategories();

  return (
    <div className="mx-auto max-w-7xl px-3 py-8 sm:px-5">
      <div className="mb-8 max-w-2xl">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-stone-500">
          Selecione uma categoria
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-50 sm:text-4xl">
          Catálogo 100% atualizado
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-stone-500">
          Abra para filtrar por tamanho, marca e cor, monte o carrinho e envie o pedido
          pelo WhatsApp.
        </p>
      </div>

      <CategoryGrid categories={categories} />

      <VideoCallCta />

      <p className="mt-12 text-center text-xs text-stone-600">
        <Link
          href="/carrinho"
          prefetch
          className="font-medium text-stone-400 transition-colors hover:text-stone-200"
        >
          Ver carrinho
        </Link>
      </p>
    </div>
  );
}

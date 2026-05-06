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
      <div className="relative mb-10 max-w-2xl rounded-2xl border border-white/[0.08] bg-gradient-to-br from-zinc-900/45 via-[#121214]/90 to-black/50 px-5 py-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ring-1 ring-white/[0.06] sm:px-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-400">
          Selecione uma categoria
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-stone-50 sm:text-4xl">
          Catálogo 100% atualizado
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-stone-400">
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

import Link from "next/link";
import type { CategorySummary } from "@/lib/catalog-categories";

type Props = { categories: CategorySummary[] };

/**
 * Grelha compacta: o cliente vê o máximo de categorias possível no primeiro ecrã
 * (sem banners altos). Imagem leve (largura reduzida) para carregar rápido no 4G.
 */
export function CategoryGrid({ categories }: Props) {
  if (categories.length === 0) {
    return (
      <p className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-8 text-center text-sm text-stone-500">
        Nenhuma categoria ainda. Sincronize o Google Drive em{" "}
        <Link
          href="/admin/configuracao"
          className="font-medium text-stone-300 underline decoration-white/20 underline-offset-4 hover:text-white"
        >
          Configuração
        </Link>
        .
      </p>
    );
  }

  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 sm:gap-2.5">
      {categories.map((cat, idx) => {
        const heroSrc = cat.previewImageUrls[0] ?? null;
        const eager = idx < 8;

        return (
          <li key={`${cat.slug}-${idx}-${cat.label}`} className="min-w-0">
            <Link
              href={`/categoria/${encodeURIComponent(cat.slug)}`}
              className="group flex h-full min-h-[7.5rem] flex-col overflow-hidden rounded-xl border border-white/[0.06] bg-zinc-900/50 ring-1 ring-white/[0.03] transition hover:border-white/[0.12] hover:ring-white/[0.07] active:scale-[0.99] motion-reduce:transition-none"
              prefetch
            >
              <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden bg-zinc-950 sm:aspect-[5/4]">
                {heroSrc ? (
                  <img
                    src={heroSrc}
                    alt=""
                    className="h-full w-full object-cover object-center transition duration-500 group-hover:scale-105 motion-reduce:group-hover:scale-100"
                    loading={eager ? "eager" : "lazy"}
                    decoding="async"
                    fetchPriority={eager ? "high" : "low"}
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                  />
                ) : (
                  <div
                    className="h-full w-full bg-gradient-to-br from-zinc-800 to-zinc-950"
                    aria-hidden
                  />
                )}
                <div
                  className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent"
                  aria-hidden
                />
              </div>
              <div className="flex min-h-0 flex-1 flex-col justify-center px-2.5 py-2">
                <h2 className="line-clamp-2 text-left text-[13px] font-medium leading-snug text-stone-100 sm:text-sm">
                  {cat.label}
                </h2>
                <p className="mt-0.5 text-left text-[10px] text-stone-500 sm:text-[11px]">
                  {cat.count} {cat.count === 1 ? "peça" : "peças"}
                </p>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

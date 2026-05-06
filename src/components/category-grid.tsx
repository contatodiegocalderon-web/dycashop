import Link from "next/link";
import type { CategorySummary } from "@/lib/catalog-categories";

type Props = { categories: CategorySummary[] };

/**
 * Cartões da página inicial: cada tile usa a capa definida no admin (por categoria)
 * ou, se não houver, uma pré-visualização automática de produto dessa pasta.
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
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 sm:gap-4">
      {categories.map((cat, idx) => {
        const heroSrc =
          cat.coverImageUrl?.trim() || cat.previewImageUrls[0] || null;
        const eager = idx < 8;

        return (
          <li key={`${cat.slug}-${idx}-${cat.label}`} className="min-w-0">
            <Link
              href={`/categoria/${encodeURIComponent(cat.slug)}`}
              className="group relative block overflow-hidden rounded-2xl border border-white/[0.08] bg-[#121214] shadow-lg shadow-black/30 ring-1 ring-white/[0.06] transition hover:border-white/[0.12] hover:ring-white/[0.08] active:scale-[0.99] motion-reduce:transition-none"
              prefetch
            >
              {/* Fundo liso + textura em malha */}
              <div className="pointer-events-none absolute inset-0 bg-[#121214]" aria-hidden />
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.07] bg-[linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:14px_14px]"
                aria-hidden
              />

              <div className="relative aspect-[16/11] w-full overflow-hidden sm:aspect-[5/3]">
                {heroSrc ? (
                  <img
                    src={heroSrc}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover object-center transition duration-700 group-hover:scale-[1.03] motion-reduce:group-hover:scale-100"
                    loading={eager ? "eager" : "lazy"}
                    decoding="async"
                    fetchPriority={eager ? "high" : "low"}
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                  />
                ) : null}

                {/* Camadas estilo vitrine */}
                <div
                  className="absolute inset-0 bg-gradient-to-br from-zinc-900/55 via-transparent to-zinc-950/65"
                  aria-hidden
                />
                <div
                  className="absolute inset-0 bg-gradient-to-t from-black via-black/45 to-zinc-800/25"
                  aria-hidden
                />
                <div
                  className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_0%,rgba(255,255,255,0.14),transparent_52%)] opacity-90 mix-blend-soft-light"
                  aria-hidden
                />
                <div
                  className="absolute inset-0 opacity-[0.18] mix-blend-overlay bg-[repeating-linear-gradient(-45deg,transparent,transparent_3px,rgba(255,255,255,0.06)_3px,rgba(255,255,255,0.06)_6px)]"
                  aria-hidden
                />
                <div
                  className="absolute inset-0 ring-1 ring-inset ring-white/[0.07]"
                  aria-hidden
                />

                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/55 to-transparent px-3 pb-3 pt-10 sm:px-3.5 sm:pb-3.5">
                  <h2 className="line-clamp-2 text-left text-[13px] font-semibold leading-snug tracking-wide text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.85)] sm:text-sm">
                    {cat.label}
                  </h2>
                  <p className="mt-1 text-left text-[10px] font-medium uppercase tracking-[0.18em] text-stone-400/95 sm:text-[11px]">
                    +{cat.count} modelos
                  </p>
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

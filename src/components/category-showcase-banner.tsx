import type { CategoryShowcaseConfig } from "@/lib/category-showcase";
import {
  parseYouTubeVideoId,
  youtubeEmbedUrl,
} from "@/lib/youtube-embed";

type Props = {
  categoryLabel: string;
  config: CategoryShowcaseConfig;
};

function formatRange(minQty: number, maxQty: number | null) {
  if (maxQty == null) return `${minQty}+ peças`;
  if (minQty === maxQty) return `${minQty} peça`;
  return `${minQty}-${maxQty} peças`;
}

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function CategoryShowcaseBanner({ categoryLabel, config }: Props) {
  const rawUrl = config.videoUrl?.trim() ?? "";
  const ytId = rawUrl ? parseYouTubeVideoId(rawUrl) : null;
  const youtubeLike =
    !!rawUrl && /youtube\.com|youtu\.be/i.test(rawUrl) && !ytId;

  return (
    <section className="mb-6 grid gap-3 rounded-2xl border border-white/[0.08] bg-zinc-900/40 p-3 ring-1 ring-white/[0.04] md:grid-cols-2 md:p-4">
      <div className="rounded-xl border border-white/[0.08] bg-black/25 p-3 md:p-4">
        <h2 className="text-base font-semibold text-stone-100">
          Tabela de valores
        </h2>

        <div className="mt-3 overflow-hidden rounded-lg border border-white/[0.08]">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-white/[0.04]">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-stone-300">Quantidade</th>
                <th className="px-3 py-2 text-left font-medium text-stone-300">Valor por peça</th>
              </tr>
            </thead>
            <tbody>
              {config.wholesaleTiers.map((tier) => (
                <tr
                  key={`${tier.minQty}-${tier.maxQty ?? "plus"}`}
                  className="border-t border-white/[0.08]"
                >
                  <td className="px-3 py-2 text-stone-200">
                    {formatRange(tier.minQty, tier.maxQty)}
                  </td>
                  <td className="px-3 py-2 font-semibold text-emerald-400">
                    {formatCurrency(tier.price)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-white/[0.08] bg-black/25 p-2 md:p-3">
        <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500">
          Padrão de qualidade
        </p>
        <div className="overflow-hidden rounded-lg border border-white/[0.08] bg-black">
          {rawUrl && ytId ? (
            <div className="relative aspect-video w-full bg-black">
              <iframe
                title={`Vídeo — ${categoryLabel}`}
                className="absolute inset-0 h-full w-full"
                src={youtubeEmbedUrl(ytId)}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
              />
            </div>
          ) : youtubeLike ? (
            <div className="flex aspect-video items-center justify-center px-4 text-center text-sm text-amber-200/90">
              Não foi possível ler este link do YouTube. Use o formato
              https://www.youtube.com/watch?v=… ou https://youtu.be/…
            </div>
          ) : rawUrl ? (
            <video
              className="aspect-video w-full"
              controls
              preload="metadata"
              playsInline
              poster={config.videoPoster}
              src={rawUrl}
            >
              Seu navegador não suporta vídeo.
            </video>
          ) : (
            <div className="flex aspect-video items-center justify-center px-4 text-center text-sm text-stone-500">
              Vídeo ainda não configurado para esta categoria.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { HomeBanner } from "@/lib/home-banners";

type Props = {
  banners: HomeBanner[];
};

const AUTO_MS = 20_000;

function slideSrc(banner: HomeBanner): string {
  return (
    banner.image_url_mobile?.trim() ||
    banner.image_url.trim()
  );
}

function BannerHref({
  href,
  children,
}: {
  href: string | null | undefined;
  children: React.ReactNode;
}) {
  const raw = href?.trim();
  if (!raw) return <div className="w-full">{children}</div>;
  if (/^https?:\/\//i.test(raw)) {
    return (
      <a
        href={raw}
        className="block w-full"
        aria-label="Abrir banner"
        target="_blank"
        rel="noopener noreferrer"
      >
        {children}
      </a>
    );
  }
  return (
    <Link href={raw} className="block w-full" aria-label="Abrir banner">
      {children}
    </Link>
  );
}

export function HomeBannerCarousel({ banners }: Props) {
  const slides = banners.filter((b) => b.active && b.image_url?.trim());
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const count = slides.length;
  const go = useCallback(
    (next: number) => {
      if (count <= 0) return;
      setIndex(((next % count) + count) % count);
    },
    [count]
  );

  useEffect(() => {
    setIndex(0);
  }, [count]);

  // Pré-carrega todas as imagens (mobile) no cache do browser.
  const preloadKey = slides.map((s) => `${s.id}:${slideSrc(s)}`).join("|");
  useEffect(() => {
    if (typeof window === "undefined" || !preloadKey) return;
    const urls = Array.from(
      new Set(slides.map(slideSrc).filter(Boolean))
    );
    for (const url of urls) {
      const img = new window.Image();
      img.decoding = "async";
      img.src = url;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- preloadKey cobre urls
  }, [preloadKey]);

  useEffect(() => {
    if (count <= 1 || paused) return;
    const t = window.setInterval(() => {
      setIndex((i) => (i + 1) % count);
    }, AUTO_MS);
    return () => window.clearInterval(t);
  }, [count, paused]);

  if (count === 0) return null;

  return (
    <div
      className="relative mx-auto mb-10 w-full max-w-2xl overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ring-1 ring-white/[0.06] md:hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="relative w-full">
        {slides.map((slide, i) => {
          const src = slideSrc(slide);
          const active = i === index;
          return (
            <div
              key={slide.id}
              className={
                active
                  ? "relative w-full"
                  : "pointer-events-none absolute left-0 top-0 w-full opacity-0"
              }
              aria-hidden={!active}
            >
              <BannerHref href={active ? slide.href : null}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt=""
                  width={1080}
                  height={600}
                  decoding="async"
                  loading="eager"
                  fetchPriority={i === 0 ? "high" : "low"}
                  className="block h-auto w-full"
                />
              </BannerHref>
            </div>
          );
        })}

        {count > 1 ? (
          <>
            <button
              type="button"
              aria-label="Banner anterior"
              onClick={() => go(index - 1)}
              className="absolute left-1.5 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-black/20 text-base leading-none text-white/70 opacity-50 transition hover:bg-black/40 hover:text-white hover:opacity-90 sm:left-2 sm:opacity-40 sm:hover:opacity-90"
            >
              ‹
            </button>
            <button
              type="button"
              aria-label="Próximo banner"
              onClick={() => go(index + 1)}
              className="absolute right-1.5 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-black/20 text-base leading-none text-white/70 opacity-50 transition hover:bg-black/40 hover:text-white hover:opacity-90 sm:right-2 sm:opacity-40 sm:hover:opacity-90"
            >
              ›
            </button>
            <div className="absolute bottom-2 left-0 right-0 z-10 flex justify-center gap-1">
              {slides.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  aria-label={`Ir para banner ${i + 1}`}
                  aria-current={i === index}
                  onClick={() => setIndex(i)}
                  className={`h-1 rounded-full transition-all ${
                    i === index
                      ? "w-3 bg-white/70"
                      : "w-1 bg-white/30 hover:bg-white/50"
                  }`}
                />
              ))}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

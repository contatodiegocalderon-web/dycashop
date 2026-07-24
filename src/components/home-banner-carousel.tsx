"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { HomeBanner } from "@/lib/home-banners";

type Props = {
  banners: HomeBanner[];
};

const AUTO_MS = 5000;

function BannerSlideImage({
  banner,
  priority,
}: {
  banner: HomeBanner;
  priority?: boolean;
}) {
  const desktop = banner.image_url.trim();
  const mobile = banner.image_url_mobile?.trim() || desktop;

  return (
    <picture>
      <source media="(max-width: 767px)" srcSet={mobile} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={desktop}
        alt=""
        width={1600}
        height={600}
        decoding="async"
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        className="block h-auto w-full"
      />
    </picture>
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

  useEffect(() => {
    if (count <= 1 || paused) return;
    const t = window.setInterval(() => {
      setIndex((i) => (i + 1) % count);
    }, AUTO_MS);
    return () => window.clearInterval(t);
  }, [count, paused]);

  if (count === 0) return null;

  const current = slides[index]!;

  const media = (
    <BannerSlideImage banner={current} priority={index === 0} />
  );

  return (
    <div
      className="relative mb-10 overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ring-1 ring-white/[0.06]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="relative w-full">
        {current.href?.trim() ? (
          (() => {
            const href = current.href.trim();
            const external = /^https?:\/\//i.test(href);
            const className = "block w-full";
            if (external) {
              return (
                <a
                  href={href}
                  className={className}
                  aria-label="Abrir banner"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {media}
                </a>
              );
            }
            return (
              <Link href={href} className={className} aria-label="Abrir banner">
                {media}
              </Link>
            );
          })()
        ) : (
          <div className="w-full">{media}</div>
        )}

        {count > 1 ? (
          <>
            <button
              type="button"
              aria-label="Banner anterior"
              onClick={() => go(index - 1)}
              className="absolute left-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-lg text-white ring-1 ring-white/20 backdrop-blur-sm transition hover:bg-black/65 sm:left-3"
            >
              ‹
            </button>
            <button
              type="button"
              aria-label="Próximo banner"
              onClick={() => go(index + 1)}
              className="absolute right-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-lg text-white ring-1 ring-white/20 backdrop-blur-sm transition hover:bg-black/65 sm:right-3"
            >
              ›
            </button>
            <div className="absolute bottom-3 left-0 right-0 z-10 flex justify-center gap-1.5">
              {slides.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  aria-label={`Ir para banner ${i + 1}`}
                  aria-current={i === index}
                  onClick={() => setIndex(i)}
                  className={`h-1.5 rounded-full transition-all ${
                    i === index
                      ? "w-5 bg-white"
                      : "w-1.5 bg-white/45 hover:bg-white/70"
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

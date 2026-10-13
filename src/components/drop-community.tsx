"use client";

import Image from "next/image";
import Link from "next/link";
import {
  DROP_CATALOG_DRIVE_URL,
  DROP_MEMBER_PRICE_ROWS,
  DROP_STOCK_TIERS,
} from "@/lib/dropshipping";
import {
  COMMUNITY_TOPICS,
  getTopic,
  youtubeId,
  youtubeThumb,
  type CommunityTopic,
} from "@/lib/drop-community";
import { CommunityLoading, CommunityShell } from "@/components/community/community-shell";
import { JourneyBanner } from "@/components/community/journey";
import { TodayTasks } from "@/components/community/schedule-view";
import {
  currentStreak,
  planDayProgress,
  useCommunity,
  type CommunityData,
  type Lesson,
} from "@/components/community/use-community";

function money(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function topicHref(t: CommunityTopic): string {
  return t.kind === "link" ? DROP_CATALOG_DRIVE_URL : `/comunidade/${t.slug}`;
}

function topicMeta(t: CommunityTopic, data: CommunityData): { label: string; progress: number | null } {
  if (t.kind === "link") return { label: "Abrir no Drive ↗", progress: null };
  if (t.kind === "schedule") {
    const { done, total } = planDayProgress(data, data.plan.today);
    const streak = currentStreak(data);
    return {
      label: `Hoje: ${done}/${total} postados${streak ? ` · 🔥 ${streak}` : ""}`,
      progress: total ? done / total : null,
    };
  }
  const lessons = data.lessons.filter((l) => l.module === t.slug);
  if (!lessons.length) return { label: "Aulas em breve", progress: null };
  const done = lessons.filter((l) => data.completedLessonIds.includes(l.id)).length;
  return {
    label: `${lessons.length} ${lessons.length === 1 ? "aula" : "aulas"} · ${done} assistida${done === 1 ? "" : "s"}`,
    progress: done / lessons.length,
  };
}

function TopicPoster({ topic, data, priority }: { topic: CommunityTopic; data: CommunityData; priority: boolean }) {
  const meta = topicMeta(topic, data);
  const external = topic.kind === "link";
  return (
    <Link
      href={topicHref(topic)}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className="cm-poster group"
      aria-label={topic.title}
    >
      <Image
        src={topic.cover}
        alt=""
        fill
        priority={priority}
        sizes="(min-width: 1024px) 220px, (min-width: 640px) 28vw, 44vw"
        className="cm-poster-art object-cover object-top"
      />
      <span className="relative mt-auto block text-center">
        <span className="block text-[9px] font-semibold uppercase tracking-[0.22em] text-stone-200 sm:text-[10px]">
          {topic.posterEyebrow}
        </span>
        <span className="cm-poster-title mt-1 block">{topic.posterTitle}</span>
        <span className="mt-2.5 block text-[10px] font-semibold text-emerald-300 sm:text-[11px]">{meta.label}</span>
        {meta.progress !== null ? (
          <span className="mx-auto mt-1.5 block h-1 w-4/5 overflow-hidden rounded-full bg-white/15">
            <span
              className="block h-full rounded-full bg-emerald-400"
              style={{ width: `${Math.round(meta.progress * 100)}%` }}
            />
          </span>
        ) : null}
      </span>
    </Link>
  );
}

function LessonThumb({ lesson, done, number }: { lesson: Lesson; done: boolean; number: number }) {
  const id = youtubeId(lesson.youtube_url);
  return (
    <Link
      href={`/comunidade/${lesson.module}?aula=${lesson.id}`}
      className="group block w-[72vw] max-w-[300px] shrink-0 snap-start"
    >
      <div className="relative aspect-video overflow-hidden rounded-lg bg-zinc-800 ring-1 ring-white/10 transition duration-300 group-hover:scale-[1.04] group-hover:ring-white/30">
        {id ? (
          <Image src={youtubeThumb(id)} alt="" fill unoptimized className="object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-stone-500">Vídeo em breve</div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
        <span className="absolute left-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white">
          Aula {number}
        </span>
        {done ? (
          <span className="absolute right-2 top-2 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-zinc-950">
            ✓ Assistida
          </span>
        ) : null}
        <span className="absolute inset-0 flex items-center justify-center opacity-0 transition group-hover:opacity-100">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 text-zinc-950">
            <svg viewBox="0 0 20 20" width={18} height={18} fill="currentColor" aria-hidden>
              <path d="M6 4l10 6-10 6z" />
            </svg>
          </span>
        </span>
      </div>
      <p className="mt-2 line-clamp-2 text-sm font-medium text-stone-200">{lesson.title}</p>
    </Link>
  );
}

function nextLesson(data: CommunityData): Lesson | null {
  for (const t of COMMUNITY_TOPICS) {
    if (t.kind !== "lessons") continue;
    const l = data.lessons.find((x) => x.module === t.slug && !data.completedLessonIds.includes(x.id));
    if (l) return l;
  }
  return null;
}

export function DropCommunity() {
  const { data, error, toggle } = useCommunity();
  if (!data) return <CommunityLoading error={error} />;

  const first = (data.user.fullName || data.user.email).split(/[\s@]/)[0];
  const upNext = nextLesson(data);
  const upNextTopic = upNext ? getTopic(upNext.module) : null;
  const upNextThumb = upNext ? youtubeId(upNext.youtube_url) : null;
  return (
    <CommunityShell>
      <section className="cm-hero relative overflow-hidden">
        {upNextThumb ? (
          <>
            <Image src={youtubeThumb(upNextThumb)} alt="" fill unoptimized priority className="object-cover opacity-30 blur-[2px]" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#050706] via-[#050706]/85 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#050706] to-transparent" />
          </>
        ) : null}
        <div className="relative mx-auto grid max-w-7xl items-center gap-8 px-4 pb-12 pt-8 sm:px-8 sm:pb-16 sm:pt-12 lg:grid-cols-[1fr_440px]">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-emerald-400">
              Olá, {first}
            </p>
            {upNext && upNextTopic ? (
              <>
                <h1 className="mt-3 max-w-2xl text-3xl font-extrabold tracking-tight text-white sm:text-5xl">
                  {upNext.title}
                </h1>
                <p className="mt-3 text-sm text-stone-300">
                  Continue em <strong className="text-white">{upNextTopic.title}</strong>
                  {upNext.description ? ` — ${upNext.description}` : ""}
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Link
                    href={`/comunidade/${upNext.module}?aula=${upNext.id}`}
                    className="inline-flex items-center gap-2 rounded-md bg-white px-6 py-3 text-sm font-bold text-zinc-950 hover:bg-white/85"
                  >
                    <svg viewBox="0 0 20 20" width={16} height={16} fill="currentColor" aria-hidden>
                      <path d="M6 4l10 6-10 6z" />
                    </svg>
                    Assistir aula
                  </Link>
                </div>
              </>
            ) : (
              <>
                <h1 className="mt-3 max-w-2xl text-3xl font-extrabold tracking-tight text-white sm:text-5xl">
                  Bora vender hoje.
                </h1>
                <p className="mt-3 max-w-xl text-sm text-stone-300">
                  Faça as tarefas de hoje, mostre o catálogo pros seus clientes e, vendeu, faça o pedido.
                </p>
              </>
            )}
          </div>
          <TodayTasks data={data} toggle={toggle} />
        </div>
      </section>

      <main className="mx-auto max-w-7xl px-4 pb-20 sm:px-8">
        <JourneyBanner />

        <h2 className="mt-10 text-lg font-bold text-white sm:text-xl">Seus tópicos</h2>
        <div className="cm-row -mx-4 mt-1 grid auto-cols-[44vw] grid-flow-col gap-3 overflow-x-auto px-4 py-3 sm:-mx-8 sm:auto-cols-[28vw] sm:px-8 lg:mx-auto lg:flex lg:max-w-4xl lg:flex-wrap lg:justify-center lg:gap-4 lg:overflow-visible lg:px-0">
          {COMMUNITY_TOPICS.map((t, i) => (
            <div key={t.slug} className="lg:w-[calc((100%-3rem)/4)]">
              <TopicPoster topic={t} data={data} priority={i < 4} />
            </div>
          ))}
        </div>

        {COMMUNITY_TOPICS.filter((t) => t.kind === "lessons").map((t) => {
          const lessons = data.lessons.filter((l) => l.module === t.slug);
          if (!lessons.length) return null;
          return (
            <section key={t.slug} className="mt-10">
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="text-lg font-bold text-white sm:text-xl">{t.title}</h2>
                <Link href={`/comunidade/${t.slug}`} className="text-xs font-semibold text-stone-400 hover:text-white">
                  Ver tudo →
                </Link>
              </div>
              <div className="cm-row -mx-4 mt-1 flex snap-x gap-3 overflow-x-auto px-4 py-3 sm:-mx-8 sm:px-8">
                {lessons.map((l, i) => (
                  <LessonThumb
                    key={l.id}
                    lesson={l}
                    number={i + 1}
                    done={data.completedLessonIds.includes(l.id)}
                  />
                ))}
              </div>
            </section>
          );
        })}

        <section className="mt-12 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <div className="cm-slot rounded-2xl p-5 sm:p-6">
            <h2 className="text-base font-bold uppercase tracking-wide text-white">Dropshipping</h2>
            <p className="mt-1 text-xs text-stone-400">
              A partir de 1 peça. Quanto mais você vender, mais vamos diminuir o preço pra você.
            </p>
            <table className="mt-4 w-full text-left text-sm">
              <tbody>
                {DROP_MEMBER_PRICE_ROWS.map((row) => (
                  <tr key={row.label} className="border-b border-white/[0.05] last:border-0">
                    <td className="py-2 text-stone-300">{row.label}</td>
                    <td className="py-2 text-right font-mono tabular-nums text-stone-100">{money(row.price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="cm-slot rounded-2xl p-5 sm:p-6">
            <h2 className="text-base font-bold uppercase tracking-wide text-white">Atacado</h2>
            <p className="mt-1 text-xs text-stone-400">Preço exclusivo de atacado.</p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {DROP_STOCK_TIERS.map((t) => (
                <div key={t.qty} className="rounded-xl border border-white/[0.06] px-3 py-4 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-stone-500">{t.qty} peças</p>
                  <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-emerald-400">{money(t.unit)}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2.5 text-xs leading-relaxed text-emerald-200">
              Pedidos na grade por estampa: conseguimos negociar preços melhores ainda.
            </p>
          </div>
        </section>
      </main>
    </CommunityShell>
  );
}

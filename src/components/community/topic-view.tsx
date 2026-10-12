"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type CSSProperties } from "react";
import {
  WEEKDAY_LABELS,
  addDays,
  youtubeId,
  youtubeThumb,
  type CommunityTopic,
} from "@/lib/drop-community";
import { CommunityLoading, CommunityShell } from "@/components/community/community-shell";
import { TopicIcon } from "@/components/community/topic-icon";
import { useCommunity, type CommunityData } from "@/components/community/use-community";

type Toggle = (kind: "lesson" | "schedule", id: string, done: boolean) => Promise<void>;

function TopicHeader({ topic, right }: { topic: CommunityTopic; right?: React.ReactNode }) {
  return (
    <div
      className="flex flex-wrap items-end justify-between gap-4"
      style={{ "--accent": topic.accent } as CSSProperties}
    >
      <div className="flex items-center gap-4">
        <span className="cm-accent-chip flex h-12 w-12 items-center justify-center rounded-xl">
          <TopicIcon slug={topic.slug} size={24} />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold uppercase tracking-tight text-white sm:text-3xl">
            {topic.title}
          </h1>
          <p className="mt-0.5 text-sm text-stone-400">{topic.tagline}</p>
        </div>
      </div>
      {right}
    </div>
  );
}

function LessonsView({ topic, data, toggle }: { topic: CommunityTopic; data: CommunityData; toggle: Toggle }) {
  const params = useSearchParams();
  const lessons = data.lessons.filter((l) => l.module === topic.slug);
  const wanted = params.get("aula");
  const fallback =
    lessons.find((l) => !data.completedLessonIds.includes(l.id)) ?? lessons[0] ?? null;
  const [currentId, setCurrentId] = useState<string | null>(
    lessons.some((l) => l.id === wanted) ? wanted : fallback?.id ?? null
  );
  const current = lessons.find((l) => l.id === currentId) ?? null;
  const videoId = youtubeId(current?.youtube_url);
  const done = current ? data.completedLessonIds.includes(current.id) : false;
  const doneCount = lessons.filter((l) => data.completedLessonIds.includes(l.id)).length;

  function select(id: string) {
    setCurrentId(id);
    window.history.replaceState(null, "", `?aula=${id}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function markAndNext() {
    if (!current) return;
    void toggle("lesson", current.id, !done);
    if (!done) {
      const idx = lessons.findIndex((l) => l.id === current.id);
      const next = lessons[idx + 1];
      if (next) select(next.id);
    }
  }

  return (
    <main className="mx-auto max-w-7xl px-4 pb-20 pt-6 sm:px-8">
      <TopicHeader
        topic={topic}
        right={
          lessons.length ? (
            <p className="text-xs font-semibold text-stone-400">
              {doneCount} de {lessons.length} assistidas
            </p>
          ) : null
        }
      />

      {!lessons.length ? (
        <div className="mt-10 rounded-2xl border border-dashed border-white/15 px-6 py-16 text-center">
          <p className="text-lg font-semibold text-white">Aulas chegando em breve</p>
          <p className="mt-2 text-sm text-stone-400">
            A equipe está preparando o conteúdo deste tópico.
          </p>
        </div>
      ) : (
        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
          <div>
            <div className="relative aspect-video overflow-hidden rounded-xl bg-black ring-1 ring-white/10">
              {videoId ? (
                <iframe
                  key={videoId}
                  src={`https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1`}
                  title={current?.title ?? "Aula"}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="absolute inset-0 h-full w-full"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-stone-500">
                  Vídeo desta aula em breve
                </div>
              )}
            </div>
            {current ? (
              <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white">{current.title}</h2>
                  {current.description ? (
                    <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-stone-400">
                      {current.description}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={markAndNext}
                  className={`shrink-0 rounded-md px-5 py-3 text-sm font-bold transition ${
                    done
                      ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/40"
                      : "bg-white text-zinc-950 hover:bg-white/85"
                  }`}
                >
                  {done ? "✓ Assistida" : "Marcar como assistida"}
                </button>
              </div>
            ) : null}
          </div>

          <ol className="space-y-2">
            {lessons.map((l, i) => {
              const id = youtubeId(l.youtube_url);
              const isDone = data.completedLessonIds.includes(l.id);
              const active = l.id === current?.id;
              return (
                <li key={l.id}>
                  <button
                    type="button"
                    onClick={() => select(l.id)}
                    className={`flex w-full gap-3 rounded-lg p-2 text-left transition ${
                      active ? "bg-white/10 ring-1 ring-white/20" : "hover:bg-white/5"
                    }`}
                  >
                    <span className="relative aspect-video w-32 shrink-0 overflow-hidden rounded-md bg-zinc-800">
                      {id ? (
                        <Image src={youtubeThumb(id)} alt="" fill unoptimized className="object-cover" />
                      ) : null}
                      {isDone ? (
                        <span className="absolute inset-x-0 bottom-0 h-1 bg-emerald-500" />
                      ) : null}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                        Aula {i + 1}
                        {isDone ? <span className="ml-1.5 text-emerald-400">✓</span> : null}
                      </span>
                      <span className="mt-0.5 line-clamp-2 block text-sm font-medium text-stone-100">
                        {l.title}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </main>
  );
}

function formatDay(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

function ScheduleView({ topic, data, toggle }: { topic: CommunityTopic; data: CommunityData; toggle: Toggle }) {
  const { items, checkedItemIds, today, weekStart } = data.schedule;
  const [day, setDay] = useState(today);
  const dayItems = items.filter((i) => i.weekday === day);
  const doneTotal = items.filter((i) => checkedItemIds.includes(i.id)).length;
  const pct = items.length ? Math.round((doneTotal / items.length) * 100) : 0;

  return (
    <main className="mx-auto max-w-4xl px-4 pb-20 pt-6 sm:px-8">
      <TopicHeader
        topic={topic}
        right={
          items.length ? (
            <div className="text-right">
              <p className="font-mono text-2xl font-semibold text-emerald-400">{pct}%</p>
              <p className="text-[11px] text-stone-500">
                {doneTotal} de {items.length} da semana
              </p>
            </div>
          ) : null
        }
      />

      <div className="cm-row mt-8 flex gap-2 overflow-x-auto pb-2">
        {WEEKDAY_LABELS.map((label, i) => {
          const wd = i + 1;
          const list = items.filter((it) => it.weekday === wd);
          const allDone = list.length > 0 && list.every((it) => checkedItemIds.includes(it.id));
          const active = wd === day;
          return (
            <button
              key={label}
              type="button"
              onClick={() => setDay(wd)}
              className={`min-w-[84px] shrink-0 rounded-xl px-3 py-2.5 text-center transition ${
                active
                  ? "bg-white text-zinc-950"
                  : "bg-white/[0.05] text-stone-300 hover:bg-white/10"
              }`}
            >
              <span className="block text-xs font-bold">
                {wd === today ? "Hoje" : label.slice(0, 3)}
              </span>
              <span className={`block text-[11px] ${active ? "text-zinc-600" : "text-stone-500"}`}>
                {formatDay(addDays(weekStart, i))}
              </span>
              <span
                className={`mx-auto mt-1 block h-1.5 w-1.5 rounded-full ${
                  allDone ? "bg-emerald-500" : list.length ? "bg-stone-500" : "bg-transparent"
                }`}
              />
            </button>
          );
        })}
      </div>

      <h2 className="mt-8 text-lg font-bold text-white">
        {WEEKDAY_LABELS[day - 1]}
        {day === today ? " · hoje" : ""}
      </h2>

      {!dayItems.length ? (
        <p className="mt-4 rounded-xl border border-dashed border-white/15 px-5 py-10 text-center text-sm text-stone-400">
          {items.length
            ? "Nada programado pra este dia."
            : "O cronograma desta semana ainda vai ser publicado pela equipe."}
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {dayItems.map((it) => {
            const checked = checkedItemIds.includes(it.id);
            return (
              <li
                key={it.id}
                className={`flex gap-4 rounded-2xl border p-4 transition sm:p-5 ${
                  checked
                    ? "border-emerald-500/30 bg-emerald-500/[0.06]"
                    : "border-white/[0.08] bg-white/[0.03]"
                }`}
              >
                <button
                  type="button"
                  onClick={() => void toggle("schedule", it.id, !checked)}
                  aria-pressed={checked}
                  aria-label={checked ? "Desmarcar" : "Marcar como feito"}
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition ${
                    checked
                      ? "border-emerald-500 bg-emerald-500 text-zinc-950"
                      : "border-stone-500 text-transparent hover:border-emerald-400"
                  }`}
                >
                  <svg viewBox="0 0 16 16" width={14} height={14} fill="none" aria-hidden>
                    <path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <div className="min-w-0 flex-1">
                  <p className={`font-semibold ${checked ? "text-stone-400 line-through" : "text-white"}`}>
                    {it.title}
                  </p>
                  {it.description ? (
                    <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-stone-400">
                      {it.description}
                    </p>
                  ) : null}
                  {it.link_url ? (
                    <a
                      href={it.link_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-flex rounded-md bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20"
                    >
                      Abrir conteúdo ↗
                    </a>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

export function TopicView({ topic }: { topic: CommunityTopic }) {
  const { data, error, toggle } = useCommunity();
  if (!data) return <CommunityLoading error={error} />;
  return (
    <CommunityShell back>
      {topic.kind === "schedule" ? (
        <ScheduleView topic={topic} data={data} toggle={toggle} />
      ) : (
        <LessonsView topic={topic} data={data} toggle={toggle} />
      )}
      <p className="pb-10 text-center text-xs text-stone-600">
        <Link href="/comunidade" className="hover:text-stone-400">
          ← Voltar para a comunidade
        </Link>
      </p>
    </CommunityShell>
  );
}

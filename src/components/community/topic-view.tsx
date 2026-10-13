"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type CSSProperties } from "react";
import { youtubeId, youtubeThumb, type CommunityTopic } from "@/lib/drop-community";
import { CommunityLoading, CommunityShell } from "@/components/community/community-shell";
import { ScheduleView } from "@/components/community/schedule-view";
import { TopicIcon } from "@/components/community/topic-icon";
import {
  useCommunity,
  type CommunityData,
  type ToggleKind,
} from "@/components/community/use-community";

type Toggle = (kind: ToggleKind, id: string, done: boolean) => Promise<void>;

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

export function TopicView({ topic }: { topic: CommunityTopic }) {
  const { data, error, toggle } = useCommunity();
  if (!data) return <CommunityLoading error={error} />;
  return (
    <CommunityShell back>
      {topic.kind === "schedule" ? (
        <ScheduleView
          data={data}
          toggle={toggle}
          header={(right) => <TopicHeader topic={topic} right={right} />}
        />
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

"use client";

import { useEffect, useRef, useState } from "react";
import { isWelcomeLesson, videoPoster } from "@/lib/drop-community";
import type { CommunityData } from "@/components/community/use-community";

const SPEEDS = [1, 1.5, 2] as const;

export function WelcomeVideo({
  data,
  onDismiss,
  onWatched,
}: {
  data: CommunityData;
  onDismiss: () => void;
  onWatched: (lessonId: string) => void;
}) {
  const lesson = data.lessons.find((l) => isWelcomeLesson(l.youtube_url)) ?? null;
  const videoRef = useRef<HTMLVideoElement>(null);
  const watched = useRef(0);
  const locking = useRef(false);
  const [needsTap, setNeedsTap] = useState(false);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [finished, setFinished] = useState(false);
  const open = Boolean(lesson?.youtube_url) && !data.welcomeSeen;

  useEffect(() => {
    const video = videoRef.current;
    if (!open || !video) return;
    const play = video.play();
    if (play) {
      play.then(() => setNeedsTap(false)).catch(() => setNeedsTap(true));
    }
  }, [open]);

  function holdPlace(video: HTMLVideoElement) {
    if (locking.current || finished) return;
    if (Number.isFinite(video.duration) && video.currentTime >= video.duration - 0.2) {
      watched.current = video.duration;
      return;
    }
    if (Math.abs(video.currentTime - watched.current) > 1.25) {
      locking.current = true;
      video.currentTime = watched.current;
      locking.current = false;
      return;
    }
    if (video.currentTime > watched.current) watched.current = video.currentTime;
  }

  function togglePause() {
    const video = videoRef.current;
    if (!video || finished) return;
    if (video.paused) void video.play();
    else video.pause();
  }

  function changeSpeed(next: (typeof SPEEDS)[number]) {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = next;
    setSpeed(next);
  }

  if (!open || !lesson?.youtube_url) return null;
  const src = lesson.youtube_url;
  const poster = videoPoster(src);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="flex w-full max-w-sm flex-col items-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-300">
          Boas-vindas
        </p>
        <h2 className="mt-2 text-center text-2xl font-extrabold text-white">Antes de começar</h2>
        <div className="relative mt-5 w-full overflow-hidden rounded-2xl bg-black ring-1 ring-white/15">
          <video
            ref={videoRef}
            src={src}
            poster={poster ?? undefined}
            autoPlay
            playsInline
            disablePictureInPicture
            controlsList="nodownload nofullscreen noremoteplayback"
            className="max-h-[70dvh] w-full bg-black object-contain"
            onTimeUpdate={(event) => holdPlace(event.currentTarget)}
            onSeeking={(event) => holdPlace(event.currentTarget)}
            onPlay={() => setPaused(false)}
            onPause={() => setPaused(true)}
            onEnded={() => {
              setFinished(true);
              setPaused(true);
              onWatched(lesson.id);
            }}
            onRateChange={(event) => {
              const rate = event.currentTarget.playbackRate;
              if (rate !== 1 && rate !== 1.5 && rate !== 2) event.currentTarget.playbackRate = speed;
            }}
            onKeyDown={(event) => {
              if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
                event.preventDefault();
              }
            }}
          />
          {needsTap ? (
            <button
              type="button"
              className="absolute inset-0 flex items-center justify-center bg-black/40"
              onClick={() => {
                void videoRef.current?.play().then(() => setNeedsTap(false));
              }}
            >
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-zinc-950">
                <svg viewBox="0 0 20 20" width={22} height={22} fill="currentColor" aria-hidden>
                  <path d="M6 4l10 6-10 6z" />
                </svg>
              </span>
            </button>
          ) : null}
        </div>
        <div className="mt-4 flex w-full items-center justify-between gap-3">
          <button
            type="button"
            onClick={togglePause}
            disabled={finished}
            className="rounded-md border border-white/15 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {paused ? "Retomar" : "Pausar"}
          </button>
          <div className="flex gap-1.5" role="group" aria-label="Velocidade">
            {SPEEDS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => changeSpeed(value)}
                aria-pressed={speed === value}
                className={`rounded-md px-3 py-2 text-sm font-semibold ${
                  speed === value
                    ? "bg-white text-zinc-950"
                    : "border border-white/15 text-stone-200 hover:bg-white/10"
                }`}
              >
                {value === 1 ? "1x" : `${String(value).replace(".", ",")}x`}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          disabled={!finished}
          onClick={onDismiss}
          className={`mt-4 w-full rounded-md px-5 py-3 text-sm font-bold ${
            finished
              ? "bg-white text-zinc-950 hover:bg-white/85"
              : "cursor-not-allowed bg-white/15 text-white/40"
          }`}
        >
          {finished ? "Continuar" : "Assista até o fim para continuar"}
        </button>
      </div>
    </div>
  );
}

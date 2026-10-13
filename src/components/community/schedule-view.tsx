"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { WEEKDAY_LABELS, addDays } from "@/lib/drop-community";
import {
  EFFORT_LABELS,
  GOAL_LABELS,
  SUPPLY_LABELS,
  type PlanSlot,
} from "@/lib/drop-content-plan";
import {
  currentStreak,
  planDayProgress,
  type CommunityData,
  type ToggleKind,
} from "@/components/community/use-community";

type Toggle = (kind: ToggleKind, id: string, done: boolean) => Promise<void>;

const ESSENTIAL_KEY = "dycashop-cronograma-essencial";

function formatDay(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

function CheckButton({
  checked,
  disabled,
  onClick,
}: {
  checked: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={checked}
      aria-label={checked ? "Desmarcar" : "Marcar como postado"}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition disabled:cursor-not-allowed disabled:opacity-30 ${
        checked
          ? "border-emerald-400 bg-emerald-400 text-zinc-950 shadow-[0_0_18px_rgba(16,185,129,0.55)]"
          : "border-stone-500 text-transparent hover:border-emerald-400"
      }`}
    >
      <svg viewBox="0 0 16 16" width={15} height={15} fill="none" aria-hidden>
        <path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

function EffortDots({ effort }: { effort: 1 | 2 | 3 }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] px-2.5 py-1 text-[10px] font-semibold text-stone-300">
      <span className="flex gap-0.5" aria-hidden>
        {[1, 2, 3].map((n) => (
          <span key={n} className={`h-1.5 w-1.5 rounded-full ${n <= effort ? "bg-emerald-400" : "bg-white/15"}`} />
        ))}
      </span>
      {EFFORT_LABELS[effort]}
    </span>
  );
}

function SlotCard({
  slot,
  checked,
  locked,
  material,
  lessonHref,
  onToggle,
}: {
  slot: PlanSlot;
  checked: boolean;
  locked: boolean;
  material: string | null;
  lessonHref: string | null;
  onToggle: () => void;
}) {
  const weekly = slot.format.supply === "semanal";

  return (
    <li
      className={`cm-slot relative flex gap-4 rounded-2xl p-4 sm:p-5 ${checked ? "cm-slot-done" : ""}`}
    >
      <CheckButton checked={checked} disabled={locked} onClick={onToggle} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
          <span className="font-mono text-stone-400">{slot.when}</span>
          <span className="rounded-full border border-emerald-400/30 px-2 py-0.5 uppercase tracking-wider text-emerald-300">
            {slot.purpose}
          </span>
          {slot.essential ? (
            <span className="rounded-full bg-emerald-400 px-2 py-0.5 uppercase tracking-wider text-zinc-950">
              ★ Essencial
            </span>
          ) : null}
        </div>

        <p className={`mt-2 text-base font-bold sm:text-lg ${checked ? "text-stone-400 line-through" : "text-white"}`}>
          {slot.format.label}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <EffortDots effort={slot.format.effort} />
          <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[10px] font-semibold text-stone-300">
            {GOAL_LABELS[slot.format.goal]}
          </span>
          <span
            className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
              weekly ? "bg-amber-400/15 text-amber-200" : "bg-emerald-400/10 text-emerald-200"
            }`}
          >
            {slot.cadence === "semana"
              ? "Feed 1x por semana"
              : slot.cadence === "mes"
                ? "Feed 1x por mês"
                : slot.channel === "story" && weekly
                  ? "Vídeo da semana · pode repetir"
                  : SUPPLY_LABELS[slot.format.supply]}
          </span>
        </div>

        {!checked ? (
          <>
            <p className="mt-3 text-sm leading-relaxed text-stone-300">{slot.format.how}</p>
            {slot.text ? (
              <p className="mt-2 text-sm leading-relaxed text-stone-100">
                <span className="mr-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-400">No story:</span>
                {slot.text}
              </p>
            ) : null}
            <p className="mt-1.5 text-xs text-stone-500">{slot.purposeTip}</p>

            {material || lessonHref ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {material ? (
                  <a
                    href={material}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-bold text-zinc-950 hover:bg-emerald-400"
                  >
                    Pegar material ↗
                  </a>
                ) : null}
                {lessonHref ? (
                  <Link
                    href={lessonHref}
                    className="inline-flex rounded-md bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20"
                  >
                    ▶ Ver aula deste formato
                  </Link>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </li>
  );
}

/** Checklist do dia na home da comunidade. */
export function TodayTasks({ data, toggle }: { data: CommunityData; toggle: Toggle }) {
  const date = data.plan.today;
  const { plan, isChecked, done, total } = planDayProgress(data, date);
  const streak = currentStreak(data);
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="jr-hero relative overflow-hidden rounded-3xl p-5 sm:p-6">
      <div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-emerald-400">Tarefas de hoje</p>
            <h2 className="mt-1 text-xl font-black uppercase tracking-tight text-white sm:text-2xl">{plan.theme}</h2>
          </div>
          <div className="text-right">
            <p className="font-mono text-2xl font-bold text-white">
              {done}
              <span className="text-stone-500">/{total}</span>
            </p>
            <p className="text-[10px] uppercase tracking-wider text-stone-500">
              {streak ? `🔥 ${streak} ${streak === 1 ? "dia" : "dias"} seguidos` : "feitas"}
            </p>
          </div>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="jr-bar h-full rounded-full" style={{ width: `${pct}%` }} />
        </div>

        <ul className="mt-4 space-y-2">
          {[...plan.slots].sort((a, b) => parseInt(a.when, 10) - parseInt(b.when, 10)).map((s) => {
            const checked = isChecked(s.id);
            return (
              <li
                key={s.id}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition ${
                  checked ? "bg-emerald-400/[0.08]" : "bg-white/[0.04]"
                }`}
              >
                <CheckButton checked={checked} onClick={() => void toggle("plan", `${date}|${s.id}`, !checked)} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-stone-500">
                    <span className="font-mono normal-case">{s.when}</span>
                    {s.channel === "story" ? "Story · Status" : "Reels · TikTok · Feed"}
                    {s.essential ? <span className="text-emerald-300">★</span> : null}
                  </p>
                  <p className={`truncate text-sm font-semibold ${checked ? "text-stone-500 line-through" : "text-white"}`}>
                    {s.format.label}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>

        <Link
          href="/comunidade/cronograma"
          className="jr-cta mt-4 flex items-center justify-center rounded-xl px-4 py-3 text-xs font-extrabold uppercase tracking-wider text-zinc-950"
        >
          Ver como fazer cada uma →
        </Link>
      </div>
    </div>
  );
}

export function ScheduleView({
  data,
  toggle,
  header,
}: {
  data: CommunityData;
  toggle: Toggle;
  header: (right: React.ReactNode) => React.ReactNode;
}) {
  const { weekStart, today: todayWeekday, items, checkedItemIds } = data.schedule;
  const [day, setDay] = useState(todayWeekday);
  const [essentialOnly, setEssentialOnly] = useState(false);

  useEffect(() => {
    setEssentialOnly(window.localStorage.getItem(ESSENTIAL_KEY) === "1");
  }, []);

  function setMode(on: boolean) {
    setEssentialOnly(on);
    window.localStorage.setItem(ESSENTIAL_KEY, on ? "1" : "0");
  }

  const date = addDays(weekStart, day - 1);
  const locked = date > data.plan.today;
  const { plan, isChecked } = planDayProgress(data, date);
  const slots = essentialOnly ? plan.slots.filter((s) => s.essential) : plan.slots;
  const reels = slots.filter((s) => s.channel === "reels");
  const stories = slots.filter((s) => s.channel === "story");
  const extras = items.filter((i) => i.weekday === day);
  const streak = currentStreak(data);

  const weekDays = WEEKDAY_LABELS.map((_, i) => planDayProgress(data, addDays(weekStart, i)));
  const weekDone = weekDays.reduce((s, d) => s + d.done, 0);
  const weekTotal = weekDays.reduce((s, d) => s + d.total, 0);

  const formatLinks = new Map(data.plan.formats.map((f) => [f.format_key, f]));
  const lessonHref = (lessonId: string | null | undefined) => {
    const l = lessonId ? data.lessons.find((x) => x.id === lessonId) : null;
    return l ? `/comunidade/${l.module}?aula=${l.id}` : null;
  };

  const renderSlot = (s: PlanSlot) => {
    const link = formatLinks.get(s.format.key);
    const checked = isChecked(s.id);
    return (
      <SlotCard
        key={s.id}
        slot={s}
        checked={checked}
        locked={locked}
        material={link?.material_url ?? null}
        lessonHref={lessonHref(link?.lesson_id)}
        onToggle={() => void toggle("plan", `${date}|${s.id}`, !checked)}
      />
    );
  };

  return (
    <main className="mx-auto max-w-4xl px-4 pb-20 pt-6 sm:px-8">
      {header(
        <div className="flex items-center gap-5 text-right">
          <div>
            <p className="font-mono text-2xl font-semibold text-emerald-400">🔥 {streak}</p>
            <p className="text-[11px] text-stone-500">{streak === 1 ? "dia seguido" : "dias seguidos"}</p>
          </div>
          <div>
            <p className="font-mono text-2xl font-semibold text-white">
              {weekTotal ? Math.round((weekDone / weekTotal) * 100) : 0}%
            </p>
            <p className="text-[11px] text-stone-500">da semana</p>
          </div>
        </div>
      )}

      <details className="cm-glass mt-6 rounded-2xl px-4 py-3 text-sm text-stone-300">
        <summary className="cursor-pointer font-semibold text-white">Como funciona o cronograma</summary>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-stone-400">
          <li>
            Todo dia tem <strong className="text-stone-200">posts pro Reels, TikTok e feed</strong> (o mesmo
            conteúdo nos três) e até <strong className="text-stone-200">3 stories</strong>, que você também posta
            no Status do WhatsApp.
          </li>
          <li>
            O feed de todo dia são <strong className="text-stone-200">2 posts de fotos</strong>: fotos do catálogo
            no seu fundo e fotos feitas com IA.
          </li>
          <li>
            O <strong className="text-amber-200">vídeo girando camiseta</strong> e o{" "}
            <strong className="text-amber-200">vídeo puxando bermuda</strong> vão pro feed 1 vez por semana.
          </li>
          <li>
            Kits, qualidade, cortes, narração e vídeo aparecendo vão pro feed só{" "}
            <strong className="text-stone-200">1 vez por mês</strong>. Nos stories eles aparecem toda semana e pode
            repetir à vontade.
          </li>
          <li>
            Sem tempo? Faça só o <strong className="text-emerald-300">★ Essencial</strong>: o post principal e o
            story da noite, que é o que mais gera pedido.
          </li>
          <li>Dê o check quando postar e mantenha a sequência 🔥. Constância é o que faz vender.</li>
        </ul>
      </details>

      <div className="cm-row mt-6 flex gap-2 overflow-x-auto pb-2">
        {WEEKDAY_LABELS.map((label, i) => {
          const wd = i + 1;
          const d = weekDays[i]!;
          const active = wd === day;
          return (
            <button
              key={label}
              type="button"
              onClick={() => setDay(wd)}
              className={`min-w-[84px] shrink-0 rounded-xl px-3 py-2.5 text-center transition ${
                active ? "bg-white text-zinc-950" : "cm-glass text-stone-300 hover:bg-white/10"
              }`}
            >
              <span className="block text-xs font-bold">{wd === todayWeekday ? "Hoje" : label.slice(0, 3)}</span>
              <span className={`block text-[11px] ${active ? "text-zinc-600" : "text-stone-500"}`}>
                {formatDay(d.plan.date)}
              </span>
              <span
                className={`mx-auto mt-1 block h-1.5 w-1.5 rounded-full ${
                  d.complete ? "bg-emerald-400" : d.done ? "bg-amber-400" : "bg-stone-600"
                }`}
              />
            </button>
          );
        })}
      </div>

      <div className="mt-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-emerald-400">
            {WEEKDAY_LABELS[day - 1]}
            {day === todayWeekday ? " · hoje" : ""}
          </p>
          <h2 className="mt-1 text-2xl font-extrabold uppercase tracking-tight text-white">{plan.theme}</h2>
          <p className="mt-1 text-sm text-stone-400">{plan.themeTip}</p>
        </div>
        <div className="cm-glass flex rounded-full p-1 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setMode(false)}
            className={`rounded-full px-3 py-1.5 transition ${!essentialOnly ? "bg-white text-zinc-950" : "text-stone-300"}`}
          >
            Completo
          </button>
          <button
            type="button"
            onClick={() => setMode(true)}
            className={`rounded-full px-3 py-1.5 transition ${essentialOnly ? "bg-emerald-400 text-zinc-950" : "text-stone-300"}`}
          >
            ★ Só o essencial
          </button>
        </div>
      </div>

      {locked ? (
        <p className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-stone-400">
          Esse dia ainda não chegou. Dá pra adiantar o material, mas o check libera no dia.
        </p>
      ) : null}

      <h3 className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-stone-400">Reels · TikTok · Feed</h3>
      <ul className="mt-3 space-y-3">{reels.map(renderSlot)}</ul>

      {stories.length ? (
        <>
          <h3 className="mt-8 text-xs font-bold uppercase tracking-[0.2em] text-stone-400">Stories · Status do WhatsApp</h3>
          <ul className="mt-3 space-y-3">{stories.map(renderSlot)}</ul>
        </>
      ) : null}

      {extras.length ? (
        <>
          <h3 className="mt-8 text-xs font-bold uppercase tracking-[0.2em] text-stone-400">Extra da equipe DYCASHOP</h3>
          <ul className="mt-3 space-y-3">
            {extras.map((it) => {
              const checked = checkedItemIds.includes(it.id);
              return (
                <li key={it.id} className={`cm-slot flex gap-4 rounded-2xl p-4 sm:p-5 ${checked ? "cm-slot-done" : ""}`}>
                  <CheckButton checked={checked} onClick={() => void toggle("schedule", it.id, !checked)} />
                  <div className="min-w-0 flex-1">
                    <p className={`font-semibold ${checked ? "text-stone-400 line-through" : "text-white"}`}>{it.title}</p>
                    {it.description ? (
                      <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-stone-400">{it.description}</p>
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
        </>
      ) : null}
    </main>
  );
}

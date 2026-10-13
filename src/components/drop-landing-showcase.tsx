"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { WEEKDAY_LABELS, addDays, saoPauloToday } from "@/lib/drop-community";
import { buildDayPlan, type PlanSlot } from "@/lib/drop-content-plan";
import {
  FREE_PIECE_EVERY,
  PIECE_MILESTONES,
  SPEND_MILESTONES,
  SUPPORT_AT_PIECES,
  computeRewards,
} from "@/lib/drop-rewards";

function money(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function useInView<T extends Element>(onEnter: () => void) {
  const ref = useRef<T>(null);
  const fired = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && !fired.current) {
          fired.current = true;
          onEnter();
          io.disconnect();
        }
      },
      { threshold: 0.35 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [onEnter]);
  return ref;
}

function Tick({ size = 15 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="none" aria-hidden>
      <path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Lock() {
  return (
    <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function BrowserFrame({ url, children }: { url: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[22px] border border-white/10 bg-[#050807] shadow-[0_40px_120px_-30px_rgba(16,185,129,0.35)]">
      <div className="flex items-center gap-2 border-b border-white/[0.07] bg-white/[0.03] px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <span className="ml-3 truncate rounded-md bg-black/40 px-3 py-1 font-mono text-[10px] text-stone-500">{url}</span>
      </div>
      <div className="p-3 sm:p-5">{children}</div>
    </div>
  );
}

/* ---------- Cronograma ---------- */

function sortByHour(slots: PlanSlot[]) {
  return [...slots].sort((a, b) => parseInt(a.when, 10) - parseInt(b.when, 10));
}

export function CommunityShowcase() {
  const [today, setToday] = useState<{ date: string; weekday: number } | null>(null);
  const [day, setDay] = useState(1);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    const t = saoPauloToday();
    setToday(t);
    setDay(t.weekday);
  }, []);

  if (!today) {
    return <div className="h-[560px] rounded-[22px] border border-white/10 bg-white/[0.02]" aria-hidden />;
  }

  const weekStart = addDays(today.date, 1 - today.weekday);
  const date = addDays(weekStart, day - 1);
  const plan = buildDayPlan(date);
  const slots = sortByHour(plan.slots);
  const key = (id: string) => `${date}|${id}`;
  const done = slots.filter((s) => checked[key(s.id)]).length;
  const essentialDone = slots.filter((s) => s.essential).every((s) => checked[key(s.id)]);
  const pct = Math.round((done / slots.length) * 100);
  const openSlot = slots.find((s) => s.id === open) ?? null;

  return (
    <BrowserFrame url="dycashop.vercel.app/comunidade">
      <div className="flex gap-1 overflow-x-auto pb-3">
        {WEEKDAY_LABELS.map((label, i) => {
          const wd = i + 1;
          const active = wd === day;
          return (
            <button
              key={label}
              type="button"
              onClick={() => {
                setDay(wd);
                setOpen(null);
              }}
              className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
                active ? "bg-emerald-400 text-zinc-950" : "bg-white/[0.05] text-stone-400 hover:text-white"
              }`}
            >
              {label.slice(0, 3)}
              {wd === today.weekday ? " · hoje" : ""}
            </button>
          );
        })}
      </div>

      <div className="jr-hero relative overflow-hidden rounded-3xl p-5 sm:p-6">
        <div>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-emerald-400">
                {day === today.weekday ? "Tarefas de hoje" : `Tarefas de ${WEEKDAY_LABELS[day - 1]}`}
              </p>
              <h3 className="mt-1 text-xl font-black uppercase tracking-tight text-white sm:text-2xl">{plan.theme}</h3>
              <p className="mt-1 text-xs text-stone-400">{plan.themeTip}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-mono text-2xl font-bold text-white">
                {done}
                <span className="text-stone-500">/{slots.length}</span>
              </p>
              <p className="text-[10px] uppercase tracking-wider text-stone-500">
                {essentialDone ? "🔥 dia completo" : "feitas"}
              </p>
            </div>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="jr-bar h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%` }} />
          </div>

          <ul className="mt-4 space-y-2">
            {slots.map((s) => {
              const isOn = Boolean(checked[key(s.id)]);
              const isOpen = open === s.id;
              return (
                <li
                  key={s.id}
                  className={`rounded-xl transition ${isOn ? "bg-emerald-400/[0.08]" : "bg-white/[0.04]"} ${
                    isOpen ? "ring-1 ring-emerald-400/40" : ""
                  }`}
                >
                  <div className="flex items-center gap-3 px-3 py-2.5">
                    <button
                      type="button"
                      aria-pressed={isOn}
                      aria-label={isOn ? "Desmarcar" : "Marcar como postado"}
                      onClick={() => setChecked((c) => ({ ...c, [key(s.id)]: !isOn }))}
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition ${
                        isOn
                          ? "border-emerald-400 bg-emerald-400 text-zinc-950 shadow-[0_0_18px_rgba(16,185,129,0.55)]"
                          : "border-stone-500 text-transparent hover:border-emerald-400"
                      }`}
                    >
                      <Tick />
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpen(isOpen ? null : s.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-stone-500">
                        {s.channel === "story" ? "Story · Status" : "Reels · TikTok · Feed"}
                        {s.essential ? <span className="text-emerald-300">★ essencial</span> : null}
                      </p>
                      <p className={`truncate text-sm font-semibold ${isOn ? "text-stone-500 line-through" : "text-white"}`}>
                        {s.format.label}
                      </p>
                    </button>
                    <span className={`text-stone-500 transition ${isOpen ? "rotate-180" : ""}`} aria-hidden>
                      ▾
                    </span>
                  </div>
                  {isOpen && openSlot ? (
                    <div className="border-t border-white/[0.06] px-4 py-3 text-sm leading-relaxed">
                      <p className="text-stone-300">{openSlot.format.how}</p>
                      {openSlot.text ? (
                        <p className="mt-2 text-stone-100">
                          <span className="mr-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-400">
                            No story:
                          </span>
                          {openSlot.text}
                        </p>
                      ) : null}
                      <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-200">
                        Material pronto na comunidade
                      </p>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      <p className="mt-3 text-center text-[11px] text-stone-500">
        Esse é o cronograma real de {day === today.weekday ? "hoje" : WEEKDAY_LABELS[day - 1].toLowerCase()}.
        Toque numa tarefa pra ver como fazer e marque o ✓.
      </p>
    </BrowserFrame>
  );
}

/* ---------- Jornada ---------- */

const SLIDER_MAX = 1000;
const PIECES_MAX = 2500;
const START_SLIDER = 330;

function sliderToPieces(v: number) {
  return Math.round(PIECES_MAX * Math.pow(v / SLIDER_MAX, 2.5));
}

/** Total em compras se todas as peças fossem compradas no preço de cada nível. */
function spentFor(pieces: number) {
  const tiers = PIECE_MILESTONES.filter((m) => m.price != null);
  return tiers.reduce((total, t, i) => {
    const end = Math.min(pieces, tiers[i + 1]?.at ?? Infinity);
    return total + Math.max(0, end - t.at) * t.price!;
  }, 0);
}

export function JourneyShowcase() {
  const [slider, setSlider] = useState(0);
  const touched = useRef(false);

  const startDemo = useRef(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setSlider(START_SLIDER);
      return;
    }
    const t0 = performance.now();
    const tick = (t: number) => {
      if (touched.current) return;
      const p = Math.min(1, (t - t0) / 1800);
      setSlider(Math.round(START_SLIDER * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }).current;
  const ref = useInView<HTMLDivElement>(startDemo);

  const pieces = sliderToPieces(slider);
  const spent = spentFor(pieces);
  const r = computeRewards(pieces, spent, []);
  const ladder = PIECE_MILESTONES.filter((m) => m.price != null);

  return (
    <div ref={ref}>
      <BrowserFrame url="dycashop.vercel.app/comunidade/jornada">
        <div className="jr-hero relative overflow-hidden rounded-3xl p-5 sm:p-8">
          <div className="grid gap-8 lg:grid-cols-[1fr_1.05fr] lg:items-center">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-emerald-400">Sua jornada DYCASHOP</p>
              <p className="mt-2 text-base font-bold uppercase tracking-[0.2em] text-stone-300/80">Nível</p>
              <p className="text-4xl font-black uppercase leading-none tracking-tight sm:text-5xl">
                <span className="jr-shimmer">{r.rank}</span>
              </p>
              <div className="mt-5 flex items-end gap-3">
                <span className="jr-number font-black tabular-nums leading-none text-white">{pieces}</span>
                <span className="pb-2 text-xs uppercase tracking-[0.2em] text-stone-400">peças vendidas</span>
              </div>

              <label className="mt-6 block">
                <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-200">
                  Arraste e simule suas vendas →
                </span>
                <input
                  type="range"
                  min={0}
                  max={SLIDER_MAX}
                  value={slider}
                  onChange={(e) => {
                    touched.current = true;
                    setSlider(Number(e.target.value));
                  }}
                  className="mt-2 w-full accent-emerald-400"
                />
              </label>

              {r.next ? (
                <div className="jr-glass mt-4 rounded-2xl px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-500">
                    Próxima conquista · {r.next.at} peças
                  </p>
                  <p className="text-sm font-bold text-white">{r.next.title}</p>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div className="jr-bar h-full rounded-full" style={{ width: `${Math.round(r.progressToNext * 100)}%` }} />
                  </div>
                </div>
              ) : (
                <p className="jr-glass mt-4 rounded-2xl px-4 py-3 text-sm font-bold text-emerald-300">
                  Nível máximo: o menor preço da DYCASHOP
                </p>
              )}
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                {[
                  { l: "Seu preço", v: `R$ ${r.unitPrice}`, accent: true },
                  { l: "Peças grátis", v: String(r.freeEarned) },
                  { l: "Vídeos exclusivos", v: r.hasSupport ? "∞" : String(r.videosEarned) },
                ].map((s) => (
                  <div key={s.l} className="jr-glass rounded-2xl px-3 py-3">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-stone-500">{s.l}</p>
                    <p className={`mt-1 font-mono text-xl font-bold tabular-nums ${s.accent ? "text-emerald-300" : "text-white"}`}>
                      {s.v}
                    </p>
                  </div>
                ))}
              </div>

              <div className="jr-glass rounded-2xl p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-500">
                  A cada {FREE_PIECE_EVERY} peças, 1 grátis
                </p>
                <div className="mt-2 grid grid-cols-10 gap-1">
                  {Array.from({ length: FREE_PIECE_EVERY }).map((_, i) => (
                    <span
                      key={i}
                      className={`aspect-square rounded-md transition ${i < r.cycle ? "jr-slot-lit" : "bg-white/[0.06]"}`}
                    />
                  ))}
                </div>
              </div>

              <div className="jr-glass rounded-2xl p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-500">Quanto mais vende, mais barato</p>
                <div className="mt-3 flex h-28 items-end gap-2">
                  {ladder.map((s) => {
                    const reached = pieces >= s.at;
                    const current = s.price === r.unitPrice;
                    return (
                      <div key={s.at} className="flex h-full flex-1 flex-col items-center justify-end">
                        <span className={`mb-1 font-mono text-xs font-bold ${current ? "text-emerald-300" : reached ? "text-white" : "text-stone-600"}`}>
                          R${s.price}
                        </span>
                        <div
                          className={`w-full rounded-t-lg transition-colors ${current ? "jr-step-current" : reached ? "jr-step-reached" : "jr-step-locked"}`}
                          style={{ height: `${30 + ((s.price! - 19) / 6) * 70}%` }}
                        />
                        <span className="mt-1 text-[9px] font-semibold uppercase text-stone-500">{s.at === 0 ? "Início" : `${s.at}`}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <p className={`jr-glass rounded-2xl px-4 py-3 text-xs ${r.hasSupport ? "text-emerald-200" : "text-stone-400"}`}>
                {r.hasSupport ? (
                  <>
                    <strong>Suporte exclusivo liberado:</strong> vídeos e mídias só pra você, sem limite.
                  </>
                ) : (
                  <>
                    Com <strong className="text-white">{SUPPORT_AT_PIECES} peças</strong> você ganha suporte exclusivo e
                    pede vídeos sem limite.
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {SPEND_MILESTONES.map((m) => {
              const on = spent >= m.at;
              return (
                <article key={m.at} className={`jr-prize relative overflow-hidden rounded-2xl ${on ? "jr-prize-on" : "jr-prize-off"}`}>
                  <div className="relative aspect-[4/3]">
                    <Image src={m.image} alt={m.title} fill sizes="(min-width: 640px) 30vw, 100vw" className="jr-prize-img object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
                    <span
                      className={`absolute left-3 top-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${
                        on ? "bg-emerald-400 text-zinc-950" : "bg-black/70 text-stone-300 ring-1 ring-white/15"
                      }`}
                    >
                      {on ? <Tick size={11} /> : <Lock />}
                      {on ? "Desbloqueado" : money(m.at)}
                    </span>
                  </div>
                  <div className="relative -mt-8 p-4">
                    <p className="font-mono text-[11px] font-bold text-emerald-300">{money(m.at)} em compras</p>
                    <p className="mt-0.5 text-base font-black uppercase tracking-tight text-white">{m.title}</p>
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                      <div className="jr-bar h-full rounded-full" style={{ width: `${Math.round(Math.min(1, spent / m.at) * 100)}%` }} />
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          <p className="mt-4 text-center text-[11px] text-stone-500">
            Simulação: {pieces} peças ≈ {money(spent)} em compras. Na comunidade, cada pedido confirmado entra sozinho.
          </p>
        </div>
      </BrowserFrame>
    </div>
  );
}

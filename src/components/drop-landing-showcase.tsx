"use client";

import { useEffect, useState, type ReactNode } from "react";
import { WEEKDAY_LABELS, addDays, saoPauloToday } from "@/lib/drop-community";
import { buildDayPlan, type PlanSlot } from "@/lib/drop-content-plan";

function Tick({ size = 15 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="none" aria-hidden>
      <path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
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

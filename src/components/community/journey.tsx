"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  FREE_PIECE_EVERY,
  PIECE_MILESTONES,
  REWARD_KIND_LABELS,
  SPEND_MILESTONES,
  computeRewards,
  type PieceMilestone,
  type RewardClaim,
  type RewardKind,
  type RewardsState,
} from "@/lib/drop-rewards";
import { DROP_LOGIN_PATH } from "@/lib/dropshipping";

type JourneyOrder = { id: string; number: number | null; amount: number; pieces: number; confirmedAt: string };

export type JourneyData = {
  hasPhone: boolean;
  isOwner: boolean;
  since: string;
  pieces: number;
  spent: number;
  orders: JourneyOrder[];
  claims: RewardClaim[];
};

export function useJourney() {
  const [data, setData] = useState<JourneyData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/drop/rewards", { credentials: "include" });
    if (res.status === 401) {
      window.location.replace(DROP_LOGIN_PATH);
      return;
    }
    const json = (await res.json()) as JourneyData & { error?: string };
    if (!res.ok) setError(json.error ?? "Falha ao carregar sua jornada");
    else setData(json);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, error, reload: load };
}

function money(n: number, cents = false) {
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: cents ? 2 : 0,
    minimumFractionDigits: cents ? 2 : 0,
  });
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
}

function useCountUp(target: number, ms = 1400) {
  const [value, setValue] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const start = performance.now();
    const origin = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / ms);
      const v = origin + (target - origin) * (1 - Math.pow(1 - p, 3));
      setValue(v);
      from.current = v;
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}

/* ---------- ícones ---------- */

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  switch (name) {
    case "shirt":
      return <svg {...p}><path d="M8 3 4 5.5 2.5 10l3 1.2V21h13v-9.8l3-1.2L20 5.5 16 3c-.6 1.5-2.1 2.5-4 2.5S8.6 4.5 8 3Z" /></svg>;
    case "video":
      return <svg {...p}><rect x="3" y="5" width="13" height="14" rx="2.5" /><path d="m16 10 5-3v10l-5-3" /></svg>;
    case "lock":
      return <svg {...p}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>;
    case "check":
      return <svg {...p} strokeWidth={2.4}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;
    case "staff":
      return <svg {...p}><path d="M4 14v-2a8 8 0 0 1 16 0v2" /><rect x="3" y="13" width="4" height="6" rx="1.5" /><rect x="17" y="13" width="4" height="6" rx="1.5" /><path d="M19 19c0 1.5-2 2.5-5 2.5" /></svg>;
    case "price":
      return <svg {...p}><path d="M12 3v14" /><path d="m6 11 6 6 6-6" /><path d="M5 21h14" /></svg>;
    case "start":
      return <svg {...p}><path d="M5 21V4" /><path d="M5 4h11l-2 4 2 4H5" /></svg>;
    case "crown":
      return <svg {...p}><path d="m3 8 4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8Z" /></svg>;
    case "gift":
      return <svg {...p}><rect x="3" y="8" width="18" height="5" rx="1" /><path d="M5 13v8h14v-8M12 8v13M12 8c-2.5 0-4.5-1-4.5-2.7C7.5 3.8 9 3 10 3.6 11.2 4.3 12 8 12 8Zm0 0c2.5 0 4.5-1 4.5-2.7 0-1.5-1.5-2.3-2.5-1.7C12.8 4.3 12 8 12 8Z" /></svg>;
    default:
      return null;
  }
}

const MILESTONE_ICON: Record<PieceMilestone["icon"], string> = { start: "start", price: "price", staff: "staff" };

/* ---------- pedido de recompensa ---------- */

function ClaimButton({
  kind,
  label,
  placeholder,
  disabled,
  demo,
  onDone,
}: {
  kind: RewardKind;
  label: string;
  placeholder: string;
  disabled: boolean;
  demo: boolean;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function send() {
    if (demo) {
      setMsg("No modo demonstração o pedido não é enviado.");
      return;
    }
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/drop/rewards", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, note }),
    });
    const json = (await res.json()) as { error?: string };
    setBusy(false);
    if (!res.ok) {
      setMsg(json.error ?? "Não deu pra enviar");
      return;
    }
    setOpen(false);
    setNote("");
    setMsg("✓ Pedido enviado! A equipe vai te chamar no WhatsApp.");
    onDone();
  }

  return (
    <div className="mt-4">
      {open ? (
        <div className="space-y-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder={placeholder}
            className="w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-sm text-white placeholder:text-stone-500 focus:border-emerald-400/60 focus:outline-none"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void send()}
              className="jr-cta rounded-lg px-4 py-2 text-xs font-extrabold uppercase tracking-wider text-zinc-950 disabled:opacity-60"
            >
              {busy ? "Enviando…" : "Confirmar pedido"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-xs text-stone-400 hover:text-white">
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen(true)}
          className="jr-cta rounded-lg px-4 py-2.5 text-xs font-extrabold uppercase tracking-wider text-zinc-950 disabled:cursor-not-allowed disabled:opacity-35 disabled:shadow-none"
        >
          {label}
        </button>
      )}
      {msg ? <p className="mt-2 text-xs text-emerald-300">{msg}</p> : null}
    </div>
  );
}

/* ---------- blocos ---------- */

function ProgressRing({ r, pieces }: { r: RewardsState; pieces: number }) {
  const size = 280;
  const radius = 118;
  const circ = 2 * Math.PI * radius;
  const shown = useCountUp(pieces);
  const pct = useCountUp(Math.min(1, r.progressToNext) * 1000) / 1000;
  return (
    <div className="relative mx-auto h-[240px] w-[240px] sm:h-[280px] sm:w-[280px]">
      <div className="jr-ring-halo absolute inset-6 rounded-full" />
      <svg viewBox={`0 0 ${size} ${size}`} className="relative h-full w-full -rotate-90">
        <defs>
          <linearGradient id="jr-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#6ee7b7" />
            <stop offset="55%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#047857" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="rgba(255,255,255,0.07)" strokeWidth={16} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="url(#jr-ring)"
          strokeWidth={16}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - pct)}
          className="jr-ring-glow"
        />
        {Array.from({ length: 40 }).map((_, i) => {
          const a = (i / 40) * Math.PI * 2;
          const x1 = size / 2 + Math.cos(a) * 136;
          const y1 = size / 2 + Math.sin(a) * 136;
          const x2 = size / 2 + Math.cos(a) * (i % 5 === 0 ? 128 : 132);
          const y2 = size / 2 + Math.sin(a) * (i % 5 === 0 ? 128 : 132);
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={i / 40 <= pct ? "#34d399" : "rgba(255,255,255,0.12)"} strokeWidth={1.5} />;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-emerald-300/80">Peças vendidas</span>
        <span className="jr-number mt-1 font-black tabular-nums leading-none text-white">{Math.round(shown)}</span>
        <span className="mt-2 text-xs text-stone-400">
          {r.next ? (
            <>
              faltam <strong className="text-emerald-300">{r.next.at - pieces}</strong> pro nível {r.next.rank}
            </>
          ) : (
            "nível máximo atingido"
          )}
        </span>
      </div>
    </div>
  );
}

function HeroStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="jr-glass rounded-2xl px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-500">{label}</p>
      <p className={`mt-1 font-mono text-xl font-bold tabular-nums sm:text-2xl ${accent ? "text-emerald-300" : "text-white"}`}>{value}</p>
    </div>
  );
}

function Hero({ r, data }: { r: RewardsState; data: { spent: number; orders: number } }) {
  const spent = useCountUp(data.spent);
  return (
    <section className="jr-hero relative overflow-hidden rounded-[28px] p-6 sm:p-10">
      <div className="relative grid items-center gap-8 lg:grid-cols-[1.15fr_1fr]">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-emerald-400">Sua jornada DYCASHOP</p>
          <h1 className="mt-3 text-4xl font-black uppercase leading-[0.92] tracking-tight sm:text-6xl">
            <span className="block text-stone-300/80 text-lg font-bold tracking-[0.2em] sm:text-xl">Nível</span>
            <span className="jr-shimmer">{r.rank}</span>
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-stone-300">
            Cada pedido confirmado no seu WhatsApp conta aqui. Quanto mais você vende, mais o preço cai e mais
            recompensas você desbloqueia.
          </p>

          <div className="mt-6 grid grid-cols-3 gap-2 sm:gap-3">
            <HeroStat label="Em compras" value={money(spent)} />
            <HeroStat label="Seu preço" value={`R$ ${r.unitPrice}`} accent />
            <HeroStat label="Pedidos" value={String(data.orders)} />
          </div>

          {r.next ? (
            <div className="jr-glass mt-4 flex items-center gap-3 rounded-2xl px-4 py-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-400/15 text-emerald-300">
                <Icon name={MILESTONE_ICON[r.next.icon]} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-500">Próxima conquista · {r.next.at} peças</p>
                <p className="truncate text-sm font-bold text-white">{r.next.title}</p>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className="jr-bar h-full rounded-full" style={{ width: `${Math.round(r.progressToNext * 100)}%` }} />
                </div>
              </div>
            </div>
          ) : null}
        </div>
        <ProgressRing r={r} pieces={r.pieces} />
      </div>
    </section>
  );
}

function CycleCards({ r, demo, reload }: { r: RewardsState; demo: boolean; reload: () => void }) {
  return (
    <section className="grid gap-4 md:grid-cols-2">
      <div className="jr-card relative overflow-hidden rounded-3xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-emerald-400">A cada {FREE_PIECE_EVERY} peças</p>
            <h3 className="mt-1 text-2xl font-black uppercase tracking-tight text-white">1 peça grátis</h3>
          </div>
          <div className="text-right">
            <p className="jr-number-sm font-black tabular-nums text-emerald-300">{r.freeAvailable}</p>
            <p className="text-[10px] uppercase tracking-wider text-stone-500">pra resgatar</p>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-10 gap-1.5">
          {Array.from({ length: FREE_PIECE_EVERY }).map((_, i) => {
            const lit = i < r.cycle;
            return (
              <span
                key={i}
                className={`flex aspect-square items-center justify-center rounded-lg transition ${
                  lit ? "jr-slot-lit text-zinc-950" : "bg-white/[0.05] text-stone-600"
                }`}
                style={{ transitionDelay: `${i * 40}ms` }}
              >
                {i === FREE_PIECE_EVERY - 1 ? <Icon name="gift" size={14} /> : <Icon name="shirt" size={14} />}
              </span>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-stone-400">
          <strong className="text-white">{r.cycle}</strong> de {FREE_PIECE_EVERY} · faltam{" "}
          <strong className="text-emerald-300">{FREE_PIECE_EVERY - r.cycle}</strong> peças pra próxima grátis
          {r.freeEarned ? ` · ${r.freeEarned} ganhas até agora` : ""}
        </p>
        <ClaimButton
          kind="free_piece"
          label={r.freeAvailable ? "Resgatar peça grátis" : "Venda mais pra liberar"}
          placeholder="Qual peça, cor e tamanho você quer? Vai junto no próximo pedido."
          disabled={!r.freeAvailable}
          demo={demo}
          onDone={reload}
        />
      </div>

      <div className="jr-card relative overflow-hidden rounded-3xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-emerald-400">
              {r.hasSupport ? "Suporte exclusivo liberado" : `A cada ${FREE_PIECE_EVERY} peças`}
            </p>
            <h3 className="mt-1 text-2xl font-black uppercase tracking-tight text-white">Vídeo exclusivo</h3>
          </div>
          {r.hasSupport ? (
            <span className="rounded-full bg-emerald-400 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-zinc-950">
              Sem limite
            </span>
          ) : (
            <div className="text-right">
              <p className="jr-number-sm font-black tabular-nums text-emerald-300">{r.videosAvailable}</p>
              <p className="text-[10px] uppercase tracking-wider text-stone-500">pra pedir</p>
            </div>
          )}
        </div>
        <p className="mt-4 text-sm leading-relaxed text-stone-300">
          A gente grava um vídeo só seu, com a peça que você escolher, pra você postar e vender mais.
        </p>
        {r.hasSupport ? (
          <div className="jr-glass mt-4 flex items-center gap-3 rounded-2xl px-4 py-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-400/15 text-emerald-300">
              <Icon name="staff" />
            </span>
            <p className="text-sm text-stone-200">
              Você tem <strong className="text-white">suporte exclusivo</strong>: peça vídeos e mídias exclusivas sem
              limite.
            </p>
          </div>
        ) : (
          <>
            <div className="mt-4 flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                <div className="jr-bar h-full rounded-full" style={{ width: `${r.pieces}%` }} />
              </div>
              <span className="font-mono text-xs text-stone-400">{r.pieces}/100</span>
            </div>
            <p className="mt-2 text-xs text-stone-400">
              Com <strong className="text-emerald-300">100 peças</strong> você libera o suporte exclusivo e pede
              vídeos sem limite.
            </p>
          </>
        )}
        <ClaimButton
          kind="video"
          label={r.canRequestVideo ? "Pedir vídeo exclusivo" : "Venda mais pra liberar"}
          placeholder="Qual peça você quer no vídeo? Tem alguma ideia?"
          disabled={!r.canRequestVideo}
          demo={demo}
          onDone={reload}
        />
      </div>
    </section>
  );
}

function PriceLadder({ r }: { r: RewardsState }) {
  const steps = PIECE_MILESTONES.filter((m) => m.price != null);
  return (
    <section className="jr-card rounded-3xl p-6 sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-emerald-400">Quanto mais você vende</p>
          <h2 className="mt-1 text-2xl font-black uppercase tracking-tight text-white sm:text-3xl">Mais barato fica</h2>
        </div>
        <p className="text-sm text-stone-400">
          Seu preço por peça hoje: <strong className="font-mono text-lg text-emerald-300">R$ {r.unitPrice},00</strong>
        </p>
      </div>
      <div className="mt-8 flex h-56 items-end gap-2 sm:gap-4">
        {steps.map((s) => {
          const reached = r.pieces >= s.at;
          const current = s.price === r.unitPrice;
          const h = 40 + ((s.price! - 19) / 6) * 60;
          return (
            <div key={s.at} className="flex h-full flex-1 flex-col items-center justify-end">
              <span className={`mb-2 font-mono text-sm font-bold sm:text-lg ${current ? "text-emerald-300" : reached ? "text-white" : "text-stone-500"}`}>
                R$ {s.price}
              </span>
              <div
                className={`relative w-full rounded-t-2xl ${current ? "jr-step-current" : reached ? "jr-step-reached" : "jr-step-locked"}`}
                style={{ height: `${h}%` }}
              >
                {current ? (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-emerald-400 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-zinc-950">
                    Você
                  </span>
                ) : null}
                {!reached ? (
                  <span className="absolute inset-x-0 top-3 flex justify-center text-stone-500">
                    <Icon name="lock" size={14} />
                  </span>
                ) : null}
              </div>
              <span className={`mt-2 text-[10px] font-semibold uppercase tracking-wider ${reached ? "text-stone-300" : "text-stone-600"}`}>
                {s.at === 0 ? "Início" : `${s.at} pç`}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Trail({ r }: { r: RewardsState }) {
  return (
    <section>
      <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-emerald-400">Trilha de peças</p>
      <h2 className="mt-1 text-2xl font-black uppercase tracking-tight text-white sm:text-3xl">Suas conquistas</h2>
      <ol className="relative mt-6 space-y-4 pl-14 sm:pl-16">
        <span className="absolute bottom-6 left-[22px] top-6 w-[3px] rounded-full bg-white/[0.07] sm:left-[26px]" aria-hidden />
        <span
          className="jr-bar-v absolute left-[22px] top-6 w-[3px] rounded-full sm:left-[26px]"
          style={{
            height: `calc((100% - 3rem) * ${Math.min(
              1,
              (PIECE_MILESTONES.findIndex((m) => m === r.current) + (r.next ? r.progressToNext : 0)) /
                (PIECE_MILESTONES.length - 1)
            )})`,
          }}
          aria-hidden
        />
        {PIECE_MILESTONES.map((m) => {
          const reached = r.pieces >= m.at;
          const isNext = r.next === m;
          return (
            <li key={m.at} className="relative">
              <span
                className={`absolute -left-14 top-3 flex h-11 w-11 items-center justify-center rounded-full sm:-left-16 sm:h-[52px] sm:w-[52px] ${
                  reached ? "jr-node-reached text-zinc-950" : isNext ? "jr-node-next text-emerald-300" : "bg-zinc-900 text-stone-600 ring-1 ring-white/10"
                }`}
              >
                <Icon name={reached ? MILESTONE_ICON[m.icon] : isNext ? MILESTONE_ICON[m.icon] : "lock"} size={20} />
              </span>
              <div className={`rounded-2xl p-4 sm:p-5 ${reached ? "jr-card" : isNext ? "jr-card jr-card-next" : "jr-card-locked"}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`font-mono text-xs font-bold ${reached ? "text-emerald-300" : "text-stone-500"}`}>
                    {m.at === 0 ? "INÍCIO" : `${m.at} PEÇAS`}
                  </span>
                  <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-stone-300">
                    Nível {m.rank}
                  </span>
                  {reached ? (
                    <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                      <Icon name="check" size={12} /> Desbloqueado
                    </span>
                  ) : isNext ? (
                    <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-amber-300">
                      Faltam {m.at - r.pieces}
                    </span>
                  ) : null}
                </div>
                <p className={`mt-1.5 text-lg font-extrabold ${reached || isNext ? "text-white" : "text-stone-500"}`}>{m.title}</p>
                <p className={`text-sm ${reached || isNext ? "text-stone-400" : "text-stone-600"}`}>{m.desc}</p>
                {isNext ? (
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div className="jr-bar h-full rounded-full" style={{ width: `${Math.round(r.progressToNext * 100)}%` }} />
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function SpendRewards({ r, demo, reload }: { r: RewardsState; demo: boolean; reload: () => void }) {
  return (
    <section>
      <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-emerald-400">Trilha de compras</p>
      <h2 className="mt-1 text-2xl font-black uppercase tracking-tight text-white sm:text-3xl">Prêmios de membro</h2>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {SPEND_MILESTONES.map((m) => {
          const unlocked = r.spent >= m.at;
          const pct = Math.min(1, r.spent / m.at);
          const claimed = m.claim ? r.claimed(m.claim) : false;
          return (
            <article key={m.at} className={`jr-prize group relative overflow-hidden rounded-3xl ${unlocked ? "jr-prize-on" : "jr-prize-off"}`}>
              <div className="relative aspect-[4/3]">
                <Image src={m.image} alt={m.title} fill sizes="(min-width: 768px) 33vw, 100vw" className="jr-prize-img object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
                <span
                  className={`absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider ${
                    unlocked ? "bg-emerald-400 text-zinc-950" : "bg-black/70 text-stone-300 ring-1 ring-white/15"
                  }`}
                >
                  <Icon name={unlocked ? "check" : "lock"} size={12} />
                  {unlocked ? "Desbloqueado" : money(m.at)}
                </span>
              </div>
              <div className="relative -mt-10 p-5">
                <p className="font-mono text-xs font-bold text-emerald-300">{money(m.at)} em compras</p>
                <h3 className="mt-1 text-xl font-black uppercase tracking-tight text-white">{m.title}</h3>
                <p className="mt-1 text-sm text-stone-400">{m.desc}</p>
                {!unlocked ? (
                  <>
                    <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div className="jr-bar h-full rounded-full" style={{ width: `${Math.round(pct * 100)}%` }} />
                    </div>
                    <p className="mt-2 text-xs text-stone-500">Faltam {money(Math.max(0, m.at - r.spent))}</p>
                  </>
                ) : m.claim ? (
                  claimed ? (
                    <p className="mt-4 text-xs font-semibold text-emerald-300">✓ Pedido feito, a equipe vai te chamar</p>
                  ) : (
                    <ClaimButton
                      kind={m.claim}
                      label="Quero receber"
                      placeholder="Endereço de entrega (ou diga que prefere receber junto com o próximo pedido)."
                      disabled={false}
                      demo={demo}
                      onDone={reload}
                    />
                  )
                ) : (
                  <p className="mt-4 text-xs font-semibold text-emerald-300">✓ Ativo nos seus pedidos</p>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function History({ data }: { data: JourneyData }) {
  if (!data.orders.length && !data.claims.length) return null;
  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <div className="jr-card rounded-3xl p-6">
        <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-white">Pedidos que contaram</h3>
        {data.orders.length ? (
          <ul className="mt-4 divide-y divide-white/[0.06] text-sm">
            {data.orders.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="text-stone-300">
                  {o.number ? `#${o.number}` : "Pedido"} · <span className="text-stone-500">{shortDate(o.confirmedAt)}</span>
                </span>
                <span className="font-mono text-stone-100">
                  +{o.pieces} pç · {money(o.amount, true)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-stone-500">Seu primeiro pedido confirmado aparece aqui.</p>
        )}
      </div>
      <div className="jr-card rounded-3xl p-6">
        <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-white">Recompensas pedidas</h3>
        {data.claims.length ? (
          <ul className="mt-4 divide-y divide-white/[0.06] text-sm">
            {data.claims.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="text-stone-300">
                  {REWARD_KIND_LABELS[c.kind]} · <span className="text-stone-500">{shortDate(c.created_at)}</span>
                </span>
                <span className={`text-xs font-bold uppercase tracking-wider ${c.status === "done" ? "text-emerald-300" : "text-amber-300"}`}>
                  {c.status === "done" ? "Entregue" : "Em andamento"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-stone-500">Quando você resgatar uma recompensa, ela aparece aqui.</p>
        )}
      </div>
    </section>
  );
}

function DemoPanel({
  pieces,
  spent,
  enabled,
  onChange,
}: {
  pieces: number;
  spent: number;
  enabled: boolean;
  onChange: (v: { pieces: number; spent: number; enabled: boolean }) => void;
}) {
  return (
    <div className="rounded-2xl border border-amber-400/30 bg-amber-400/[0.06] p-4 text-sm">
      <label className="flex items-center gap-2 font-semibold text-amber-200">
        <input type="checkbox" checked={enabled} onChange={(e) => onChange({ pieces, spent, enabled: e.target.checked })} />
        Modo demonstração (só você vê): simule o progresso pra gravar vídeos
      </label>
      {enabled ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs text-amber-100/80">
            Peças: <strong>{pieces}</strong>
            <input type="range" min={0} max={600} value={pieces} onChange={(e) => onChange({ pieces: Number(e.target.value), spent, enabled })} className="mt-1 w-full accent-emerald-400" />
          </label>
          <label className="block text-xs text-amber-100/80">
            Compras: <strong>{money(spent)}</strong>
            <input type="range" min={0} max={60000} step={250} value={spent} onChange={(e) => onChange({ pieces, spent: Number(e.target.value), enabled })} className="mt-1 w-full accent-emerald-400" />
          </label>
        </div>
      ) : null}
    </div>
  );
}

export function JourneyView() {
  const { data, error, reload } = useJourney();
  const [demo, setDemo] = useState({ pieces: 37, spent: 3200, enabled: false });

  if (!data) {
    return <p className="py-24 text-center text-sm text-stone-500">{error ?? "Carregando sua jornada…"}</p>;
  }

  const isDemo = data.isOwner && demo.enabled;
  const pieces = isDemo ? demo.pieces : data.pieces;
  const spent = isDemo ? demo.spent : data.spent;
  const r = computeRewards(pieces, spent, isDemo ? [] : data.claims);
  const orderCount = isDemo ? Math.max(1, Math.round(demo.pieces / 6)) : data.orders.length;

  return (
    <main className="mx-auto max-w-6xl space-y-10 px-4 pb-24 pt-6 sm:px-8">
      {data.isOwner ? <DemoPanel {...demo} onChange={setDemo} /> : null}
      {!data.hasPhone && !isDemo ? (
        <p className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-stone-300">
          Não achamos o WhatsApp da sua assinatura. Fale com a equipe DYCASHOP pra ligar seus pedidos à sua jornada.
        </p>
      ) : null}

      <Hero r={r} data={{ spent, orders: orderCount }} />
      <CycleCards r={r} demo={isDemo} reload={() => void reload()} />
      <PriceLadder r={r} />
      <Trail r={r} />
      <SpendRewards r={r} demo={isDemo} reload={() => void reload()} />
      {!isDemo ? <History data={data} /> : null}

      <p className="text-center text-xs leading-relaxed text-stone-500">
        Contamos automaticamente cada pedido confirmado no WhatsApp da sua assinatura desde {shortDate(data.since)}.
        <br />
        Pedido cancelado ou reembolsado sai da conta.
      </p>
    </main>
  );
}

/** Chamada da jornada na home da comunidade. */
export function JourneyBanner() {
  const { data } = useJourney();
  const r = computeRewards(data?.pieces ?? 0, data?.spent ?? 0, data?.claims ?? []);
  return (
    <Link href="/comunidade/jornada" className="jr-hero jr-banner group relative block overflow-hidden rounded-3xl p-5 sm:p-7">
      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:gap-8">
        <div className="flex items-center gap-4">
          <span className="jr-node-reached flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-zinc-950">
            <Icon name="crown" size={28} />
          </span>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-emerald-400">Jornada · recompensas</p>
            <p className="text-2xl font-black uppercase tracking-tight sm:text-3xl">
              <span className="jr-shimmer">Nível {r.rank}</span>
            </p>
          </div>
        </div>
        <div className="flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-xs text-stone-400">
            <span>
              <strong className="font-mono text-lg text-white">{data ? r.pieces : "–"}</strong> peças ·{" "}
              <strong className="text-white">{money(r.spent)}</strong>
            </span>
            <span>{r.next ? `${r.next.at} pç: ${r.next.title}` : "Nível máximo"}</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="jr-bar h-full rounded-full transition-[width] duration-1000" style={{ width: `${Math.round(r.progressToNext * 100)}%` }} />
          </div>
          <p className="mt-2 text-xs text-stone-500">
            Peça grátis a cada 10 · preço cai até R$ 20 · pulseira, placa e preço de sócio
          </p>
        </div>
        <span className="jr-cta inline-flex shrink-0 items-center justify-center rounded-xl px-5 py-3 text-xs font-extrabold uppercase tracking-wider text-zinc-950">
          Ver minha jornada →
        </span>
      </div>
    </Link>
  );
}

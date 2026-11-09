"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useAdminAuth } from "@/contexts/admin-auth";

type Member = {
  id: string;
  email: string;
  full_name: string | null;
  whatsapp: string | null;
  active: boolean;
  created_at: string;
  subscribed_at: string;
  has_subscription: boolean;
};

type AccessReq = {
  id: string;
  full_name: string;
  email: string;
  whatsapp: string;
  status: string;
  created_at: string;
};

type Progress = {
  pieces: number;
  spent: number;
  todayPieces: number;
  todaySpent: number;
  hasPhone: boolean;
  subscribedAt: string;
  hasSubscription: boolean;
  rank: string;
  unitPrice: number;
  cycle: number;
  freeEvery: number;
  freeAvailable: number;
  videosAvailable: number;
  hasSupport: boolean;
  next: { at: number; title: string } | null;
  lessonsDone: number;
  lessonsTotal: number;
  claims: { id: string; kind: string; status: string; createdAt: string }[];
  orders: { id: string; number: number | null; pieces: number; amount: number; confirmedAt: string }[];
};

function brl(n: number) {
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

function longDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  });
}

function day(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function daysIn(iso: string) {
  const start = new Date(iso).getTime();
  const days = Math.max(1, Math.round((Date.now() - start) / 86400000));
  return days === 1 ? "1 dia no time" : `${days} dias no time`;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "DY";
}

function subscriptionLine(iso: string, hasSubscription: boolean) {
  return hasSubscription ? `Assinou em ${longDate(iso)}` : `No time desde ${longDate(iso)}`;
}

export default function AdminParceirosPage() {
  const router = useRouter();
  const { adminFetch, isOwner } = useAdminAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [requests, setRequests] = useState<AccessReq[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [saving, setSaving] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, Progress | "loading" | string>>({});
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"rank" | "recent">("rank");
  const [manageOpen, setManageOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [mounted, setMounted] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await adminFetch("/api/admin/drop-members");
      const data = (await res.json()) as {
        error?: string;
        members?: Member[];
        requests?: AccessReq[];
      };
      if (!res.ok) throw new Error(data.error ?? "Falha ao carregar");
      setMembers(data.members ?? []);
      setRequests(data.requests ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    }
  }, [adminFetch]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOwner) {
      router.replace("/admin/pedidos");
      return;
    }
    void load();
  }, [isOwner, load, router]);

  const loadProgress = useCallback(
    async (id: string) => {
      setProgress((p) => (p[id] && p[id] !== "loading" ? p : { ...p, [id]: "loading" }));
      try {
        const res = await adminFetch(`/api/admin/drop-members/${id}/progress`);
        const data = (await res.json()) as Progress & { error?: string };
        if (!res.ok) throw new Error(data.error ?? "Falha ao carregar progresso");
        setProgress((p) => ({ ...p, [id]: data }));
      } catch (e) {
        setProgress((p) => ({ ...p, [id]: e instanceof Error ? e.message : "Erro" }));
      }
    },
    [adminFetch]
  );

  const startedRef = useRef(new Set<string>());
  useEffect(() => {
    const queue = members.map((m) => m.id).filter((id) => !startedRef.current.has(id));
    for (const id of queue) startedRef.current.add(id);
    if (queue.length === 0) return;
    let cancelled = false;
    let cursor = 0;
    async function worker() {
      while (!cancelled) {
        const id = queue[cursor];
        cursor += 1;
        if (!id) return;
        await loadProgress(id);
      }
    }
    void Promise.all([worker(), worker(), worker()]);
    return () => {
      cancelled = true;
    };
  }, [members, loadProgress]);

  async function createMember(e: React.FormEvent | null, from?: AccessReq) {
    e?.preventDefault();
    setSaving(true);
    setError(null);
    setOkMsg(null);
    setRevealed(null);
    try {
      const res = await adminFetch("/api/admin/drop-members", {
        method: "POST",
        body: JSON.stringify({
          email: (from?.email ?? email).trim().toLowerCase(),
          fullName: from?.full_name ?? fullName,
          whatsapp: from?.whatsapp ?? whatsapp,
          requestId: from?.id,
        }),
      });
      const data = (await res.json()) as { error?: string; password?: string };
      if (!res.ok) throw new Error(data.error ?? "Falha ao criar");
      setEmail("");
      setFullName("");
      setWhatsapp("");
      setRevealed(data.password ?? null);
      setOkMsg("Login criado. Copie a senha agora e mande no WhatsApp — ela não aparece de novo.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro");
    } finally {
      setSaving(false);
    }
  }

  async function patch(body: Record<string, unknown>) {
    setError(null);
    const res = await adminFetch("/api/admin/drop-members", {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as { error?: string; password?: string };
    if (!res.ok) {
      setError(data.error ?? "Falha");
      return;
    }
    if (data.password) {
      setRevealed(data.password);
      setOkMsg("Nova senha gerada. Copie e envie agora.");
    }
    await load();
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = members.filter((m) => {
      if (!q) return true;
      return [m.full_name, m.email, m.whatsapp].some((v) => (v ?? "").toLowerCase().includes(q));
    });
    return list.sort((a, b) => {
      if (sort === "recent") {
        return new Date(b.subscribed_at).getTime() - new Date(a.subscribed_at).getTime();
      }
      const pa = progress[a.id];
      const pb = progress[b.id];
      const piecesA = pa && typeof pa !== "string" ? pa.pieces : -1;
      const piecesB = pb && typeof pb !== "string" ? pb.pieces : -1;
      if (piecesB !== piecesA) return piecesB - piecesA;
      return (a.full_name || a.email).localeCompare(b.full_name || b.email, "pt-BR");
    });
  }, [members, progress, query, sort]);

  const spotlight = members.find((m) => m.id === openId) ?? visible[0] ?? null;
  const spotlightProgress = spotlight ? progress[spotlight.id] : undefined;
  const pending = requests.filter((r) => r.status === "pending");
  const activeCount = members.filter((m) => m.active).length;

  if (!isOwner) return null;

  function renderBoard() {
    return (
      <Board
        members={visible}
        progress={progress}
        sort={sort}
        selectedId={spotlight?.id ?? null}
        onSelect={(id) => {
          setOpenId(id);
          const row = progress[id];
          if (!row || typeof row === "string") void loadProgress(id);
        }}
      />
    );
  }

  return (
    <div className="min-h-[calc(100vh-4.5rem)] bg-[#0c0b09] text-white">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-[#e4c15a]">
              DYCASHOP · time de parceiros
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
              A jornada de quem vende com a gente
            </h1>
            <p className="mt-2 max-w-xl text-sm text-stone-400">
              {activeCount} parceiros ativos. Cada pedido confirmado sobe o ranking, derruba o preço
              e destrava recompensa.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setRecording(true)}
            className="rounded-full bg-[#e4c15a] px-5 py-2.5 text-sm font-bold text-zinc-950 shadow-[0_0_32px_rgba(228,193,90,0.35)]"
          >
            Gravar progresso
          </button>
        </div>

        {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}
        {okMsg ? <p className="mt-4 text-sm text-emerald-300">{okMsg}</p> : null}
        {revealed ? (
          <p className="mt-3 rounded-2xl border border-emerald-400/30 bg-emerald-950/40 px-4 py-3 font-mono text-sm text-emerald-100">
            Senha: {revealed}
          </p>
        ) : null}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar parceiro"
            className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-white outline-none placeholder:text-stone-500 sm:max-w-xs"
          />
          <div className="flex rounded-full border border-white/10 p-1 text-xs">
            {(
              [
                ["rank", "Ranking"],
                ["recent", "Assinatura recente"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setSort(id)}
                className={`rounded-full px-3 py-1.5 font-semibold ${
                  sort === id ? "bg-[#e4c15a] text-zinc-950" : "text-stone-300"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6">{renderBoard()}</div>

        {spotlight && spotlightProgress && typeof spotlightProgress !== "string" ? (
          <div className="mt-8">
            <JourneyCard
              member={spotlight}
              data={spotlightProgress}
              place={sort === "rank" ? visible.findIndex((m) => m.id === spotlight.id) + 1 : null}
            />
          </div>
        ) : spotlight ? (
          <p className="mt-8 text-sm text-stone-500">Carregando a jornada de {spotlight.full_name || spotlight.email}…</p>
        ) : null}

        <section className="mt-10 rounded-3xl border border-white/10 bg-white/[0.03]">
          <button
            type="button"
            onClick={() => setManageOpen((v) => !v)}
            className="flex w-full items-center justify-between px-5 py-4 text-left"
          >
            <span className="text-sm font-semibold text-stone-200">
              Gestão de acessos
              {pending.length > 0 ? ` · ${pending.length} pedido(s)` : ""}
            </span>
            <span className="text-xs text-stone-500">{manageOpen ? "fechar" : "abrir"}</span>
          </button>
          {manageOpen ? (
            <div className="space-y-6 border-t border-white/10 px-5 py-5">
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">
                  Pedidos de acesso
                </h2>
                {pending.length === 0 ? (
                  <p className="mt-2 text-sm text-stone-500">Nenhum pendente.</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {pending.map((r) => (
                      <li
                        key={r.id}
                        className="flex flex-col gap-2 rounded-2xl border border-white/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div>
                          <p className="font-medium">{r.full_name}</p>
                          <p className="text-xs text-stone-400">
                            {r.email} · {r.whatsapp}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => void createMember(null, r)}
                            className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold"
                          >
                            Criar login
                          </button>
                          <button
                            type="button"
                            onClick={() => void patch({ requestId: r.id, requestStatus: "rejected" })}
                            className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-stone-300"
                          >
                            Recusar
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <form onSubmit={(e) => void createMember(e)} className="grid gap-2 sm:grid-cols-4">
                <input
                  required
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm"
                />
                <input
                  placeholder="Nome"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm"
                />
                <input
                  placeholder="WhatsApp"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm"
                />
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold disabled:opacity-50"
                >
                  {saving ? "Criando…" : "Gerar login"}
                </button>
              </form>

              <ul className="space-y-2">
                {members.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className={m.active ? "text-stone-200" : "text-red-300"}>
                      {m.full_name || m.email}
                      <span className="ml-2 text-xs text-stone-500">{m.email}</span>
                    </span>
                    <span className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void patch({ id: m.id, resetPassword: true })}
                        className="rounded-full border border-white/15 px-3 py-1 text-xs"
                      >
                        Nova senha
                      </button>
                      <button
                        type="button"
                        onClick={() => void patch({ id: m.id, active: !m.active })}
                        className="rounded-full border border-white/15 px-3 py-1 text-xs"
                      >
                        {m.active ? "Desativar" : "Ativar"}
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      </div>

      {mounted && recording
        ? createPortal(
            <div className="fixed inset-0 z-[80] overflow-y-auto bg-[#090807] text-white">
              <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8 sm:py-12">
                <div className="mb-8 flex items-center justify-between gap-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.38em] text-[#e4c15a]">
                    DYCASHOP
                  </p>
                  <button
                    type="button"
                    onClick={() => setRecording(false)}
                    className="rounded-full border border-white/15 px-3 py-1 text-[11px] text-stone-400"
                  >
                    Sair da gravação
                  </button>
                </div>
                {spotlight && spotlightProgress && typeof spotlightProgress !== "string" ? (
                  <JourneyCard
                    member={spotlight}
                    data={spotlightProgress}
                    place={sort === "rank" ? visible.findIndex((m) => m.id === spotlight.id) + 1 : null}
                    cinematic
                  />
                ) : (
                  <p className="text-sm text-stone-500">Escolha um parceiro antes de gravar.</p>
                )}
                <div className="mt-8">{renderBoard()}</div>
                <p className="mt-10 text-center text-sm text-stone-400">
                  Preço que cai até R$ 20. Uma peça grátis a cada 10. Pulseira, placa e preço de sócio.
                </p>
                <p className="mt-2 text-center text-xs uppercase tracking-[0.28em] text-[#e4c15a]">
                  Entre para o time
                </p>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

function Board({
  members,
  progress,
  sort,
  selectedId,
  onSelect,
}: {
  members: Member[];
  progress: Record<string, Progress | "loading" | string>;
  sort: "rank" | "recent";
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (members.length === 0) {
    return <p className="text-sm text-stone-500">Nenhum parceiro encontrado.</p>;
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {members.map((m, index) => {
        const row = progress[m.id];
        const data = row && typeof row !== "string" ? row : null;
        const place = sort === "rank" ? index + 1 : null;
        const selected = m.id === selectedId;
        return (
          <li key={m.id}>
            <button
              type="button"
              onClick={() => onSelect(m.id)}
              className={`w-full rounded-3xl border px-4 py-4 text-left transition ${
                selected
                  ? "border-[#e4c15a]/70 bg-[#e4c15a]/10"
                  : "border-white/10 bg-white/[0.03] hover:border-white/20"
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#e4c15a] text-sm font-black text-zinc-950">
                  {place && place <= 3 ? place : initials(m.full_name || m.email)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold">
                    {m.full_name || m.email}
                    {!m.active ? <span className="ml-2 text-xs font-normal text-red-300">inativo</span> : null}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-[#e4c15a]">
                    {subscriptionLine(data?.subscribedAt ?? m.subscribed_at, data?.hasSubscription ?? m.has_subscription)}
                  </span>
                </span>
              </div>
              <span className="mt-4 grid grid-cols-3 gap-2 text-center">
                <Mini label="Peças" value={data ? String(data.pieces) : "…"} />
                <Mini label="Investido" value={data ? brl(data.spent) : "…"} />
                <Mini label="Nível" value={data ? data.rank : "…"} />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-2xl bg-black/30 px-2 py-2">
      <span className="block text-[10px] uppercase tracking-[0.16em] text-stone-500">{label}</span>
      <span className="mt-1 block truncate text-sm font-bold">{value}</span>
    </span>
  );
}

function JourneyCard({
  member,
  data,
  place,
  cinematic,
}: {
  member: Member;
  data: Progress;
  place: number | null;
  cinematic?: boolean;
}) {
  const signed = subscriptionLine(data.subscribedAt || member.subscribed_at, data.hasSubscription || member.has_subscription);

  return (
    <article
      className="jr-hero relative overflow-hidden rounded-[2rem] px-5 py-7 sm:px-10 sm:py-10"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-[#e4c15a]">
            {place ? `#${place} do ranking` : "Parceiro"} · {data.rank}
          </p>
          <h2 className={`mt-2 font-black tracking-tight ${cinematic ? "text-5xl sm:text-6xl" : "text-3xl sm:text-4xl"}`}>
            {member.full_name || member.email}
          </h2>
          <p className="mt-2 text-sm text-[#f6e3a1]">
            {signed}
            <span className="text-stone-400"> · {daysIn(data.subscribedAt || member.subscribed_at)}</span>
          </p>
        </div>
        <div className="rounded-2xl border border-[#e4c15a]/30 bg-black/30 px-4 py-3 text-right">
          <p className="text-[10px] uppercase tracking-[0.2em] text-stone-400">Preço por peça</p>
          <p className="font-mono text-3xl font-black text-[#e4c15a]">{brl(data.unitPrice)}</p>
        </div>
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        <Stat label="Peças" value={String(data.pieces)} />
        <Stat label="Investido" value={brl(data.spent)} />
        <Stat label="Hoje" value={`${data.todayPieces} · ${brl(data.todaySpent)}`} />
      </div>

      {!cinematic && !data.hasPhone ? (
        <p className="mt-4 text-xs text-amber-200/80">
          Sem WhatsApp salvo. Os pedidos pagos não entram nessa conta.
        </p>
      ) : null}

      {!cinematic && data.orders.length > 0 ? (
        <div className="mt-6">
          <p className="text-[10px] uppercase tracking-[0.2em] text-stone-500">Pedidos recentes</p>
          <ul className="mt-2 space-y-1">
            {data.orders.map((o) => (
              <li key={o.id} className="flex justify-between gap-3 text-xs text-stone-300">
                <span>
                  #{o.number ?? "—"} · {o.pieces} peças
                </span>
                <span>
                  {brl(o.amount)} · {day(o.confirmedAt)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {cinematic ? (
        <p className="mt-8 text-sm leading-relaxed text-stone-300">
          {data.freeAvailable > 0
            ? `${data.freeAvailable} ${data.freeAvailable === 1 ? "peça grátis esperando resgate" : "peças grátis esperando resgate"}. `
            : "A cada 10 peças, 1 sai de graça. "}
          {data.hasSupport ? "Suporte exclusivo liberado." : "Com 100 peças o suporte exclusivo abre."}
        </p>
      ) : null}
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-black/35 px-4 py-3">
      <p className="text-[10px] uppercase tracking-[0.18em] text-stone-500">{label}</p>
      <p className="mt-1 font-mono text-2xl font-black tabular-nums">{value}</p>
    </div>
  );
}

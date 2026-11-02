"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAdminAuth } from "@/contexts/admin-auth";

type Member = {
  id: string;
  email: string;
  full_name: string | null;
  whatsapp: string | null;
  active: boolean;
  created_at: string;
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
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function day(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
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
    if (!isOwner) {
      router.replace("/admin/pedidos");
      return;
    }
    void load();
  }, [isOwner, load, router]);

  async function createMember(
    e: React.FormEvent | null,
    from?: AccessReq
  ) {
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
      setOkMsg(
        "Login criado. Copie a senha agora e mande no WhatsApp — ela não aparece de novo."
      );
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

  async function toggleProgress(id: string) {
    if (openId === id) {
      setOpenId(null);
      return;
    }
    setOpenId(id);
    const cached = progress[id];
    if (cached && cached !== "loading" && typeof cached !== "string") return;
    setProgress((p) => ({ ...p, [id]: "loading" }));
    try {
      const res = await adminFetch(`/api/admin/drop-members/${id}/progress`);
      const data = (await res.json()) as Progress & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Falha ao carregar progresso");
      setProgress((p) => ({ ...p, [id]: data }));
    } catch (e) {
      setProgress((p) => ({ ...p, [id]: e instanceof Error ? e.message : "Erro" }));
    }
  }

  if (!isOwner) return null;

  const pending = requests.filter((r) => r.status === "pending");

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <a href="/admin" className="text-xs font-medium text-violet-300/70 hover:text-violet-200">
        ← Painel
      </a>
      <h1 className="mt-3 text-2xl font-bold tracking-tight text-white">
        Parceiros · comunidade
      </h1>
      <p className="mt-2 text-sm text-violet-200/70">
        Quem assina na Kiwify cria o próprio acesso em /comunidade/criar-acesso
        (automático). Use esta tela só para criar logins manuais, resetar senha ou
        bloquear alguém.
      </p>

      {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}
      {okMsg ? <p className="mt-4 text-sm text-emerald-300">{okMsg}</p> : null}
      {revealed ? (
        <p className="mt-3 rounded-xl border border-emerald-400/30 bg-emerald-950/40 px-4 py-3 font-mono text-sm text-emerald-100">
          Senha: {revealed}
        </p>
      ) : null}

      <section className="mt-8 rounded-2xl border border-violet-400/20 bg-violet-950/30 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-violet-200">
          Pedidos de acesso
        </h2>
        {pending.length === 0 ? (
          <p className="mt-3 text-sm text-violet-300/50">Nenhum pendente.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {pending.map((r) => (
              <li
                key={r.id}
                className="flex flex-col gap-2 rounded-xl border border-white/10 bg-black/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium text-white">{r.full_name}</p>
                  <p className="text-xs text-violet-200/70">
                    {r.email} · {r.whatsapp}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void createMember(null, r)}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    Criar login
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void patch({ requestId: r.id, requestStatus: "rejected" })
                    }
                    className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-violet-200"
                  >
                    Recusar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <form
        onSubmit={(e) => void createMember(e)}
        className="mt-8 space-y-3 rounded-2xl border border-violet-400/20 p-5"
      >
        <h2 className="text-sm font-semibold uppercase tracking-wider text-violet-200">
          Criar membro
        </h2>
        <input
          required
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
        />
        <input
          placeholder="Nome"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
        />
        <input
          placeholder="WhatsApp"
          value={whatsapp}
          onChange={(e) => setWhatsapp(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
        />
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Criando…" : "Gerar login e senha"}
        </button>
      </form>

      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wider text-violet-200">
        Membros
      </h2>
      <p className="mt-1 text-xs text-violet-300/50">Clique no nome para ver o progresso.</p>
      <ul className="mt-3 space-y-2">
        {members.map((m) => {
          const open = openId === m.id;
          const row = progress[m.id];
          return (
            <li key={m.id} className="rounded-xl border border-white/10 px-4 py-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={() => void toggleProgress(m.id)}
                  className="text-left"
                >
                  <p className="font-medium text-white">
                    {m.full_name || m.email}
                    {!m.active ? (
                      <span className="ml-2 text-xs text-red-300">inativo</span>
                    ) : null}
                    <span className="ml-2 text-[10px] font-normal tracking-wide text-violet-300/50">
                      {open ? "fechar" : "ver progresso"}
                    </span>
                  </p>
                  <p className="text-xs text-violet-200/60">
                    {m.email}
                    {m.whatsapp ? ` · ${m.whatsapp}` : ""}
                  </p>
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void patch({ id: m.id, resetPassword: true })}
                    className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-violet-100"
                  >
                    Nova senha
                  </button>
                  <button
                    type="button"
                    onClick={() => void patch({ id: m.id, active: !m.active })}
                    className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-violet-100"
                  >
                    {m.active ? "Desativar" : "Ativar"}
                  </button>
                </div>
              </div>
              {open ? (
                <div className="mt-4 border-t border-white/10 pt-4">
                  {row === "loading" || !row ? (
                    <p className="text-sm text-violet-200/60">Carregando progresso…</p>
                  ) : typeof row === "string" ? (
                    <p className="text-sm text-red-300">{row}</p>
                  ) : (
                    <ProgressPanel data={row} />
                  )}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ProgressPanel({ data }: { data: Progress }) {
  const stats = [
    { label: "Peças", value: String(data.pieces) },
    { label: "Investido", value: brl(data.spent) },
    { label: "Hoje", value: `${data.todayPieces} · ${brl(data.todaySpent)}` },
    { label: "Preço de custo", value: brl(data.unitPrice) },
    { label: "Aulas", value: `${data.lessonsDone}/${data.lessonsTotal}` },
    {
      label: "Próxima meta",
      value: data.next ? `${data.next.at} peças` : "Concluída",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-sm font-semibold text-white">{data.rank}</p>
        <p className="text-xs text-violet-200/60">
          {data.cycle}/{data.freeEvery} para a próxima peça grátis
          {data.freeAvailable > 0 ? ` · ${data.freeAvailable} para resgatar` : ""}
          {data.videosAvailable > 0 ? ` · ${data.videosAvailable} vídeo(s)` : ""}
          {data.hasSupport ? " · suporte exclusivo" : ""}
        </p>
      </div>
      {!data.hasPhone ? (
        <p className="text-xs text-amber-200/80">
          Sem WhatsApp salvo. Os pedidos pagos não entram nessa conta.
        </p>
      ) : null}
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg bg-black/25 px-3 py-2">
            <dt className="text-[10px] uppercase tracking-wider text-violet-300/50">{s.label}</dt>
            <dd className="mt-0.5 text-sm font-semibold text-white">{s.value}</dd>
          </div>
        ))}
      </dl>
      {data.next ? (
        <p className="text-xs text-violet-200/55">{data.next.title}</p>
      ) : null}
      {data.orders.length > 0 ? (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-violet-300/50">Pedidos recentes</p>
          <ul className="mt-2 space-y-1">
            {data.orders.map((o) => (
              <li key={o.id} className="flex justify-between gap-3 text-xs text-violet-100/80">
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
      {data.claims.length > 0 ? (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-violet-300/50">Resgates</p>
          <ul className="mt-2 space-y-1">
            {data.claims.map((c) => (
              <li key={c.id} className="flex justify-between gap-3 text-xs text-violet-100/80">
                <span>{c.kind}</span>
                <span>
                  {c.status === "done" ? "feito" : "pendente"} · {day(c.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

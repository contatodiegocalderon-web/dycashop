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

      <ul className="mt-8 space-y-2">
        {members.map((m) => (
          <li
            key={m.id}
            className="flex flex-col gap-2 rounded-xl border border-white/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="font-medium text-white">
                {m.full_name || m.email}
                {!m.active ? (
                  <span className="ml-2 text-xs text-red-300">inativo</span>
                ) : null}
              </p>
              <p className="text-xs text-violet-200/60">
                {m.email}
                {m.whatsapp ? ` · ${m.whatsapp}` : ""}
              </p>
            </div>
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
          </li>
        ))}
      </ul>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAdminAuth } from "@/contexts/admin-auth";

type StaffUserRow = {
  id: string;
  email: string;
  role: string;
  roleLabel: string;
  fullName: string | null;
};

export default function AdminEquipePage() {
  const router = useRouter();
  const { adminFetch, isOwner } = useAdminAuth();
  const [users, setUsers] = useState<StaffUserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [saving, setSaving] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminFetch("/api/admin/staff-users");
      const data = (await res.json()) as { error?: string; users?: StaffUserRow[] };
      if (!res.ok) throw new Error(data.error ?? "Falha ao carregar equipe");
      setUsers(data.users ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [adminFetch]);

  useEffect(() => {
    if (!isOwner) {
      router.replace("/admin/pedidos");
      return;
    }
    void loadUsers();
  }, [isOwner, loadUsers, router]);

  async function createGestor(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setOkMsg(null);
    try {
      const res = await adminFetch("/api/admin/staff-users", {
        method: "POST",
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          fullName: fullName.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Falha ao criar gestor");
      setEmail("");
      setPassword("");
      setFullName("");
      setOkMsg("Conta de gestor criada. Ele entra em /admin/login com este email e senha.");
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro");
    } finally {
      setSaving(false);
    }
  }

  if (!isOwner) return null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold text-white [text-shadow:1px_0_0_rgb(124_58_237),-1px_0_0_rgb(124_58_237),0_1px_0_rgb(124_58_237),0_-1px_0_rgb(124_58_237)]">
        Equipe
      </h1>
      <p className="mt-2 text-sm text-stone-600">
        O gestor vê só Histórico e Métricas, com filtros. Não confirma pedidos, não
        exclui, não altera catálogo nem custos.
      </p>

      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}
      {okMsg && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {okMsg}
        </div>
      )}

      <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-bold uppercase tracking-wide text-stone-700">
          Criar login de gestor
        </h2>
        <form onSubmit={createGestor} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-medium text-stone-600 sm:col-span-2">
            Nome (opcional)
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-900"
              placeholder="Nome do gestor"
            />
          </label>
          <label className="block text-xs font-medium text-stone-600">
            Email
            <input
              type="email"
              required
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-900"
              placeholder="gestor@email.com"
            />
          </label>
          <label className="block text-xs font-medium text-stone-600">
            Senha (mín. 8)
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-900"
              placeholder="••••••••"
            />
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-50"
            >
              {saving ? "A criar…" : "Criar gestor"}
            </button>
          </div>
        </form>
      </section>

      <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-bold uppercase tracking-wide text-stone-700">
          Contas existentes
        </h2>
        {loading ? (
          <p className="mt-3 text-sm text-stone-500">Carregando…</p>
        ) : users.length === 0 ? (
          <p className="mt-3 text-sm text-stone-500">Nenhuma conta encontrada.</p>
        ) : (
          <ul className="mt-3 divide-y divide-stone-100">
            {users.map((u) => (
              <li key={u.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <p className="font-medium text-stone-800">
                    {u.fullName || u.email}
                  </p>
                  {u.fullName ? (
                    <p className="text-xs text-stone-500">{u.email}</p>
                  ) : null}
                </div>
                <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-stone-700">
                  {u.roleLabel}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

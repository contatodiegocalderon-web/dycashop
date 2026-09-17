"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdminAuth } from "@/contexts/admin-auth";
import { formatMoneyBrl } from "@/lib/cart-pricing";

type KitRow = {
  id: string;
  brand: string;
  color: string;
  stock: number;
  unit_price: number | null;
  weight_grams: number | null;
  drive_image_url: string;
  status: string;
};

const emptyForm = {
  title: "",
  subtitle: "",
  price: "",
  stock: "1",
  weight: "",
};

export default function AdminKitsPage() {
  const { adminFetch } = useAdminAuth();
  const [kits, setKits] = useState<KitRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [file, setFile] = useState<File | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFile, setEditFile] = useState<File | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminFetch("/api/admin/kits");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao carregar kits");
      setKits((data.kits ?? []) as KitRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }, [adminFetch]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createKit() {
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      if (!file) throw new Error("Escolha a foto do kit.");
      const fd = new FormData();
      fd.append("title", form.title);
      fd.append("subtitle", form.subtitle);
      fd.append("price", form.price);
      fd.append("stock", form.stock);
      fd.append("weight", form.weight);
      fd.append("file", file);
      const res = await adminFetch("/api/admin/kits", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao criar");
      setForm(emptyForm);
      setFile(null);
      setOk("Kit cadastrado.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit(
    kit: KitRow,
    title: string,
    subtitle: string,
    price: string,
    stock: string,
    weight: string
  ) {
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      const fd = new FormData();
      fd.append("title", title);
      fd.append("subtitle", subtitle);
      fd.append("price", price);
      fd.append("stock", stock);
      fd.append("weight", weight);
      if (editFile) fd.append("file", editFile);
      const res = await adminFetch(
        `/api/admin/kits?id=${encodeURIComponent(kit.id)}`,
        { method: "PATCH", body: fd }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao guardar");
      setEditingId(null);
      setEditFile(null);
      setOk("Kit atualizado.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setSaving(false);
    }
  }

  async function removeKit(id: string) {
    if (!window.confirm("Remover este kit da vitrine?")) return;
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      const res = await adminFetch(`/api/admin/kits?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao remover");
      setOk("Kit removido.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">KITs PRONTOS</h1>
          <p className="mt-1 text-sm text-stone-600">
            Cadastre foto, título, subtítulo, preço, peso e estoque. A capa da
            categoria (home e banner) fica em Categorias → Capas.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-xl bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-stone-800 disabled:opacity-50"
        >
          {loading ? "A carregar…" : "Atualizar"}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}
      {ok && (
        <div className="mb-4 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-800">
          {ok}
        </div>
      )}

      <section className="mb-8 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-stone-900">Novo kit</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-sm text-stone-700">
            Título
            <input
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-900"
              placeholder="Ex.: CHRONIC"
            />
          </label>
          <label className="text-sm text-stone-700">
            Subtítulo
            <input
              value={form.subtitle}
              onChange={(e) =>
                setForm((p) => ({ ...p, subtitle: e.target.value }))
              }
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-900"
              placeholder="Ex.: CREME"
            />
          </label>
          <label className="text-sm text-stone-700">
            Preço (R$)
            <input
              value={form.price}
              onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))}
              inputMode="decimal"
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-900"
              placeholder="Ex.: 149,90"
            />
          </label>
          <label className="text-sm text-stone-700">
            Estoque
            <input
              value={form.stock}
              onChange={(e) => setForm((p) => ({ ...p, stock: e.target.value }))}
              inputMode="numeric"
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-900"
            />
          </label>
          <label className="text-sm text-stone-700">
            Peso (gramas)
            <input
              value={form.weight}
              onChange={(e) => setForm((p) => ({ ...p, weight: e.target.value }))}
              inputMode="numeric"
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-900"
              placeholder="Ex.: 800"
            />
          </label>
        </div>
        <label className="mt-3 block text-sm text-stone-700">
          Foto
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="mt-1 block w-full text-sm text-stone-600"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <button
          type="button"
          disabled={saving}
          onClick={() => void createKit()}
          className="mt-4 rounded-xl bg-violet-600 px-6 py-3 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {saving ? "A guardar…" : "Cadastrar kit"}
        </button>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {kits.map((kit) => (
          <KitAdminCard
            key={kit.id}
            kit={kit}
            editing={editingId === kit.id}
            saving={saving}
            onEdit={() => {
              setEditingId(kit.id);
              setEditFile(null);
            }}
            onCancel={() => {
              setEditingId(null);
              setEditFile(null);
            }}
            onFile={setEditFile}
            onSave={(next) =>
              void saveEdit(
                kit,
                next.title,
                next.subtitle,
                next.price,
                next.stock,
                next.weight
              )
            }
            onRemove={() => void removeKit(kit.id)}
          />
        ))}
      </div>

      {!loading && kits.length === 0 && (
        <p className="mt-6 text-sm text-stone-500">Nenhum kit cadastrado ainda.</p>
      )}
    </div>
  );
}

function KitAdminCard({
  kit,
  editing,
  saving,
  onEdit,
  onCancel,
  onFile,
  onSave,
  onRemove,
}: {
  kit: KitRow;
  editing: boolean;
  saving: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onFile: (file: File | null) => void;
  onSave: (next: {
    title: string;
    subtitle: string;
    price: string;
    stock: string;
    weight: string;
  }) => void;
  onRemove: () => void;
}) {
  const [title, setTitle] = useState(kit.brand);
  const [subtitle, setSubtitle] = useState(kit.color);
  const [price, setPrice] = useState(
    kit.unit_price != null ? String(kit.unit_price).replace(".", ",") : ""
  );
  const [stock, setStock] = useState(String(kit.stock));
  const [weight, setWeight] = useState(
    kit.weight_grams != null ? String(kit.weight_grams) : ""
  );

  useEffect(() => {
    setTitle(kit.brand);
    setSubtitle(kit.color);
    setPrice(kit.unit_price != null ? String(kit.unit_price).replace(".", ",") : "");
    setStock(String(kit.stock));
    setWeight(kit.weight_grams != null ? String(kit.weight_grams) : "");
  }, [kit]);

  return (
    <article className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div className="relative aspect-[3/4] max-h-[220px] bg-stone-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={kit.drive_image_url}
          alt=""
          className="h-full w-full object-cover"
        />
      </div>
      <div className="p-4">
        {editing ? (
          <div className="space-y-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
            />
            <input
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
            />
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
            />
            <input
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
              placeholder="Estoque"
            />
            <input
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
              placeholder="Peso (g)"
            />
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
              className="block w-full text-xs"
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => onSave({ title, subtitle, price, stock, weight })}
                className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white"
              >
                Guardar
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="rounded-lg border border-stone-300 px-3 py-2 text-sm"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <>
            <h3 className="text-lg font-bold uppercase text-stone-900">{kit.brand}</h3>
            <p className="text-sm uppercase text-stone-500">{kit.color}</p>
            <p className="mt-2 text-sm font-semibold text-stone-800">
              {kit.unit_price != null ? formatMoneyBrl(kit.unit_price) : "Sem preço"}
              <span className="ml-2 font-normal text-stone-500">
                · est. {kit.stock}
                {kit.weight_grams != null ? ` · ${kit.weight_grams} g` : ""}
              </span>
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={onEdit}
                className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium"
              >
                Editar
              </button>
              <button
                type="button"
                onClick={onRemove}
                className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700"
              >
                Remover
              </button>
            </div>
          </>
        )}
      </div>
    </article>
  );
}

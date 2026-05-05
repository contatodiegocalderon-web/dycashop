"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdminAuth } from "@/contexts/admin-auth";
import type { WholesaleTier } from "@/lib/category-showcase";

type CostRow = {
  category_label: string;
  cost_per_piece: number;
};

type ShowcaseRow = {
  category_label: string;
  video_url: string | null;
  video_poster_url: string | null;
  wholesale_tiers: WholesaleTier[];
};

function tiersToText(tiers: WholesaleTier[]) {
  return tiers
    .map((t) => `${t.minQty}-${t.maxQty == null ? "+" : t.maxQty}=${t.price}`)
    .join("\n");
}

function parseTierText(input: string): WholesaleTier[] {
  const lines = input
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const tiers: WholesaleTier[] = [];
  for (const line of lines) {
    const [range, priceRaw] = line.split("=");
    if (!range || !priceRaw) throw new Error(`Faixa inválida: "${line}"`);
    const [minRaw, maxRaw] = range.split("-");
    const minQty = Number(minRaw);
    const maxQty = maxRaw === "+" ? null : Number(maxRaw);
    const price = Number(priceRaw.replace(",", "."));
    if (!Number.isFinite(minQty) || minQty < 1) {
      throw new Error(`Quantidade mínima inválida em "${line}"`);
    }
    if (maxQty != null && (!Number.isFinite(maxQty) || maxQty < minQty)) {
      throw new Error(`Quantidade máxima inválida em "${line}"`);
    }
    if (!Number.isFinite(price) || price < 0) {
      throw new Error(`Preço inválido em "${line}"`);
    }
    tiers.push({ minQty, maxQty, price });
  }
  if (tiers.length === 0) {
    throw new Error("Informe ao menos uma faixa de atacado.");
  }
  return tiers;
}

export default function AdminCategoriasPage() {
  const { adminFetch, isOwner } = useAdminAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [categories, setCategories] = useState<string[]>([]);
  const [costEdits, setCostEdits] = useState<Record<string, string>>({});
  const [videoEdits, setVideoEdits] = useState<Record<string, string>>({});
  const [posterEdits, setPosterEdits] = useState<Record<string, string>>({});
  const [tiersEdits, setTiersEdits] = useState<Record<string, string>>({});

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    setOk(null);
    try {
      const [costRes, showcaseRes] = await Promise.all([
        adminFetch("/api/admin/category-costs"),
        adminFetch("/api/admin/category-showcase"),
      ]);
      const costJson = await costRes.json();
      const showcaseJson = await showcaseRes.json();
      if (!costRes.ok) throw new Error(costJson.error ?? "Falha ao carregar custos");
      if (!showcaseRes.ok) {
        throw new Error(showcaseJson.error ?? "Falha ao carregar configurações");
      }

      const costRows = (costJson.rows ?? []) as CostRow[];
      const showcaseRows = (showcaseJson.rows ?? []) as ShowcaseRow[];
      const allLabels = Array.from(
        new Set([
          ...costRows.map((r) => r.category_label),
          ...showcaseRows.map((r) => r.category_label),
        ])
      ).sort((a, b) => a.localeCompare(b, "pt-BR"));

      const costMap: Record<string, string> = {};
      const videoMap: Record<string, string> = {};
      const posterMap: Record<string, string> = {};
      const tiersMap: Record<string, string> = {};
      for (const label of allLabels) {
        const cost = costRows.find((r) => r.category_label === label)?.cost_per_piece ?? 0;
        const showcase = showcaseRows.find((r) => r.category_label === label);
        costMap[label] = String(cost);
        videoMap[label] = showcase?.video_url ?? "";
        posterMap[label] = showcase?.video_poster_url ?? "";
        tiersMap[label] = tiersToText(showcase?.wholesale_tiers ?? []);
      }

      setCategories(allLabels);
      setCostEdits(costMap);
      setVideoEdits(videoMap);
      setPosterEdits(posterMap);
      setTiersEdits(tiersMap);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }, [adminFetch]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  async function saveAll() {
    if (!isOwner) return;
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      const costEntries = categories.map((category_label) => ({
        category_label,
        cost_per_piece: Number(String(costEdits[category_label] ?? "0").replace(",", ".")),
      }));
      const showcaseEntries = categories.map((category_label) => ({
        category_label,
        video_url: (videoEdits[category_label] ?? "").trim() || null,
        video_poster_url: (posterEdits[category_label] ?? "").trim() || null,
        wholesale_tiers: parseTierText(tiersEdits[category_label] ?? ""),
      }));

      const [costRes, showcaseRes] = await Promise.all([
        adminFetch("/api/admin/category-costs", {
          method: "PUT",
          body: JSON.stringify({ entries: costEntries }),
        }),
        adminFetch("/api/admin/category-showcase", {
          method: "PUT",
          body: JSON.stringify({ entries: showcaseEntries }),
        }),
      ]);
      const costJson = await costRes.json();
      const showcaseJson = await showcaseRes.json();
      if (!costRes.ok) throw new Error(costJson.error ?? "Falha ao salvar custos");
      if (!showcaseRes.ok) {
        throw new Error(showcaseJson.error ?? "Falha ao salvar banner das categorias");
      }
      setOk("Categorias atualizadas com sucesso.");
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-stone-900">Categorias</h1>
          <p className="mt-1 text-sm text-stone-600">
            Configure custo por peça, tabela de atacado e vídeo de qualidade para cada
            categoria.
          </p>
        </div>
        <button
          type="button"
          onClick={loadAll}
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
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {ok}
        </div>
      )}

      {categories.length === 0 ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Ainda não há categorias importadas no catálogo.
        </p>
      ) : (
        <div className="space-y-4">
          {categories.map((label) => (
            <section
              key={label}
              className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm"
            >
              <h2 className="text-lg font-semibold text-stone-900">{label}</h2>

              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <label className="text-sm text-stone-700">
                  Custo por peça (R$)
                  <input
                    type="text"
                    inputMode="decimal"
                    disabled={!isOwner}
                    value={costEdits[label] ?? ""}
                    onChange={(e) =>
                      setCostEdits((prev) => ({ ...prev, [label]: e.target.value }))
                    }
                    className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-900 disabled:bg-stone-100"
                  />
                </label>
                <label className="text-sm text-stone-700">
                  URL do vídeo
                  <input
                    type="url"
                    disabled={!isOwner}
                    value={videoEdits[label] ?? ""}
                    onChange={(e) =>
                      setVideoEdits((prev) => ({ ...prev, [label]: e.target.value }))
                    }
                    className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-900 disabled:bg-stone-100"
                    placeholder="https://..."
                  />
                </label>
                <label className="text-sm text-stone-700">
                  URL do poster (opcional)
                  <input
                    type="url"
                    disabled={!isOwner}
                    value={posterEdits[label] ?? ""}
                    onChange={(e) =>
                      setPosterEdits((prev) => ({ ...prev, [label]: e.target.value }))
                    }
                    className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-900 disabled:bg-stone-100"
                    placeholder="https://..."
                  />
                </label>
              </div>

              <label className="mt-3 block text-sm text-stone-700">
                Tabela atacado (uma linha por faixa no formato `min-max=preço` e `min-+=preço`)
                <textarea
                  rows={4}
                  disabled={!isOwner}
                  value={tiersEdits[label] ?? ""}
                  onChange={(e) =>
                    setTiersEdits((prev) => ({ ...prev, [label]: e.target.value }))
                  }
                  className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 font-mono text-xs text-stone-900 disabled:bg-stone-100"
                />
              </label>
            </section>
          ))}
        </div>
      )}

      {isOwner && categories.length > 0 && (
        <button
          type="button"
          onClick={saveAll}
          disabled={saving}
          className="mt-6 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving ? "A guardar…" : "Guardar categorias"}
        </button>
      )}
    </div>
  );
}

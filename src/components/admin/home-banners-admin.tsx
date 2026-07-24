"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdminAuth } from "@/contexts/admin-auth";
import type { HomeBanner, HomeBannerVariant } from "@/lib/home-banners";

type Props = {
  enabled: boolean;
};

export function HomeBannersAdminPanel({ enabled }: Props) {
  const { adminFetch, isOwner } = useAdminAuth();
  const [banners, setBanners] = useState<HomeBanner[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [hrefDraft, setHrefDraft] = useState("");
  const [desktopFile, setDesktopFile] = useState<File | null>(null);
  const [mobileFile, setMobileFile] = useState<File | null>(null);

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const res = await adminFetch("/api/admin/home-banners");
      const data = (await res.json()) as {
        error?: string;
        banners?: HomeBanner[];
      };
      if (!res.ok) throw new Error(data.error ?? "Falha ao carregar banners");
      setBanners(data.banners ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
      setBanners([]);
    } finally {
      setLoading(false);
    }
  }, [adminFetch, enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createBanner() {
    if (!isOwner || !desktopFile) {
      setError("Selecione a imagem para computador (desktop).");
      return;
    }
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const fd = new FormData();
      fd.append("file", desktopFile);
      if (mobileFile) fd.append("file_mobile", mobileFile);
      if (hrefDraft.trim()) fd.append("href", hrefDraft.trim());
      const res = await adminFetch("/api/admin/home-banners", {
        method: "POST",
        body: fd,
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Falha no envio");
      setHrefDraft("");
      setDesktopFile(null);
      setMobileFile(null);
      setOk("Banner criado. No celular usa a imagem mobile (se enviou).");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro no envio");
    } finally {
      setBusy(false);
    }
  }

  async function replaceVariant(
    id: string,
    variant: HomeBannerVariant,
    file: File
  ) {
    if (!isOwner) return;
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const fd = new FormData();
      fd.append("id", id);
      fd.append("variant", variant);
      fd.append("file", file);
      const res = await adminFetch("/api/admin/home-banners", {
        method: "POST",
        body: fd,
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Falha no envio");
      setOk(
        variant === "mobile"
          ? "Imagem do celular atualizada."
          : "Imagem do computador atualizada."
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro no envio");
    } finally {
      setBusy(false);
    }
  }

  async function clearMobile(id: string) {
    if (!isOwner) return;
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const res = await adminFetch("/api/admin/home-banners", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, clearMobile: true }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Falha ao limpar");
      setOk("Imagem do celular removida (no telemóvel usa a do PC).");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  async function move(id: string, direction: "up" | "down") {
    if (!isOwner) return;
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const res = await adminFetch("/api/admin/home-banners", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, direction }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Falha ao reordenar");
      setOk("Ordem do carrossel atualizada.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(id: string, active: boolean) {
    if (!isOwner) return;
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const res = await adminFetch("/api/admin/home-banners", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, active }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Falha ao atualizar");
      setOk(active ? "Banner ativado." : "Banner ocultado da home.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!isOwner) return;
    if (!window.confirm("Remover este banner da home?")) return;
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const res = await adminFetch(
        `/api/admin/home-banners?id=${encodeURIComponent(id)}`,
        { method: "DELETE" }
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Falha ao remover");
      setOk("Banner removido.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  if (!enabled) return null;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-stone-900">
          Banners da página inicial
        </h2>
        <p className="mt-1 text-sm text-stone-600">
          Envie <strong>duas imagens</strong> por banner para não cortar no
          celular: uma larga para PC (~1600×600) e outra para celular no
          formato do antigo box (~1080×600 ou similar). A altura na loja segue
          a proporção da imagem — sem crop.
        </p>

        {isOwner ? (
          <div className="mt-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm text-stone-700">
                Imagem computador (obrigatória)
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={busy}
                  className="mt-1 block w-full text-sm text-stone-600 file:mr-3 file:rounded-lg file:border-0 file:bg-stone-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white"
                  onChange={(e) => {
                    setDesktopFile(e.target.files?.[0] ?? null);
                    e.target.value = "";
                  }}
                />
                {desktopFile ? (
                  <span className="mt-1 block text-xs text-emerald-700">
                    {desktopFile.name}
                  </span>
                ) : null}
              </label>
              <label className="text-sm text-stone-700">
                Imagem celular (recomendado)
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={busy}
                  className="mt-1 block w-full text-sm text-stone-600 file:mr-3 file:rounded-lg file:border-0 file:bg-stone-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white"
                  onChange={(e) => {
                    setMobileFile(e.target.files?.[0] ?? null);
                    e.target.value = "";
                  }}
                />
                {mobileFile ? (
                  <span className="mt-1 block text-xs text-emerald-700">
                    {mobileFile.name}
                  </span>
                ) : (
                  <span className="mt-1 block text-xs text-stone-400">
                    Se vazio, o celular usa a do PC (pode parecer mais baixa).
                  </span>
                )}
              </label>
            </div>
            <label className="block text-sm text-stone-700">
              Link opcional (ao clicar)
              <input
                type="text"
                value={hrefDraft}
                onChange={(e) => setHrefDraft(e.target.value)}
                disabled={busy}
                placeholder="/categoria/… ou https://…"
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-900 disabled:bg-stone-100"
              />
            </label>
            <button
              type="button"
              disabled={busy || !desktopFile}
              onClick={() => void createBanner()}
              className="rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-stone-800 disabled:opacity-50"
            >
              {busy ? "A enviar…" : "Adicionar banner"}
            </button>
          </div>
        ) : (
          <p className="mt-3 text-sm text-amber-700">
            Só o dono pode alterar os banners.
          </p>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}
      {ok && (
        <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-800">
          {ok}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-stone-500">A carregar banners…</p>
      ) : banners.length === 0 ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Ainda não há banners. Adicione a primeira imagem para o carrossel
          aparecer na home.
        </p>
      ) : (
        <ul className="space-y-4">
          {banners.map((b, i) => (
            <li
              key={b.id}
              className={`rounded-2xl border bg-white p-3 shadow-sm ${
                b.active ? "border-stone-200" : "border-stone-200 opacity-70"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-sm font-semibold text-stone-800">
                  Banner {i + 1}
                  {!b.active ? (
                    <span className="ml-2 text-xs font-medium text-amber-700">
                      (oculto)
                    </span>
                  ) : null}
                </p>
                {isOwner ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      disabled={busy || i === 0}
                      onClick={() => void move(b.id, "up")}
                      className="rounded-lg border border-stone-300 px-2.5 py-1 text-sm font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-40"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      disabled={busy || i === banners.length - 1}
                      onClick={() => void move(b.id, "down")}
                      className="rounded-lg border border-stone-300 px-2.5 py-1 text-sm font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-40"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void toggleActive(b.id, !b.active)}
                      className="rounded-lg border border-stone-300 px-2.5 py-1 text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-40"
                    >
                      {b.active ? "Ocultar" : "Ativar"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void remove(b.id)}
                      className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-40"
                    >
                      Remover
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500">
                    Computador
                  </p>
                  <div className="overflow-hidden rounded-lg border border-stone-200 bg-stone-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={b.image_url}
                      alt=""
                      className="h-auto w-full object-contain"
                    />
                  </div>
                  {isOwner ? (
                    <label className="mt-2 inline-flex cursor-pointer text-xs font-semibold text-violet-700 hover:underline">
                      Trocar PC
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        disabled={busy}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = "";
                          if (f) void replaceVariant(b.id, "desktop", f);
                        }}
                      />
                    </label>
                  ) : null}
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500">
                    Celular
                  </p>
                  <div className="overflow-hidden rounded-lg border border-stone-200 bg-stone-100">
                    {b.image_url_mobile ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={b.image_url_mobile}
                        alt=""
                        className="h-auto w-full object-contain"
                      />
                    ) : (
                      <p className="px-3 py-8 text-center text-xs text-stone-500">
                        Sem imagem mobile — usa a do PC
                      </p>
                    )}
                  </div>
                  {isOwner ? (
                    <div className="mt-2 flex flex-wrap gap-3">
                      <label className="inline-flex cursor-pointer text-xs font-semibold text-violet-700 hover:underline">
                        {b.image_url_mobile ? "Trocar celular" : "Subir celular"}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="hidden"
                          disabled={busy}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            e.target.value = "";
                            if (f) void replaceVariant(b.id, "mobile", f);
                          }}
                        />
                      </label>
                      {b.image_url_mobile ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void clearMobile(b.id)}
                          className="text-xs font-semibold text-stone-500 hover:text-red-600 disabled:opacity-40"
                        >
                          Remover celular
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>

              {b.href ? (
                <p className="mt-2 truncate text-xs text-stone-500">{b.href}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

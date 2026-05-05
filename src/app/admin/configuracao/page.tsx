"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useAdminAuth } from "@/contexts/admin-auth";
import { formatSyncResultSummary } from "@/lib/format-sync-result";
import { consumeSyncNdjsonStream } from "@/lib/sync-stream-client";
import type { SyncResult } from "@/services/drive-sync";

function errorFromResponseBody(text: string): Error {
  try {
    const j = JSON.parse(text) as { error?: string };
    return new Error((j.error ?? text) || "Falha");
  } catch {
    return new Error(text || "Falha");
  }
}

function ConfiguracaoInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { adminFetch, isOwner } = useAdminAuth();
  const [folderUrl, setFolderUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [driveFolderId, setDriveFolderId] = useState<string | null>(null);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [oauthConfigured, setOauthConfigured] = useState(false);
  const [syncProg, setSyncProg] = useState<{
    phase: string;
    current: number;
    total: number;
    skipped: number;
  } | null>(null);

  const loadSettings = useCallback(async () => {
    const res = await adminFetch("/api/admin/catalog-settings");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Falha ao carregar");
    setDriveFolderId(data.driveFolderId ?? null);
    setGoogleConnected(!!data.googleConnected);
    setOauthConfigured(!!data.oauthConfigured);
  }, [adminFetch]);

  useEffect(() => {
    if (!isOwner) {
      router.replace("/admin/pedidos");
      return;
    }
    void loadSettings().catch(() => {});
  }, [isOwner, loadSettings, router]);

  useEffect(() => {
    const g = searchParams.get("google");
    const err = searchParams.get("google_error");
    if (g === "ok") setStatus("Google Drive autorizado com sucesso.");
    if (err) setStatus(`Erro: ${decodeURIComponent(err)}`);
  }, [searchParams]);

  async function connectGoogle() {
    setLoading(true);
    setStatus(null);
    try {
      const res = await adminFetch("/api/auth/google/start", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao iniciar OAuth");
      window.location.href = data.url as string;
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  async function consumeSyncResponse(res: Response) {
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("ndjson")) {
      setSyncProg({
        phase: "A iniciar…",
        current: 0,
        total: 0,
        skipped: 0,
      });
      await consumeSyncNdjsonStream(res, (raw) => {
        const o = raw as {
          type?: string;
          phase?: string;
          current?: number;
          total?: number;
          skipped?: number;
          result?: SyncResult;
          message?: string;
        };
        if (o.type === "phase" && o.phase) {
          const msg =
            o.phase === "produtos"
              ? "A atualizar produtos…"
              : o.phase === "imagens"
                ? "A preparar imagens…"
                : o.phase === "drive_rename"
                  ? "A alinhar nomes no Drive…"
                  : o.phase;
          setSyncProg((p) => ({
            current: p?.current ?? 0,
            total: p?.total ?? 0,
            skipped: p?.skipped ?? 0,
            phase: msg,
          }));
        }
        if (o.type === "progress" && o.phase === "images") {
          setSyncProg({
            phase: "Imagens → Storage",
            current: o.current ?? 0,
            total: o.total ?? 0,
            skipped: o.skipped ?? 0,
          });
        }
        if (o.type === "complete" && o.result) {
          setStatus(formatSyncResultSummary(o.result));
          setSyncProg(null);
        }
        if (o.type === "fatal") {
          setStatus(o.message ?? "Erro na sincronização");
          setSyncProg(null);
        }
      });
      return;
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? data.hint ?? "Falha");
    const imported = data.imported as number | undefined;
    const total = data.totalParsed as number | undefined;
    const msg = data.message as string | undefined;
    if (typeof imported === "number") {
      setStatus(
        msg ??
          `Guardado. Pasta ${data.folderId as string}. Importados/atualizados: ${imported} (linhas: ${total ?? imported}).`
      );
    } else {
      setStatus("Guardado.");
    }
  }

  async function saveFolderAndSync() {
    if (!folderUrl.trim()) {
      setStatus("Cole o link da pasta do Drive.");
      return;
    }
    setLoading(true);
    setStatus(null);
    try {
      const res = await adminFetch("/api/admin/catalog-settings?stream=1", {
        method: "POST",
        body: JSON.stringify({ folderUrl: folderUrl.trim() }),
      });
      if (!res.ok) {
        throw errorFromResponseBody(await res.text());
      }
      await consumeSyncResponse(res);
      await loadSettings();
      setFolderUrl("");
    } catch (e) {
      setSyncProg(null);
      setStatus(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  async function syncOnly() {
    setLoading(true);
    setStatus(null);
    try {
      const res = await adminFetch("/api/admin/catalog-settings?stream=1", {
        method: "POST",
        body: JSON.stringify({ syncOnly: true }),
      });
      if (!res.ok) {
        throw errorFromResponseBody(await res.text());
      }
      await consumeSyncResponse(res);
    } catch (e) {
      setSyncProg(null);
      setStatus(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  if (!isOwner) {
    return (
      <div className="mx-auto max-w-xl px-4 py-12 text-center text-sm text-stone-600">
        A redirecionar…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">
            Configuração do catálogo
          </h1>
          <p className="text-sm text-stone-600">
            Cole o link da pasta do Drive e sincronize — sem ficheiros JSON. O
            estoque passa a ser só na app (pedidos); ao voltar a sincronizar, os
            números no nome do ficheiro não repõem stock já vendido.
          </p>
        </div>
      </div>

      <div className="mb-6 rounded-xl border border-amber-100 bg-amber-50/80 p-4 text-sm text-amber-950">
        <p className="font-medium">Passo 1 — Autorizar o Google (uma vez)</p>
        <p className="mt-1 text-amber-900/90">
          Precisa de{" "}
          <code className="rounded bg-white/80 px-1">GOOGLE_CLIENT_ID</code> e{" "}
          <code className="rounded bg-white/80 px-1">GOOGLE_CLIENT_SECRET</code>{" "}
          no .env (tipo &quot;App Web&quot; na Google Cloud). Redirect:{" "}
          <code className="break-all">
            …/api/auth/google/callback
          </code>
        </p>
        <button
          type="button"
          disabled={loading}
          onClick={() => void connectGoogle()}
          className="mt-3 rounded-xl bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-40"
        >
          Conectar conta Google
        </button>
        <p className="mt-2 text-xs text-amber-900/80">
          Estado:{" "}
          {googleConnected ? (
            <span className="font-semibold text-emerald-800">ligado</span>
          ) : (
            <span className="font-semibold text-red-800">não ligado</span>
          )}
          {!oauthConfigured && (
            <span className="block mt-1">
              OAuth não configurado no servidor — veja o .env.local.
            </span>
          )}
        </p>
      </div>

      <div className="mb-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-stone-700">
            Passo 2 — Link da pasta do Drive
          </span>
          <input
            type="url"
            value={folderUrl}
            onChange={(e) => setFolderUrl(e.target.value)}
            className="w-full rounded-xl border border-stone-200 px-3 py-2 text-stone-900"
            placeholder="https://drive.google.com/drive/folders/…"
          />
        </label>
        <p className="mt-2 text-xs leading-relaxed text-stone-600">
          Cole o link da pasta principal do catálogo (ex.: <strong>CATÁLOGO</strong>). Dentro
          dela, <strong>cada pasta é uma categoria</strong> (BERMUDAS ELASTANO, CAMISETAS
          STREETWEAR, JEANS…). Em cada categoria existem as pastas <strong>M</strong>,{" "}
          <strong>G</strong> e <strong>GG</strong> com as fotos (<code>MARCA COR</code> no
          nome do ficheiro).
        </p>
        {driveFolderId && (
          <p className="mt-2 text-xs text-stone-500">
            Pasta atual no sistema:{" "}
            <code className="rounded bg-stone-100 px-1">{driveFolderId}</code>
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={loading}
          onClick={() => void saveFolderAndSync()}
          className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-40"
        >
          Guardar link e sincronizar agora
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => void syncOnly()}
          className="rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-800 hover:bg-stone-50 disabled:opacity-40"
        >
          Só sincronizar
        </button>
      </div>

      {syncProg && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-950">
          <p className="font-medium">{syncProg.phase}</p>
          {syncProg.total > 0 ? (
            <p className="mt-1 text-xs text-emerald-900/90">
              Imagens a processar: {syncProg.current} / {syncProg.total} · Ignoradas
              (já atualizadas): {syncProg.skipped}
            </p>
          ) : (
            <p className="mt-1 text-xs text-emerald-900/80">A calcular…</p>
          )}
        </div>
      )}
      {status && (
        <p className="mt-4 rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm text-stone-800 whitespace-pre-wrap">
          {status}
        </p>
      )}
    </div>
  );
}

export default function AdminConfiguracaoPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-xl px-4 py-8 text-stone-600">
          A carregar…
        </div>
      }
    >
      <ConfiguracaoInner />
    </Suspense>
  );
}

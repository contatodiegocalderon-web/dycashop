"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAdminAuth } from "@/contexts/admin-auth";
import type { CrmBotCampaignRow } from "@/lib/crm-bot/types";
import type { BotSelectedLead } from "@/lib/crm-bot/selection";

type Props = {
  sellerScope: string;
  selectedLeads: BotSelectedLead[];
  selectionMode: boolean;
  onStartSelection: () => void;
  onCloseSelection: () => void;
  onClose: () => void;
};

type Phase = "config" | "connecting" | "running" | "done";

export function CrmBotPanel({
  sellerScope,
  selectedLeads,
  selectionMode,
  onStartSelection,
  onCloseSelection,
  onClose,
}: Props) {
  const { adminFetch } = useAdminAuth();
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [phase, setPhase] = useState<Phase>("config");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [referenceMessage, setReferenceMessage] = useState(
    "Vi que você deixou itens no carrinho. Posso te ajudar a finalizar?"
  );
  const selectedCount = selectedLeads.length;
  const [secondsPerPerson, setSecondsPerPerson] = useState(10);
  const [groupSize, setGroupSize] = useState(10);
  const [groupPauseMinutes, setGroupPauseMinutes] = useState(30);
  const [variationCount, setVariationCount] = useState(5);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [mediaBase64, setMediaBase64] = useState<string | null>(null);
  const [mediaMimetype, setMediaMimetype] = useState<string | null>(null);

  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [campaign, setCampaign] = useState<CrmBotCampaignRow | null>(null);
  const [connectUrl, setConnectUrl] = useState<string | null>(null);
  const [qrBase64, setQrBase64] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<string | null>(null);
  const [stats, setStats] = useState({ pending: 0, sent: 0, failed: 0 });

  const stopTick = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  const refreshCampaign = useCallback(
    async (id: string) => {
      const res = await adminFetch(`/api/admin/crm/bot/campaigns/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao carregar campanha");
      setCampaign(data.campaign as CrmBotCampaignRow);
      setStats(data.stats);
      const st = (data.campaign as CrmBotCampaignRow).status;
      if (st === "completed") setPhase("done");
      else if (st === "running") setPhase("running");
      else if (st === "connecting") setPhase("connecting");
    },
    [adminFetch]
  );

  const runTick = useCallback(
    async (id: string) => {
      const res = await adminFetch(`/api/admin/crm/bot/campaigns/${id}/tick`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha no envio");
      setConnectionState(data.connectionState ?? null);
      if (data.campaign) setCampaign(data.campaign as CrmBotCampaignRow);
      if (data.completed) {
        setPhase("done");
        stopTick();
      }
      await refreshCampaign(id);
    },
    [adminFetch, refreshCampaign, stopTick]
  );

  useEffect(() => {
    return () => stopTick();
  }, [stopTick]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await adminFetch("/api/admin/crm/bot/campaigns");
        const data = await res.json();
        if (!res.ok || !data.campaign) return;
        const c = data.campaign as CrmBotCampaignRow;
        setCampaignId(c.id);
        setCampaign(c);
        if (c.status === "connecting") setPhase("connecting");
        else if (c.status === "running") setPhase("running");
        else if (c.status === "completed") setPhase("done");
      } catch {
        /* ignore */
      }
    })();
  }, [adminFetch]);

  useEffect(() => {
    if ((phase === "running" || phase === "connecting") && campaignId) {
      stopTick();
      tickRef.current = setInterval(() => {
        void runTick(campaignId).catch((e) =>
          setError(e instanceof Error ? e.message : "Erro no bot")
        );
      }, 5000);
      void runTick(campaignId).catch(() => {});
    }
    return () => stopTick();
  }, [phase, campaignId, runTick, stopTick]);

  useEffect(() => {
    if (selectedCount > 0 && variationCount > selectedCount) {
      setVariationCount(selectedCount);
    }
  }, [selectedCount, variationCount]);

  function onPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!/^image\//i.test(f.type)) {
      setError("Use uma imagem (JPG, PNG, WebP).");
      return;
    }
    if (f.size > 800_000) {
      setError("Imagem até ~800 KB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result ?? "");
      const b64 = raw.includes(",") ? raw.split(",")[1]! : raw;
      setMediaBase64(b64);
      setMediaMimetype(f.type);
      setMediaPreview(raw);
    };
    reader.readAsDataURL(f);
  }

  async function handleStart() {
    if (selectedCount === 0) {
      setError("Selecione ao menos um lead no funil.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await adminFetch("/api/admin/crm/bot/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipients: selectedLeads,
          seller_scope: sellerScope,
          reference_message: referenceMessage,
          seconds_per_person: secondsPerPerson,
          group_size: groupSize,
          group_pause_seconds: groupPauseMinutes * 60,
          variation_count: Math.min(variationCount, selectedCount),
          media_base64: mediaBase64,
          media_mimetype: mediaMimetype,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? data.hint ?? "Falha ao criar");

      const id = (data.campaign as { id: string }).id;
      setCampaignId(id);
      setCampaign(data.campaign as CrmBotCampaignRow);

      const startRes = await adminFetch(
        `/api/admin/crm/bot/campaigns/${id}/start`,
        { method: "POST" }
      );
      const startData = await startRes.json();
      if (!startRes.ok) throw new Error(startData.error ?? startData.hint ?? "Falha ao iniciar");

      setConnectUrl(startData.managerUrl ?? null);
      setQrBase64(startData.qrBase64 ?? null);
      setPairingCode(startData.pairingCode ?? null);
      setPhase("connecting");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel() {
    if (!campaignId) return;
    setLoading(true);
    try {
      await adminFetch(`/api/admin/crm/bot/campaigns/${campaignId}/cancel`, {
        method: "POST",
      });
      stopTick();
      setPhase("config");
      setCampaignId(null);
      setCampaign(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  const progressPct =
    campaign && campaign.total_recipients > 0
      ? Math.round(
          ((stats.sent + stats.failed) / campaign.total_recipients) * 100
        )
      : 0;

  return (
    <div className="rounded-2xl border border-violet-200 bg-gradient-to-b from-violet-50 to-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-violet-950">Bot de follow-up</h2>
          <p className="text-xs text-violet-700/80">
            Disparos humanizados com intervalo — conecte o WhatsApp e deixe trabalhar.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700"
        >
          Voltar ao funil
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      {phase === "config" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="rounded-xl border border-violet-200 bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-stone-500">
                Grupo de disparo
              </p>
              <p className="mt-2 text-2xl font-black text-violet-900">
                {selectedCount}
              </p>
              <p className="text-sm text-stone-600">
                {selectedCount === 1
                  ? "lead selecionado"
                  : "leads selecionados"}
              </p>
              {!selectionMode ? (
                <button
                  type="button"
                  onClick={onStartSelection}
                  className="mt-4 w-full rounded-xl border-2 border-violet-500 bg-violet-50 px-4 py-2.5 text-sm font-bold text-violet-900 hover:bg-violet-100"
                >
                  Selecionar grupo
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onCloseSelection}
                  className="mt-4 w-full rounded-xl border border-stone-300 bg-stone-50 px-4 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-100"
                >
                  Fechar lista
                </button>
              )}
              {selectedCount === 0 ? (
                <p className="mt-2 text-xs text-stone-500">
                  Clique em &quot;Selecionar grupo&quot; e marque os leads nas
                  tabelas do funil abaixo.
                </p>
              ) : null}
            </div>
          </div>

          <div className="space-y-4">
            <label className="flex flex-col gap-1 text-xs font-medium text-stone-600">
              Mensagem de referência
              <textarea
                value={referenceMessage}
                onChange={(e) => setReferenceMessage(e.target.value)}
                rows={5}
                className="rounded-xl border border-stone-300 px-3 py-2 text-sm"
                placeholder="Texto base — o bot cria variações humanizadas"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs font-medium text-stone-600">
              Foto (opcional)
              <input
                type="file"
                accept="image/*"
                onChange={onPhotoChange}
                className="text-sm"
              />
              {mediaPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={mediaPreview}
                  alt="Prévia"
                  className="mt-2 max-h-32 rounded-lg border object-cover"
                />
              ) : null}
            </label>
          </div>

          <div className="space-y-3 lg:col-span-2">
            <p className="text-xs font-bold uppercase tracking-wide text-stone-500">
              Programação
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="flex flex-col gap-1 text-xs text-stone-600">
                1 pessoa a cada (seg)
                <input
                  type="number"
                  min={3}
                  value={secondsPerPerson}
                  onChange={(e) => setSecondsPerPerson(Number(e.target.value) || 10)}
                  className="rounded-xl border border-stone-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-stone-600">
                Tamanho do grupo
                <input
                  type="number"
                  min={1}
                  value={groupSize}
                  onChange={(e) => setGroupSize(Number(e.target.value) || 10)}
                  className="rounded-xl border border-stone-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-stone-600">
                Pausa entre grupos (min)
                <input
                  type="number"
                  min={0}
                  value={groupPauseMinutes}
                  onChange={(e) =>
                    setGroupPauseMinutes(Number(e.target.value) || 0)
                  }
                  className="rounded-xl border border-stone-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-stone-600">
                Variações de mensagem
                <input
                  type="number"
                  min={1}
                  max={Math.max(1, selectedCount || 1)}
                  value={variationCount}
                  onChange={(e) =>
                    setVariationCount(
                      Math.max(
                        1,
                        Math.min(
                          selectedCount || 1,
                          Number(e.target.value) || 1
                        )
                      )
                    )
                  }
                  className="rounded-xl border border-stone-300 px-3 py-2 text-sm"
                />
                <span className="text-[10px] text-stone-400">
                  Máx.: uma diferente por lead ({selectedCount || "?"})
                </span>
              </label>
            </div>
          </div>

          <div className="lg:col-span-2">
            <button
              type="button"
              disabled={loading || !referenceMessage.trim() || selectedCount === 0}
              onClick={() => void handleStart()}
              className="w-full rounded-xl bg-violet-600 px-4 py-3 text-sm font-bold text-white shadow hover:bg-violet-700 disabled:opacity-50"
            >
              {loading ? "A preparar…" : "Iniciar — conectar WhatsApp"}
            </button>
          </div>
        </div>
      )}

      {(phase === "connecting" || phase === "running") && campaign && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
              {phase === "connecting" ? "Aguardando conexão" : "Bot em trabalho"}
            </span>
            <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-800">
              Follow-up ativado
            </span>
            {connectionState && (
              <span className="text-xs text-stone-500">
                WhatsApp: {connectionState}
              </span>
            )}
          </div>

          {phase === "connecting" && (
            <div className="rounded-xl border border-stone-200 bg-white p-4">
              <p className="mb-2 text-sm font-semibold text-stone-800">
                Conecte o WhatsApp
              </p>
              {qrBase64 ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={
                    qrBase64.startsWith("data:")
                      ? qrBase64
                      : `data:image/png;base64,${qrBase64}`
                  }
                  alt="QR Code WhatsApp"
                  className="mx-auto max-h-56"
                />
              ) : null}
              {pairingCode ? (
                <p className="mt-2 text-center text-sm text-stone-600">
                  Código: <strong>{pairingCode}</strong>
                </p>
              ) : null}
              {connectUrl ? (
                <a
                  href={connectUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 block text-center text-sm font-semibold text-violet-700 underline"
                >
                  Abrir painel de conexão (Evolution API)
                </a>
              ) : null}
            </div>
          )}

          <div>
            <div className="mb-1 flex justify-between text-xs text-stone-600">
              <span>
                Enviados: {stats.sent} · Pendentes: {stats.pending} · Falhas:{" "}
                {stats.failed}
              </span>
              <span>{progressPct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-stone-200">
              <div
                className="h-full bg-violet-500 transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={() => void handleCancel()}
            className="rounded-xl border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-800"
          >
            Cancelar bot
          </button>
        </div>
      )}

      {phase === "done" && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center">
          <p className="text-lg font-bold text-emerald-900">Campanha concluída</p>
          <p className="mt-1 text-sm text-emerald-800">
            Enviados: {stats.sent} · Falhas: {stats.failed}
          </p>
          <button
            type="button"
            onClick={() => {
              setPhase("config");
              setCampaignId(null);
            }}
            className="mt-4 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white"
          >
            Nova campanha
          </button>
        </div>
      )}
    </div>
  );
}

const BASE = () => process.env.EVOLUTION_API_URL?.replace(/\/$/, "") ?? "";
const KEY = () => process.env.EVOLUTION_API_KEY?.trim() ?? "";
const INSTANCE_PREFIX = () =>
  process.env.EVOLUTION_INSTANCE_PREFIX?.trim() || "dyca-bot";

export function isEvolutionConfigured(): boolean {
  return Boolean(BASE() && KEY());
}

export function buildInstanceName(campaignId: string): string {
  const short = campaignId.replace(/-/g, "").slice(0, 12);
  return `${INSTANCE_PREFIX()}-${short}`;
}

async function evoFetch(path: string, init?: RequestInit) {
  const url = `${BASE()}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      apikey: KEY(),
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const msg =
      typeof json === "object" &&
      json &&
      "message" in json &&
      typeof (json as { message: unknown }).message === "string"
        ? (json as { message: string }).message
        : text || res.statusText;
    throw new Error(msg);
  }
  return json;
}

export async function ensureEvolutionInstance(instanceName: string) {
  if (!isEvolutionConfigured()) {
    throw new Error(
      "Evolution API não configurada (EVOLUTION_API_URL + EVOLUTION_API_KEY)."
    );
  }
  try {
    await evoFetch(`/instance/create`, {
      method: "POST",
      body: JSON.stringify({
        instanceName,
        integration: "WHATSAPP-BAILEYS",
        qrcode: true,
      }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/already|exists|duplicate/i.test(msg)) throw e;
  }
}

export type ConnectInfo = {
  pairingCode?: string | null;
  code?: string | null;
  base64?: string | null;
  count?: number | null;
};

export async function fetchEvolutionConnect(
  instanceName: string
): Promise<ConnectInfo> {
  const data = (await evoFetch(
    `/instance/connect/${encodeURIComponent(instanceName)}`,
    { method: "GET" }
  )) as ConnectInfo;
  return data;
}

export async function fetchEvolutionConnectionState(
  instanceName: string
): Promise<"open" | "close" | "connecting" | string> {
  const data = (await evoFetch(
    `/instance/connectionState/${encodeURIComponent(instanceName)}`,
    { method: "GET" }
  )) as { instance?: { state?: string }; state?: string };
  const state =
    data?.instance?.state ?? data?.state ?? "close";
  return String(state).toLowerCase();
}

export async function sendEvolutionText(
  instanceName: string,
  whatsappDigits: string,
  text: string
) {
  const number = whatsappDigits.replace(/\D/g, "");
  try {
    await evoFetch(`/message/sendText/${encodeURIComponent(instanceName)}`, {
      method: "POST",
      body: JSON.stringify({ number, text }),
    });
  } catch (e) {
    throw new Error(formatEvolutionSendError(e, number));
  }
}

export async function sendEvolutionMedia(
  instanceName: string,
  whatsappDigits: string,
  opts: { base64: string; mimetype: string; caption?: string }
) {
  const number = whatsappDigits.replace(/\D/g, "");
  try {
    await evoFetch(`/message/sendMedia/${encodeURIComponent(instanceName)}`, {
      method: "POST",
      body: JSON.stringify({
        number,
        mediatype: "image",
        mimetype: opts.mimetype,
        media: opts.base64,
        caption: opts.caption ?? "",
      }),
    });
  } catch (e) {
    throw new Error(formatEvolutionSendError(e, number));
  }
}

/** Mensagens legíveis para erros comuns da Evolution (número inexistente, etc.). */
export function formatEvolutionSendError(err: unknown, number: string): string {
  const raw = err instanceof Error ? err.message : String(err);
  try {
    const parsed = JSON.parse(raw) as {
      response?: { message?: Array<{ exists?: boolean; number?: string }> };
      message?: unknown;
    };
    const entries = parsed?.response?.message;
    if (Array.isArray(entries)) {
      const missing = entries.find((m) => m && m.exists === false);
      if (missing) {
        const n = missing.number || number;
        return `Número sem WhatsApp (ou inválido): ${n}`;
      }
    }
  } catch {
    /* raw não é JSON */
  }
  if (/exists["']?\s*:\s*false/i.test(raw)) {
    return `Número sem WhatsApp (ou inválido): ${number}`;
  }
  return raw.slice(0, 400);
}

export function evolutionConnectPageUrl(instanceName: string): string | null {
  if (!BASE()) return null;
  return `${BASE()}/manager/instance/${encodeURIComponent(instanceName)}/connect`;
}

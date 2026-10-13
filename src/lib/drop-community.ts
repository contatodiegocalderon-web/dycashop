import { WHATSAPP_SELLERS } from "@/lib/sellers";

/** Estrutura da comunidade de parceiros (tópicos, semana do cronograma, vídeos). */

export type LessonModule = "aulas" | "atacado" | "varejo" | "etiqueta" | "pedido";

export type CommunityTopic = {
  slug: LessonModule | "catalogo" | "cronograma";
  title: string;
  tagline: string;
  kind: "lessons" | "link" | "schedule" | "external";
  /** Destino fixo. Sem isso, link abre o Drive e o resto abre /comunidade/[slug]. */
  href?: string;
  accent: string;
  /** Capa estilo pôster em `public/comunidade/capas`. Vazio usa o fundo do cartão. */
  cover: string;
  posterEyebrow: string;
  posterTitle: string;
};

const orderPhone = WHATSAPP_SELLERS.find((s) => s.name === "Diego")?.phone ?? "5511958936770";
const orderText = encodeURIComponent("Oi! Vendi e quero enviar meu pedido.");

/** Trilha única. A página /comunidade/aulas toca esta sequência. */
export const AULAS_TOPIC: CommunityTopic = {
  slug: "aulas",
  title: "Assistir aulas",
  tagline: "Assista nesta ordem",
  kind: "lessons",
  accent: "#34d399",
  cover: "/comunidade/capas/atacado.jpg",
  posterEyebrow: "Na ordem",
  posterTitle: "Assistir aulas",
};

export const COMMUNITY_TOPICS: CommunityTopic[] = [
  {
    slug: "cronograma",
    title: "Cronograma",
    tagline: "Todo dia o que postar no story, status, Reels e TikTok",
    kind: "schedule",
    accent: "#10b981",
    cover: "/comunidade/capas/cronograma.jpg",
    posterEyebrow: "Poste todo dia",
    posterTitle: "Cronograma",
  },
  {
    slug: "catalogo",
    title: "Pro Drive",
    tagline: "Fotos e vídeos prontos pra divulgar",
    kind: "link",
    accent: "#38bdf8",
    cover: "/comunidade/capas/catalogo.jpg",
    posterEyebrow: "Catálogo atualizado",
    posterTitle: "Pro Drive",
  },
  AULAS_TOPIC,
  {
    slug: "pedido",
    title: "Vendeu? Então envie seu pedido",
    tagline: "Manda o pedido no WhatsApp",
    kind: "external",
    href: `https://wa.me/${orderPhone}?text=${orderText}`,
    accent: "#f59e0b",
    cover: "/comunidade/capas/pedido.jpg",
    posterEyebrow: "Vendeu? Então",
    posterTitle: "Envie seu pedido",
  },
];

export const LESSON_MODULES: LessonModule[] = ["aulas", "atacado", "varejo", "etiqueta", "pedido"];

export function isLessonModule(v: string): v is LessonModule {
  return (LESSON_MODULES as string[]).includes(v);
}

export function getTopic(slug: string): CommunityTopic | undefined {
  if (slug === AULAS_TOPIC.slug) return AULAS_TOPIC;
  return COMMUNITY_TOPICS.find((t) => t.slug === slug);
}

export const WEEKDAY_LABELS = [
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
  "Domingo",
] as const;

/** Data (YYYY-MM-DD) e dia da semana (1 = segunda … 7 = domingo) no horário de Brasília. */
export function saoPauloToday(now = new Date()): { date: string; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const map: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    weekday: map[get("weekday")] ?? 1,
  };
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Segunda-feira da semana atual (horário de Brasília). */
export function currentWeekStart(now = new Date()): string {
  const { date, weekday } = saoPauloToday(now);
  return addDays(date, 1 - weekday);
}

export function isIsoDate(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00Z`));
}

/** Extrai o id de um link do YouTube (watch, youtu.be, shorts, embed, live). */
export function youtubeId(url: string | null | undefined): string | null {
  const raw = String(url ?? "").trim();
  if (!raw) return null;
  if (/^[\w-]{11}$/.test(raw)) return raw;
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\.|^m\./, "");
    if (host === "youtu.be") return u.pathname.slice(1, 12) || null;
    if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
      const v = u.searchParams.get("v");
      if (v) return v.slice(0, 11);
      const m = u.pathname.match(/\/(?:embed|shorts|live|v)\/([\w-]{11})/);
      return m?.[1] ?? null;
    }
  } catch {
    return null;
  }
  return null;
}

export function youtubeThumb(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

export function isFileVideo(url: string | null | undefined): boolean {
  return /\.(mp4|webm)(\?|$)/i.test(String(url ?? "").trim());
}

/** Capa ao lado do mp4 (`boas-vindas.mp4` → `boas-vindas.jpg`). */
export function videoPoster(url: string | null | undefined): string | null {
  const raw = String(url ?? "").trim();
  if (!isFileVideo(raw)) return null;
  return raw.replace(/\.(mp4|webm)(\?.*)?$/i, ".jpg$2");
}

export function lessonStill(url: string | null | undefined): string | null {
  const id = youtubeId(url);
  if (id) return youtubeThumb(id);
  return videoPoster(url);
}

export function isWelcomeLesson(url: string | null | undefined): boolean {
  return /boas-vindas\.mp4/i.test(String(url ?? ""));
}

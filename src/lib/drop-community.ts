/** Estrutura da comunidade de parceiros (tópicos, semana do cronograma, vídeos). */

export type LessonModule = "atacado" | "varejo" | "etiqueta" | "pedido";

export type CommunityTopic = {
  slug: LessonModule | "catalogo" | "cronograma";
  title: string;
  tagline: string;
  kind: "lessons" | "link" | "schedule";
  accent: string;
  /** Capa estilo pôster em `public/comunidade/capas`. */
  cover: string;
  posterEyebrow: string;
  posterTitle: string;
};

export const COMMUNITY_TOPICS: CommunityTopic[] = [
  {
    slug: "cronograma",
    title: "Cronograma de conteúdo",
    tagline: "Todo dia o que postar no story, status, Reels e TikTok",
    kind: "schedule",
    accent: "#10b981",
    cover: "/comunidade/capas/cronograma.jpg",
    posterEyebrow: "Poste todo dia",
    posterTitle: "Cronograma de conteúdo",
  },
  {
    slug: "catalogo",
    title: "Catálogo do Drive 100% atualizado",
    tagline: "+10 mil itens sem marca, prontos pra divulgar",
    kind: "link",
    accent: "#38bdf8",
    cover: "/comunidade/capas/catalogo.jpg",
    posterEyebrow: "100% atualizado",
    posterTitle: "Catálogo do Drive",
  },
  {
    slug: "etiqueta",
    title: "Como gerar etiqueta de envio / calcular frete",
    tagline: "Passo a passo no SuperFrete",
    kind: "lessons",
    accent: "#a78bfa",
    cover: "/comunidade/capas/etiqueta.jpg",
    posterEyebrow: "Calcular frete e",
    posterTitle: "Gerar etiqueta",
  },
  {
    slug: "pedido",
    title: "Como fazer seu pedido",
    tagline: "Vendeu? Veja como pedir pra gente",
    kind: "lessons",
    accent: "#f59e0b",
    cover: "/comunidade/capas/pedido.jpg",
    posterEyebrow: "Vendeu? Então",
    posterTitle: "Faça seu pedido",
  },
  {
    slug: "atacado",
    title: "Atacado",
    tagline: "Aulas de como vender no atacado",
    kind: "lessons",
    accent: "#eab308",
    cover: "/comunidade/capas/atacado.jpg",
    posterEyebrow: "Aprenda a vender no",
    posterTitle: "Atacado",
  },
  {
    slug: "varejo",
    title: "Varejo",
    tagline: "Aulas de como vender no varejo",
    kind: "lessons",
    accent: "#f43f5e",
    cover: "/comunidade/capas/varejo.jpg",
    posterEyebrow: "Aprenda a vender no",
    posterTitle: "Varejo",
  },
];

export const LESSON_MODULES: LessonModule[] = ["atacado", "varejo", "etiqueta", "pedido"];

export function isLessonModule(v: string): v is LessonModule {
  return (LESSON_MODULES as string[]).includes(v);
}

export function getTopic(slug: string): CommunityTopic | undefined {
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

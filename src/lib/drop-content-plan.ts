/**
 * Cronograma automático de conteúdo da comunidade.
 *
 * Feed (Reels/TikTok/feed): todo dia 2 posts de fotos (catálogo no fundo + IA). Girando camiseta e
 * puxando bermuda vão pro feed 1 vez por semana; os outros formatos (kits, qualidade, cortes, narração,
 * aparecendo) vão pro feed só 1 vez por mês. Nos stories todos os formatos aparecem toda semana.
 *
 * O plano é calculado só a partir da data. O essencial do dia é o post principal + o story da noite.
 */

export type FormatKey =
  | "giro_camisetas"
  | "puxando_bermudas"
  | "kits"
  | "qualidade_bermudas"
  | "qualidade_camisetas"
  | "catalogo_fundo"
  | "fotos_ia"
  | "video_editado"
  | "narracao"
  | "aparecendo";

export type ContentGoal = "alcance" | "confianca" | "venda";

/** `semanal` = vídeo novo que chega 1x por semana · `volume` = dá pra fazer quantos quiser. */
export type FormatSupply = "semanal" | "volume";

export type ContentFormat = {
  key: FormatKey;
  label: string;
  /** 1 = material pronto, só postar · 2 = ajuste rápido · 3 = você grava. */
  effort: 1 | 2 | 3;
  goal: ContentGoal;
  supply: FormatSupply;
  how: string;
  stories: string[];
};

export const GOAL_LABELS: Record<ContentGoal, string> = {
  alcance: "Atrai gente nova",
  confianca: "Gera confiança",
  venda: "Gera pedido",
};

export const EFFORT_LABELS: Record<1 | 2 | 3, string> = {
  1: "Só postar",
  2: "Ajuste rápido",
  3: "Você grava",
};

export const SUPPLY_LABELS: Record<FormatSupply, string> = {
  semanal: "Vídeo novo da semana",
  volume: "Pode postar à vontade",
};

export const CONTENT_FORMATS: Record<FormatKey, ContentFormat> = {
  giro_camisetas: {
    key: "giro_camisetas",
    label: "Vídeo girando camisetas",
    effort: 1,
    goal: "alcance",
    supply: "semanal",
    how: "Use o vídeo de giro de camiseta da semana, com uma música em alta e o preço na tela.",
    stories: [
      "Poste o giro com a enquete \"Qual cor você usaria?\".",
      "Escreva \"Chegou reposição 🔥\" e coloque o link do seu WhatsApp.",
    ],
  },
  puxando_bermudas: {
    key: "puxando_bermudas",
    label: "Vídeo puxando bermudas",
    effort: 1,
    goal: "alcance",
    supply: "semanal",
    how: "Use o vídeo da semana puxando a bermuda pra mostrar o tecido e a elasticidade.",
    stories: [
      "Poste o vídeo com a caixa de perguntas \"Qual tamanho você usa?\".",
      "Escreva \"Teste do tecido ✅\" e coloque o link do seu WhatsApp.",
    ],
  },
  kits: {
    key: "kits",
    label: "Vídeo mostrando kits",
    effort: 1,
    goal: "venda",
    supply: "semanal",
    how: "Use o vídeo de kits da semana com o preço do kit na tela. Kit aumenta o valor de cada venda.",
    stories: [
      "Mostre o kit com o preço e escreva \"Kit com desconto só hoje\" + link do WhatsApp.",
      "Enquete: \"Kit preto ou kit colorido?\" e responda quem votar.",
    ],
  },
  qualidade_bermudas: {
    key: "qualidade_bermudas",
    label: "Vídeo mostrando a qualidade das bermudas",
    effort: 1,
    goal: "confianca",
    supply: "semanal",
    how: "Use o vídeo de detalhe da bermuda da semana: costura, tecido, cordão e etiqueta de perto.",
    stories: [
      "Escreva \"Olha a qualidade dessa costura 👇\" em cima do vídeo.",
      "Poste o vídeo com a caixa de perguntas \"Ficou com alguma dúvida?\".",
    ],
  },
  qualidade_camisetas: {
    key: "qualidade_camisetas",
    label: "Vídeo mostrando a qualidade das camisetas",
    effort: 1,
    goal: "confianca",
    supply: "semanal",
    how: "Use o vídeo de detalhe da camiseta da semana: malha, gola, costura e estampa de perto.",
    stories: [
      "Escreva \"Passa o dedo na tela pra sentir essa malha 😅\" em cima do vídeo.",
      "Enquete: \"Você já comprou camiseta que desbotou?\" Sim / Nunca mais.",
    ],
  },
  catalogo_fundo: {
    key: "catalogo_fundo",
    label: "Fotos do catálogo no seu fundo",
    effort: 2,
    goal: "venda",
    supply: "volume",
    how: "Pegue de 3 a 5 fotos do catálogo do Drive, coloque sempre no mesmo fundo da sua marca e escreva o preço.",
    stories: [
      "Poste de 3 a 5 fotos com o preço em cada uma e \"Chama no WhatsApp\" na última.",
      "Faça a sequência \"Vitrine do dia\" com 4 peças e o link do WhatsApp na última.",
    ],
  },
  fotos_ia: {
    key: "fotos_ia",
    label: "Fotos feitas com IA",
    effort: 2,
    goal: "alcance",
    supply: "volume",
    how: "Gere fotos de IA com a peça do catálogo vestida num modelo. Mostra a roupa no corpo sem precisar de ensaio. Poste em carrossel.",
    stories: [
      "Poste o look com a enquete \"Usaria?\" Com certeza / Talvez.",
      "Escreva \"Look do dia\" e coloque o preço de cada peça.",
    ],
  },
  video_editado: {
    key: "video_editado",
    label: "Vídeo editado (cortes de vídeos antigos)",
    effort: 2,
    goal: "alcance",
    supply: "volume",
    how: "Reaproveite vídeos de semanas anteriores: junte os melhores cortes, troque a música e coloque seu @ e WhatsApp no final.",
    stories: [
      "Poste o vídeo e escreva \"Qual você leva? 1, 2 ou 3?\".",
      "Poste o vídeo com o sticker de link do seu WhatsApp.",
    ],
  },
  narracao: {
    key: "narracao",
    label: "Vídeo de narração",
    effort: 3,
    goal: "confianca",
    supply: "volume",
    how: "Pegue um vídeo antigo de produto e grave sua voz por cima (30s): o que é, por que é boa, preço e como pedir.",
    stories: [
      "Grave um áudio curto explicando a peça do dia e termine com \"me chama\".",
      "Narre 3 motivos pra comprar a peça e coloque o link do WhatsApp.",
    ],
  },
  aparecendo: {
    key: "aparecendo",
    label: "Vídeo aparecendo",
    effort: 3,
    goal: "confianca",
    supply: "volume",
    how: "Apareça por 15 segundos segurando ou vestindo a peça. As pessoas compram de quem elas veem.",
    stories: [
      "Grave \"Bom dia! Olha o que chegou hoje\" mostrando 2 peças.",
      "Mostre você usando a peça e coloque a enquete \"Ficou bom?\".",
    ],
  },
};

export const FORMAT_KEYS = Object.keys(CONTENT_FORMATS) as FormatKey[];

export function isFormatKey(v: string): v is FormatKey {
  return v in CONTENT_FORMATS;
}

export type PlanSlotId = "reels" | "reels-2" | "reels-video" | "story-manha" | "story-tarde" | "story-noite";

/** Frequência do post no feed: `semana` = 1x por semana · `mes` = 1x por mês. */
export type FeedCadence = "semana" | "mes";

export const ESSENTIAL_SLOTS: PlanSlotId[] = ["reels", "story-noite"];

export type PlanSlot = {
  id: PlanSlotId;
  channel: "reels" | "story";
  when: string;
  purpose: string;
  purposeTip: string;
  format: ContentFormat;
  /** Instrução do story (vazio nos posts do feed). */
  text: string;
  essential: boolean;
  cadence: FeedCadence | null;
};

export type DayPlan = {
  date: string;
  weekday: number;
  theme: string;
  themeTip: string;
  slots: PlanSlot[];
};

type DayTemplate = {
  theme: string;
  themeTip: string;
  /** Vídeo que vai pro feed 1x por semana nesse dia. */
  weeklyVideo: FormatKey | null;
  manha: FormatKey | null;
  tarde: FormatKey | null;
  noite: FormatKey;
};

/**
 * Segunda (1) … domingo (7). O feed de todo dia são as 2 fotos (catálogo + IA); aqui ficam o vídeo
 * semanal do feed e os stories. Nos stories cada formato aparece pelo menos 1x na semana.
 */
const WEEK: Record<number, DayTemplate> = {
  1: {
    theme: "Abre a vitrine",
    themeTip: "Começa a semana com o feed cheio de fotos e você aparecendo nos stories.",
    weeklyVideo: null,
    manha: "aparecendo",
    tarde: "giro_camisetas",
    noite: "catalogo_fundo",
  },
  2: {
    theme: "Dia das camisetas",
    themeTip: "O vídeo girando camiseta vai pro feed hoje (1x na semana). Nos stories, a qualidade da malha.",
    weeklyVideo: "giro_camisetas",
    manha: "giro_camisetas",
    tarde: "qualidade_camisetas",
    noite: "kits",
  },
  3: {
    theme: "Meio de semana",
    themeTip: "Fotos no feed, narração e bermudas nos stories.",
    weeklyVideo: null,
    manha: "narracao",
    tarde: "puxando_bermudas",
    noite: "catalogo_fundo",
  },
  4: {
    theme: "Dia das bermudas",
    themeTip: "O vídeo puxando bermuda vai pro feed hoje (1x na semana). Nos stories, a qualidade do tecido.",
    weeklyVideo: "puxando_bermudas",
    manha: "puxando_bermudas",
    tarde: "qualidade_bermudas",
    noite: "kits",
  },
  5: {
    theme: "Esquenta do fim de semana",
    themeTip: "Sexta é dia de compra: vitrine no feed e chamada forte nos stories.",
    weeklyVideo: null,
    manha: "video_editado",
    tarde: "qualidade_camisetas",
    noite: "catalogo_fundo",
  },
  6: {
    theme: "Dia da conexão",
    themeTip: "Sábado tem mais tempo: apareça nos stories e mostre os kits.",
    weeklyVideo: null,
    manha: "aparecendo",
    tarde: "qualidade_bermudas",
    noite: "kits",
  },
  7: {
    theme: "Domingo leve",
    themeTip: "Só as fotos no feed e poucos stories pra não sumir.",
    weeklyVideo: null,
    manha: null,
    tarde: "giro_camisetas",
    noite: "fotos_ia",
  },
};

/**
 * Formatos que vão pro feed só 1x por mês: [semana do mês (0 = dias 1–7), dia da semana, formato].
 * Ficam na quarta e no sábado pra não cair junto com os vídeos semanais (terça e quinta).
 */
const MONTHLY_FEED: [number, number, FormatKey][] = [
  [0, 3, "kits"],
  [0, 6, "narracao"],
  [1, 3, "qualidade_camisetas"],
  [1, 6, "video_editado"],
  [2, 3, "qualidade_bermudas"],
  [2, 6, "aparecendo"],
];

const SLOT_META: Record<PlanSlotId, { when: string; purpose: string; purposeTip: string }> = {
  reels: {
    when: "18h–21h",
    purpose: "Post principal",
    purposeTip: "Poste o mesmo conteúdo no Reels, no TikTok e no feed.",
  },
  "reels-2": {
    when: "11h–13h",
    purpose: "Post extra",
    purposeTip: "Segundo post do dia: Reels, TikTok e feed de novo.",
  },
  "reels-video": {
    when: "15h–17h",
    purpose: "Vídeo da semana",
    purposeTip: "Esse vídeo vai pro feed só hoje. Nos stories ele pode repetir.",
  },
  "story-manha": {
    when: "8h–10h",
    purpose: "Aquecer",
    purposeTip: "Puxa conversa cedo: use enquete ou caixa de perguntas.",
  },
  "story-tarde": {
    when: "12h–14h",
    purpose: "Mostrar",
    purposeTip: "Mostre o produto de perto.",
  },
  "story-noite": {
    when: "19h–21h",
    purpose: "Vender",
    purposeTip: "Horário que mais gente vê: preço + chamada pro WhatsApp.",
  },
};

function dayNumber(isoDate: string): number {
  return Math.floor(Date.parse(`${isoDate}T12:00:00Z`) / 86_400_000);
}

function weekdayOf(isoDate: string): number {
  const d = new Date(`${isoDate}T12:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

export function buildDayPlan(isoDate: string): DayPlan {
  const weekday = weekdayOf(isoDate);
  const n = dayNumber(isoDate);
  const t = WEEK[weekday]!;
  const weekOfMonth = Math.floor((Number(isoDate.slice(8, 10)) - 1) / 7);
  const monthly = MONTHLY_FEED.find(([w, d]) => w === weekOfMonth && d === weekday)?.[2] ?? null;

  // Alterna qual foto é o post principal pra o feed não ficar igual todo dia.
  const [main, extra]: FormatKey[] = n % 2 === 0 ? ["catalogo_fundo", "fotos_ia"] : ["fotos_ia", "catalogo_fundo"];

  const raw: [PlanSlotId, FormatKey | null][] = [
    ["reels", main],
    ["reels-2", extra],
    ["reels-video", t.weeklyVideo ?? monthly],
    ["story-manha", t.manha],
    ["story-tarde", t.tarde],
    ["story-noite", t.noite],
  ];
  const slots: PlanSlot[] = [];
  raw.forEach(([id, key], i) => {
    if (!key) return;
    const format = CONTENT_FORMATS[key];
    const story = id.startsWith("story");
    const meta = SLOT_META[id];
    const isMonthly = id === "reels-video" && !t.weeklyVideo;
    slots.push({
      id,
      channel: story ? "story" : "reels",
      ...meta,
      ...(isMonthly
        ? { purpose: "Post do mês", purposeTip: "Esse formato vai pro feed só 1 vez por mês. Nos stories ele aparece toda semana." }
        : null),
      format,
      text: story ? format.stories[(n + i) % format.stories.length]! : "",
      essential: ESSENTIAL_SLOTS.includes(id),
      cadence: id === "reels-video" ? (isMonthly ? "mes" : "semana") : null,
    });
  });

  return { date: isoDate, weekday, theme: t.theme, themeTip: t.themeTip, slots };
}

export function isPlanSlotId(v: string): v is PlanSlotId {
  return v in SLOT_META;
}

export function isDayComplete(checked: (slot: PlanSlotId) => boolean): boolean {
  return ESSENTIAL_SLOTS.every(checked);
}

/** Dias seguidos com o essencial feito, terminando em `lastDay`. */
export function planStreak(checks: { day: string; slot: string }[], lastDay: string): number {
  const byDay = new Map<string, Set<string>>();
  for (const c of checks) {
    const set = byDay.get(c.day) ?? new Set<string>();
    set.add(c.slot);
    byDay.set(c.day, set);
  }
  const complete = (d: string) => isDayComplete((s) => Boolean(byDay.get(d)?.has(s)));
  let streak = 0;
  let cursor = lastDay;
  while (complete(cursor)) {
    streak += 1;
    cursor = shiftDay(cursor, -1);
  }
  return streak;
}

function shiftDay(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

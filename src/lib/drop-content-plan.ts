/**
 * Cronograma automático de conteúdo da comunidade.
 *
 * Os vídeos de produto (girando, puxando, kits, qualidade) chegam 1 vez por semana, então cada um vai
 * pro Reels/feed só uma vez na semana. O volume do feed vem dos formatos que dá pra produzir à vontade
 * (fotos do catálogo editadas, fotos de IA, cortes e narração em vídeos antigos). Nos stories os vídeos
 * da semana podem repetir sem problema.
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

export type PlanSlotId = "reels" | "reels-2" | "story-manha" | "story-tarde" | "story-noite";

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
  reels: FormatKey;
  reels2: FormatKey | null;
  manha: FormatKey | null;
  tarde: FormatKey | null;
  noite: FormatKey;
};

/**
 * Segunda (1) … domingo (7). Cada vídeo semanal aparece 1x no feed (seg a sex);
 * o resto do feed é formato de volume. No máximo um formato "você grava" por dia.
 */
const WEEK: Record<number, DayTemplate> = {
  1: {
    theme: "Dia das camisetas",
    themeTip: "Começa a semana lançando o vídeo novo de camisetas.",
    reels: "giro_camisetas",
    reels2: "fotos_ia",
    manha: "aparecendo",
    tarde: "giro_camisetas",
    noite: "catalogo_fundo",
  },
  2: {
    theme: "Dia das bermudas",
    themeTip: "Vídeo novo de bermudas no feed, tecido e conforto nos stories.",
    reels: "puxando_bermudas",
    reels2: "catalogo_fundo",
    manha: "giro_camisetas",
    tarde: "puxando_bermudas",
    noite: "catalogo_fundo",
  },
  3: {
    theme: "Dia dos kits",
    themeTip: "Meio da semana é dia de aumentar o valor de cada venda.",
    reels: "kits",
    reels2: "video_editado",
    manha: "puxando_bermudas",
    tarde: "giro_camisetas",
    noite: "kits",
  },
  4: {
    theme: "Dia da qualidade",
    themeTip: "Quebre a objeção \"será que é bom?\" antes do fim de semana.",
    reels: "qualidade_camisetas",
    reels2: "narracao",
    manha: "kits",
    tarde: "qualidade_bermudas",
    noite: "catalogo_fundo",
  },
  5: {
    theme: "Esquenta do fim de semana",
    themeTip: "Sexta é dia de compra: último vídeo novo da semana e chamada forte.",
    reels: "qualidade_bermudas",
    reels2: "video_editado",
    manha: "puxando_bermudas",
    tarde: "kits",
    noite: "catalogo_fundo",
  },
  6: {
    theme: "Dia da conexão",
    themeTip: "Sábado tem mais tempo: mostre quem está por trás da venda.",
    reels: "fotos_ia",
    reels2: "narracao",
    manha: "aparecendo",
    tarde: "qualidade_camisetas",
    noite: "kits",
  },
  7: {
    theme: "Domingo leve",
    themeTip: "Só o básico pra não sumir e já preparar a semana.",
    reels: "catalogo_fundo",
    reels2: null,
    manha: null,
    tarde: "giro_camisetas",
    noite: "catalogo_fundo",
  },
};

/** Nas semanas ímpares os formatos de volume trocam de lugar pra o feed não ficar repetitivo. */
const ALT_WEEK_SWAP: Partial<Record<FormatKey, FormatKey>> = {
  fotos_ia: "video_editado",
  video_editado: "fotos_ia",
};

const SLOT_META: Record<PlanSlotId, { when: string; purpose: string; purposeTip: string }> = {
  reels: {
    when: "18h–21h",
    purpose: "Post principal",
    purposeTip: "Poste o mesmo conteúdo no Reels, no TikTok e no feed.",
  },
  "reels-2": {
    when: "11h–13h",
    purpose: "Post extra",
    purposeTip: "Mais volume no feed: Reels, TikTok e feed de novo.",
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
  const altWeek = Math.floor((n - (weekday - 1)) / 7) % 2 === 1;
  const t = WEEK[weekday]!;
  const pick = (k: FormatKey) => CONTENT_FORMATS[altWeek ? ALT_WEEK_SWAP[k] ?? k : k];

  const raw: [PlanSlotId, FormatKey | null][] = [
    ["reels", t.reels],
    ["reels-2", t.reels2],
    ["story-manha", t.manha],
    ["story-tarde", t.tarde],
    ["story-noite", t.noite],
  ];
  const slots: PlanSlot[] = [];
  raw.forEach(([id, key], i) => {
    if (!key) return;
    const format = pick(key);
    const story = id.startsWith("story");
    slots.push({
      id,
      channel: story ? "story" : "reels",
      ...SLOT_META[id],
      format,
      text: story ? format.stories[(n + i) % format.stories.length]! : "",
      essential: ESSENTIAL_SLOTS.includes(id),
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

/**
 * Cronograma automático de conteúdo da comunidade.
 *
 * Todo dia tem 1 vídeo para Reels/TikTok/feed e até 3 stories/status (manhã, tarde, noite).
 * O plano é calculado só a partir da data, então não precisa ser cadastrado semana a semana.
 * O essencial do dia (≈10 min) é o vídeo + o story da noite, que é o que mais gera pedido.
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

export type ContentFormat = {
  key: FormatKey;
  label: string;
  /** 1 = material pronto, só postar · 2 = ajuste rápido · 3 = você grava. */
  effort: 1 | 2 | 3;
  minutes: number;
  goal: ContentGoal;
  how: string;
  captions: string[];
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

export const CONTENT_FORMATS: Record<FormatKey, ContentFormat> = {
  giro_camisetas: {
    key: "giro_camisetas",
    label: "Vídeo girando camisetas",
    effort: 1,
    minutes: 3,
    goal: "alcance",
    how: "Pegue um vídeo de giro de camiseta no material, coloque uma música em alta e escreva o preço na tela.",
    captions: [
      "Qual dessas cores você levaria? 👀 Comenta aqui que eu te mando o preço.",
      "Camiseta premium com caimento perfeito 🔥 Me chama no direct antes que acabe a sua cor.",
      "Básica não precisa ser comum. Escolhe a sua e me chama no WhatsApp 📲",
    ],
    stories: [
      "Poste o giro com a enquete \"Qual cor você usaria?\".",
      "Escreva \"Chegou reposição 🔥\" e coloque o link do seu WhatsApp.",
    ],
  },
  puxando_bermudas: {
    key: "puxando_bermudas",
    label: "Vídeo puxando bermudas",
    effort: 1,
    minutes: 3,
    goal: "alcance",
    how: "Use o vídeo puxando a bermuda pra mostrar o tecido e a elasticidade. Música em alta e preço na tela.",
    captions: [
      "Olha o tecido dessa bermuda 👀 Comenta \"EU QUERO\" que eu te chamo.",
      "Bermuda que aguenta o dia todo. Vários modelos, me chama no direct 📲",
      "Conforto de verdade é isso aqui 🔥 Me pede o catálogo completo.",
    ],
    stories: [
      "Poste o vídeo com a caixa de perguntas \"Qual tamanho você usa?\".",
      "Escreva \"Teste do tecido ✅\" e coloque o link do seu WhatsApp.",
    ],
  },
  kits: {
    key: "kits",
    label: "Vídeo mostrando kits",
    effort: 1,
    minutes: 3,
    goal: "venda",
    how: "Mostre um kit pronto (ex.: 3 camisetas ou camiseta + bermuda) com o preço do kit na tela. Kit aumenta o valor de cada venda.",
    captions: [
      "Kit pronto pra sair arrumado a semana toda 🔥 Preço especial no kit, me chama.",
      "Por que levar uma se dá pra levar o kit com desconto? 👀 Chama no direct.",
      "Comenta \"KIT\" que eu te mando todas as opções 📲",
    ],
    stories: [
      "Mostre o kit com o preço e escreva \"Kit com desconto só hoje\" + link do WhatsApp.",
      "Enquete: \"Kit preto ou kit colorido?\" e responda quem votar.",
    ],
  },
  qualidade_bermudas: {
    key: "qualidade_bermudas",
    label: "Vídeo mostrando a qualidade das bermudas",
    effort: 1,
    minutes: 3,
    goal: "confianca",
    how: "Use o vídeo de detalhe da bermuda: costura, tecido, cordão e etiqueta de perto.",
    captions: [
      "Detalhe que faz diferença: costura reforçada e tecido que não deforma ✅",
      "Você paga uma vez e usa por muito tempo. Qualidade que dá pra ver 👀",
      "Antes de comprar, olha o acabamento. Me chama que eu te mostro mais.",
    ],
    stories: [
      "Escreva \"Olha a qualidade dessa costura 👇\" em cima do vídeo.",
      "Poste o vídeo com a caixa de perguntas \"Ficou com alguma dúvida?\".",
    ],
  },
  qualidade_camisetas: {
    key: "qualidade_camisetas",
    label: "Vídeo mostrando a qualidade das camisetas",
    effort: 1,
    minutes: 3,
    goal: "confianca",
    how: "Use o vídeo de detalhe da camiseta: malha, gola, costura e estampa de perto.",
    captions: [
      "Malha grossa, gola que não laceia e estampa que não sai na lavagem ✅",
      "É por isso que quem compra uma volta pra comprar mais 👀",
      "Qualidade de loja, preço de quem vende direto. Me chama 📲",
    ],
    stories: [
      "Escreva \"Passa o dedo na tela pra sentir essa malha 😅\" em cima do vídeo.",
      "Enquete: \"Você já comprou camiseta que desbotou?\" Sim / Nunca mais.",
    ],
  },
  catalogo_fundo: {
    key: "catalogo_fundo",
    label: "Fotos do catálogo no seu fundo",
    effort: 2,
    minutes: 6,
    goal: "venda",
    how: "Pegue de 3 a 5 fotos do catálogo do Drive, coloque sempre no mesmo fundo da sua marca e escreva o preço em cada uma.",
    captions: [
      "Novidades da semana 🔥 Arrasta pro lado e escolhe a sua. Pedidos pelo WhatsApp.",
      "Catálogo atualizado ✅ Me chama no direct que eu te passo tamanho e preço.",
      "Peças novas, estoque limitado. Garante a sua 📲",
    ],
    stories: [
      "Poste de 3 a 5 fotos com o preço em cada uma e \"Chama no WhatsApp\" na última.",
      "Faça a sequência \"Vitrine do dia\" com 4 peças e o link do WhatsApp na última.",
    ],
  },
  fotos_ia: {
    key: "fotos_ia",
    label: "Fotos feitas com IA",
    effort: 2,
    minutes: 5,
    goal: "alcance",
    how: "Use as fotos de IA com a peça vestida num modelo. Mostra a roupa no corpo sem precisar de ensaio. Poste em carrossel.",
    captions: [
      "Imagina você com esse look 👀 Comenta qual peça você quer.",
      "Look completo pra hoje 🔥 Todas as peças disponíveis, me chama.",
      "Monta o seu look igual a esse. Pede pelo direct 📲",
    ],
    stories: [
      "Poste o look com a enquete \"Usaria?\" Com certeza / Talvez.",
      "Escreva \"Look do dia\" e coloque o preço de cada peça.",
    ],
  },
  video_editado: {
    key: "video_editado",
    label: "Vídeo editado",
    effort: 2,
    minutes: 6,
    goal: "alcance",
    how: "Pegue um vídeo já editado do material (cortes e transições) e troque só o texto final pelo seu @ e WhatsApp.",
    captions: [
      "Lançamento da semana 🔥 Qual foi a sua favorita?",
      "Quem viu primeiro garante primeiro 👀 Me chama no direct.",
      "Estilo que chama atenção. Pedidos pelo WhatsApp 📲",
    ],
    stories: [
      "Poste o vídeo e escreva \"Qual você leva? 1, 2 ou 3?\".",
      "Poste o vídeo com o sticker de link do seu WhatsApp.",
    ],
  },
  narracao: {
    key: "narracao",
    label: "Vídeo de narração",
    effort: 3,
    minutes: 10,
    goal: "confianca",
    how: "Grave sua voz por 30 segundos em cima de um vídeo de produto: o que é, por que é boa, preço e como pedir.",
    captions: [
      "Te explico por que essa peça sai tanto 👇",
      "3 motivos pra você ter essa no guarda-roupa 🔥",
      "Antes de comprar roupa de novo, assiste isso aqui.",
    ],
    stories: [
      "Grave um áudio curto explicando a peça do dia e termine com \"me chama\".",
      "Narre 3 motivos pra comprar a peça e coloque o link do WhatsApp.",
    ],
  },
  aparecendo: {
    key: "aparecendo",
    label: "Vídeo aparecendo",
    effort: 3,
    minutes: 8,
    goal: "confianca",
    how: "Apareça por 15 segundos segurando ou vestindo a peça. As pessoas compram de quem elas veem.",
    captions: [
      "Testei e aprovei ✅ Me conta, qual você quer?",
      "Chegou mais uma leva, olha isso 👀",
      "Bastidores de quem vende roupa todo dia 🔥 Me chama.",
    ],
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

export type PlanSlotId = "reels" | "story-manha" | "story-tarde" | "story-noite";

export const ESSENTIAL_SLOTS: PlanSlotId[] = ["reels", "story-noite"];

export type PlanSlot = {
  id: PlanSlotId;
  channel: "reels" | "story";
  when: string;
  purpose: string;
  purposeTip: string;
  format: ContentFormat;
  text: string;
  essential: boolean;
};

export type DayPlan = {
  date: string;
  weekday: number;
  theme: string;
  themeTip: string;
  slots: PlanSlot[];
  minutes: number;
  essentialMinutes: number;
};

type DayTemplate = {
  theme: string;
  themeTip: string;
  reels: FormatKey;
  manha: FormatKey | null;
  tarde: FormatKey | null;
  noite: FormatKey;
};

/** Segunda (1) … domingo (7). No máximo um formato "você grava" por dia. */
const WEEK: Record<number, DayTemplate> = {
  1: {
    theme: "Dia das camisetas",
    themeTip: "Começa a semana com o produto que mais vende.",
    reels: "giro_camisetas",
    manha: "aparecendo",
    tarde: "qualidade_camisetas",
    noite: "catalogo_fundo",
  },
  2: {
    theme: "Dia das bermudas",
    themeTip: "Tecido e conforto em primeiro plano.",
    reels: "puxando_bermudas",
    manha: "qualidade_bermudas",
    tarde: "fotos_ia",
    noite: "catalogo_fundo",
  },
  3: {
    theme: "Dia dos kits",
    themeTip: "Meio da semana é dia de aumentar o valor de cada venda.",
    reels: "kits",
    manha: "giro_camisetas",
    tarde: "fotos_ia",
    noite: "kits",
  },
  4: {
    theme: "Dia da qualidade",
    themeTip: "Quebre a objeção \"será que é bom?\" antes do fim de semana.",
    reels: "qualidade_camisetas",
    manha: "aparecendo",
    tarde: "qualidade_bermudas",
    noite: "catalogo_fundo",
  },
  5: {
    theme: "Esquenta do fim de semana",
    themeTip: "Sexta é dia de compra: capriche no vídeo e na chamada.",
    reels: "video_editado",
    manha: "puxando_bermudas",
    tarde: "kits",
    noite: "catalogo_fundo",
  },
  6: {
    theme: "Dia da conexão",
    themeTip: "Sábado tem mais tempo: mostre quem está por trás da venda.",
    reels: "narracao",
    manha: "fotos_ia",
    tarde: "giro_camisetas",
    noite: "kits",
  },
  7: {
    theme: "Domingo leve",
    themeTip: "Só o básico pra não sumir e já preparar a semana.",
    reels: "fotos_ia",
    manha: null,
    tarde: "puxando_bermudas",
    noite: "catalogo_fundo",
  },
};

/** Nas semanas ímpares os formatos trocam de lugar pra o perfil não ficar repetitivo. */
const ALT_WEEK_SWAP: Partial<Record<FormatKey, FormatKey>> = {
  aparecendo: "narracao",
  narracao: "aparecendo",
  fotos_ia: "video_editado",
  video_editado: "fotos_ia",
  qualidade_camisetas: "qualidade_bermudas",
  qualidade_bermudas: "qualidade_camisetas",
};

const SLOT_META: Record<PlanSlotId, { when: string; purpose: string; purposeTip: string }> = {
  reels: {
    when: "18h–21h",
    purpose: "Atrair",
    purposeTip: "Poste o mesmo vídeo no Reels, no TikTok e no feed.",
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
    ["story-manha", t.manha],
    ["story-tarde", t.tarde],
    ["story-noite", t.noite],
  ];
  const slots: PlanSlot[] = [];
  raw.forEach(([id, key], i) => {
    if (!key) return;
    const format = pick(key);
    const reels = id === "reels";
    const pool = reels ? format.captions : format.stories;
    slots.push({
      id,
      channel: reels ? "reels" : "story",
      ...SLOT_META[id],
      format,
      text: pool[(n + i) % pool.length]!,
      essential: ESSENTIAL_SLOTS.includes(id),
    });
  });

  const storyMinutes = (s: PlanSlot) => (s.channel === "story" ? Math.ceil(s.format.minutes / 2) : s.format.minutes);
  return {
    date: isoDate,
    weekday,
    theme: t.theme,
    themeTip: t.themeTip,
    slots,
    minutes: slots.reduce((sum, s) => sum + storyMinutes(s), 0),
    essentialMinutes: slots.filter((s) => s.essential).reduce((sum, s) => sum + storyMinutes(s), 0),
  };
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

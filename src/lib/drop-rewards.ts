/** Jornada de recompensas do parceiro: conta peças e R$ dos pedidos pagos no WhatsApp da assinatura. */

import { normalizeWhatsappDigits } from "@/lib/whatsapp-normalize";

export const BASE_UNIT_PRICE = 25;
export const FREE_PIECE_EVERY = 10;
/** A partir daqui o parceiro tem suporte exclusivo e pede vídeos sem limite. */
export const SUPPORT_AT_PIECES = 100;

export type RewardKind = "free_piece" | "video" | "bracelet" | "plaque";

export const REWARD_KIND_LABELS: Record<RewardKind, string> = {
  free_piece: "Peça grátis",
  video: "Vídeo exclusivo",
  bracelet: "Pulseira de membro",
  plaque: "Placa de reconhecimento",
};

export function isRewardKind(v: string): v is RewardKind {
  return v in REWARD_KIND_LABELS;
}

export type PieceMilestone = {
  at: number;
  rank: string;
  title: string;
  desc: string;
  /** Preço por peça a partir deste marco. */
  price?: number;
  icon: "start" | "price" | "staff";
};

export const PIECE_MILESTONES: PieceMilestone[] = [
  {
    at: 0,
    rank: "Novato",
    title: "Início da jornada",
    desc: "A cada 10 peças você ganha 1 de graça e pode pedir um vídeo exclusivo.",
    price: BASE_UNIT_PRICE,
    icon: "start",
  },
  { at: 50, rank: "Vendedor", title: "Preço cai para R$ 23", desc: "Seu preço por peça baixa pra sempre.", price: 23, icon: "price" },
  {
    at: 100,
    rank: "Elite",
    title: "Suporte exclusivo",
    desc: "Um suporte só pra você: peça vídeos e mídias exclusivas sem limite.",
    icon: "staff",
  },
  { at: 150, rank: "Pro", title: "Preço cai para R$ 22", desc: "Mais margem em cada venda.", price: 22, icon: "price" },
  { at: 300, rank: "Lenda", title: "Preço cai para R$ 21", desc: "Preço de quem vende muito.", price: 21, icon: "price" },
  { at: 500, rank: "Ícone", title: "Preço cai para R$ 20", desc: "O menor preço por peça da DYCASHOP.", price: 20, icon: "price" },
];

export type SpendMilestone = {
  at: number;
  title: string;
  desc: string;
  image: string;
  claim: RewardKind | null;
};

export const SPEND_MILESTONES: SpendMilestone[] = [
  {
    at: 5000,
    title: "Pulseira de membro",
    desc: "A pulseira oficial de quem faz parte.",
    image: "/comunidade/recompensas/pulseira-v4.jpg",
    claim: "bracelet",
  },
  {
    at: 10000,
    title: "Placa de reconhecimento",
    desc: "Uma placa com seu nome pra mostrar sua conquista.",
    image: "/comunidade/recompensas/placa-v3.jpg",
    claim: "plaque",
  },
  {
    at: 50000,
    title: "Preço de sócio",
    desc: "Preço de sócio em qualquer quantidade.",
    image: "/comunidade/recompensas/socio-v3.jpg",
    claim: null,
  },
];

export type RewardClaim = {
  id: string;
  kind: RewardKind;
  note: string | null;
  status: "pending" | "done";
  created_at: string;
};

export function computeRewards(pieces: number, spent: number, claims: Pick<RewardClaim, "kind">[]) {
  const count = (k: RewardKind) => claims.filter((c) => c.kind === k).length;
  const reached = PIECE_MILESTONES.filter((m) => pieces >= m.at);
  const current = reached[reached.length - 1]!;
  const next = PIECE_MILESTONES.find((m) => pieces < m.at) ?? null;
  const unitPrice = [...reached].reverse().find((m) => m.price != null)?.price ?? BASE_UNIT_PRICE;
  const nextPrice = PIECE_MILESTONES.find((m) => m.price != null && pieces < m.at) ?? null;

  const freeEarned = Math.floor(pieces / FREE_PIECE_EVERY);
  const videosEarned = Math.floor(pieces / FREE_PIECE_EVERY);
  const hasSupport = pieces >= SUPPORT_AT_PIECES;
  const nextSpend = SPEND_MILESTONES.find((m) => spent < m.at) ?? null;

  return {
    pieces,
    spent,
    rank: current.rank,
    current,
    next,
    progressToNext: next ? (pieces - current.at) / (next.at - current.at) : 1,
    unitPrice,
    nextPrice,
    hasSupport,
    isPartnerPrice: spent >= 50000,
    cycle: pieces % FREE_PIECE_EVERY,
    freeEarned,
    freeAvailable: Math.max(0, freeEarned - count("free_piece")),
    videosEarned,
    /** Com suporte exclusivo o pedido de vídeo é ilimitado. */
    canRequestVideo: hasSupport || videosEarned - count("video") > 0,
    videosAvailable: Math.max(0, videosEarned - count("video")),
    nextSpend,
    claimed: (k: RewardKind) => count(k) > 0,
  };
}

export type RewardsState = ReturnType<typeof computeRewards>;

/** Variações do mesmo número (com/sem 55, com/sem o 9 do celular) pra achar todos os pedidos. */
export function phoneVariants(raw: string | null | undefined): string[] {
  const d = normalizeWhatsappDigits(String(raw ?? ""));
  if (d.length < 12 || !d.startsWith("55")) return d ? [d] : [];
  const local = d.slice(2);
  const ddd = local.slice(0, 2);
  const rest = local.slice(2);
  const nationals = new Set<string>([local]);
  if (rest.length === 9 && rest.startsWith("9")) nationals.add(ddd + rest.slice(1));
  if (rest.length === 8) nationals.add(`${ddd}9${rest}`);
  const out = new Set<string>();
  nationals.forEach((n) => {
    out.add(`55${n}`);
    out.add(n);
  });
  return Array.from(out);
}

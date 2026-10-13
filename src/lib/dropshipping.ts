/** Plano de revenda / dropshipping DYCASHOP — funil de conversão. */

export const DROP_MONTHLY_PRICE_BRL = 100;

/** Preço de atacado por peça nas categorias principais (1 peça). */
export const DROP_WHOLESALE_UNIT_BRL = 25;

/** Checkout do plano (Kiwify). */
export const DROP_CHECKOUT_URL = "https://pay.kiwify.com.br/C6JV9t8";

export const DROP_CATALOG_DRIVE_URL =
  "https://drive.google.com/drive/folders/1qMLAaPdhvOhkusmrQKKux9AniWQNQgEd?usp=drive_link";

export const DROP_LANDING_PATH = "/venda-sem-estoque";
export const DROP_LOGIN_PATH = "/comunidade/entrar";
export const DROP_COMMUNITY_PATH = "/comunidade";
export const DROP_CLAIM_PATH = "/comunidade/criar-acesso";

/** Tabela de preços exclusivos a partir de 1 peça. */
export type DropMemberPriceRow = {
  label: string;
  price: number;
};

export const DROP_MEMBER_PRICE_ROWS: DropMemberPriceRow[] = [
  { label: "Camisetas", price: 25 },
  { label: "Bermudas", price: 25 },
  { label: "Camiseta dry-fit", price: 25 },
  { label: "Calças elastano", price: 25 },
  { label: "Kit cuecas", price: 40 },
  { label: "Blusa moletom", price: 70 },
  { label: "Conjunto dryfit frio", price: 60 },
  { label: "Jeans", price: 65 },
];

/** Preços de atacado para quem monta estoque próprio. */
export const DROP_STOCK_TIERS = [
  { qty: 10, unit: 23 },
  { qty: 30, unit: 21 },
  { qty: 100, unit: 19 },
  { qty: 200, unit: 18 },
] as const;

import { normalizeWhatsappDigits } from "@/lib/whatsapp-normalize";

export type BotSelectedLead = {
  customer_whatsapp: string;
  customer_name: string | null;
};

export function botLeadKey(wa: string): string {
  return normalizeWhatsappDigits(wa);
}

export function toggleBotLeadInMap(
  map: Map<string, BotSelectedLead>,
  lead: BotSelectedLead
): Map<string, BotSelectedLead> {
  const key = botLeadKey(lead.customer_whatsapp);
  const next = new Map(map);
  if (next.has(key)) next.delete(key);
  else next.set(key, lead);
  return next;
}

export function toggleBotColumnInMap(
  map: Map<string, BotSelectedLead>,
  leads: BotSelectedLead[]
): Map<string, BotSelectedLead> {
  if (leads.length === 0) return map;
  const allSelected = leads.every((l) => map.has(botLeadKey(l.customer_whatsapp)));
  const next = new Map(map);
  if (allSelected) {
    for (const l of leads) next.delete(botLeadKey(l.customer_whatsapp));
  } else {
    for (const l of leads) next.set(botLeadKey(l.customer_whatsapp), l);
  }
  return next;
}

export function botLeadsFromMap(map: Map<string, BotSelectedLead>): BotSelectedLead[] {
  return Array.from(map.values());
}

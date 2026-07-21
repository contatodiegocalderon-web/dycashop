import type { CrmBotRecipientInput, CrmBotScheduleConfig } from "@/lib/crm-bot/types";

const GREETINGS = ["Olá", "Oi", "E aí", "Opa", "Fala"];
const CLOSINGS = [
  "Qualquer dúvida me chama!",
  "Fico no aguardo.",
  "Me avisa se precisar.",
  "Conta comigo.",
  "Abraço!",
];

function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length]!;
}

function firstName(name: string | null): string | null {
  const n = name?.trim().split(/\s+/)[0];
  return n && n.length >= 2 ? n : null;
}

/** Variações locais (sem API externa) — tom humano e único por destinatário. */
export function buildMessageVariations(
  reference: string,
  recipients: CrmBotRecipientInput[],
  config: CrmBotScheduleConfig
): string[] {
  const base = reference.trim();
  if (!base) return recipients.map(() => "");

  const maxVariations = Math.min(
    config.variationCount,
    Math.max(1, recipients.length)
  );

  const templates: string[] = [];
  for (let v = 0; v < maxVariations; v += 1) {
    const hi = pick(GREETINGS, v);
    const close = pick(CLOSINGS, v + 3);
    const body = base
      .replace(/\s+/g, " ")
      .replace(/!+/g, v % 2 === 0 ? "!" : ".")
      .trim();
    templates.push(`${hi}! ${body}\n\n${close}`);
  }

  return recipients.map((r, i) => {
    const fn = firstName(r.customer_name);
    const tpl = templates[i % templates.length] ?? base;
    if (!fn) return tpl;
    if (tpl.toLowerCase().includes(fn.toLowerCase())) return tpl;
    return tpl.replace(/^(Olá|Oi|E aí|Opa|Fala)!/i, `$1 ${fn}!`);
  });
}

export function computeScheduledTimes(
  recipientCount: number,
  config: CrmBotScheduleConfig,
  startAt: Date = new Date()
): Date[] {
  const times: Date[] = [];
  let cursor = startAt.getTime();

  for (let i = 0; i < recipientCount; i += 1) {
    if (i > 0 && i % config.groupSize === 0) {
      cursor += config.groupPauseSeconds * 1000;
    } else if (i > 0) {
      cursor += config.secondsPerPerson * 1000;
    }
    times.push(new Date(cursor));
  }

  return times;
}

export function groupIndexForPosition(index: number, groupSize: number): number {
  return Math.floor(index / groupSize);
}

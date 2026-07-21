const MS_DAY = 24 * 60 * 60 * 1000;

const WEEKDAY_PT = [
  "DOMINGO",
  "SEGUNDA",
  "TERÇA",
  "QUARTA",
  "QUINTA",
  "SEXTA",
  "SÁBADO",
] as const;

export type OrderDayGroup<T> = {
  dayKey: string;
  label: string;
  orders: T[];
};

/** Chave YYYY-MM-DD no fuso local do browser. */
export function localDayKeyFromIso(
  iso: string,
  tzOffsetMinutes = new Date().getTimezoneOffset()
): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "desconhecido";
  const d = new Date(t - tzOffsetMinutes * 60_000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function shiftYmd(ymd: string, deltaDays: number): string {
  const [yRaw, mRaw, dRaw] = ymd.split("-");
  const y = Number(yRaw);
  const m = Number(mRaw);
  const d = Number(dRaw);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return ymd;
  const ms = Date.UTC(y, m - 1, d) + deltaDays * MS_DAY;
  const dt = new Date(ms);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function formatOrderDaySectionLabel(
  dayKey: string,
  tzOffsetMinutes = new Date().getTimezoneOffset()
): string {
  if (dayKey === "desconhecido") return "SEM DATA";

  const todayKey = localDayKeyFromIso(new Date().toISOString(), tzOffsetMinutes);
  if (dayKey === todayKey) return "HOJE";
  if (dayKey === shiftYmd(todayKey, -1)) return "ONTEM";

  const [yRaw, mRaw, dRaw] = dayKey.split("-");
  const y = Number(yRaw);
  const m = Number(mRaw);
  const d = Number(dRaw);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return dayKey;
  }

  const noonUtc = Date.UTC(y, m - 1, d, 12, 0, 0, 0);
  const local = new Date(noonUtc - tzOffsetMinutes * 60_000);
  const weekday = WEEKDAY_PT[local.getUTCDay()] ?? "DIA";
  const dd = String(d).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  const todayY = Number(todayKey.slice(0, 4));
  if (y !== todayY) {
    return `${weekday} ${dd}/${mm}/${y}`;
  }
  return `${weekday} ${dd}/${mm}`;
}

/** Agrupa pedidos por dia (mais recente primeiro), preservando ordem dentro do dia. */
export function groupOrdersByLocalDay<T extends { id: string }>(
  orders: T[],
  getIso: (order: T) => string | null | undefined,
  tzOffsetMinutes = new Date().getTimezoneOffset()
): OrderDayGroup<T>[] {
  const map = new Map<string, T[]>();
  for (const order of orders) {
    const iso = getIso(order);
    const key = iso ? localDayKeyFromIso(iso, tzOffsetMinutes) : "desconhecido";
    const list = map.get(key) ?? [];
    list.push(order);
    map.set(key, list);
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dayKey, groupOrders]) => ({
      dayKey,
      label: formatOrderDaySectionLabel(dayKey, tzOffsetMinutes),
      orders: groupOrders,
    }));
}

/**
 * Filtros de período para histórico e métricas (data de confirmação do pedido).
 * Usa `tzOffsetMinutes` do browser (`Date.getTimezoneOffset()`).
 */

export type AdminPeriodKey =
  | "today"
  | "yesterday"
  | "weekly"
  | "monthly"
  | "yearly"
  | "last7"
  | "last30"
  | "all"
  /** @deprecated use dateRange */
  | "selectedDate"
  | "dateRange";

const MS_DAY = 24 * 60 * 60 * 1000;

export function parseAdminPeriodKey(raw: string | null): AdminPeriodKey {
  if (
    raw === "today" ||
    raw === "daily" ||
    raw === "yesterday" ||
    raw === "weekly" ||
    raw === "monthly" ||
    raw === "yearly" ||
    raw === "last7" ||
    raw === "last30" ||
    raw === "selectedDate" ||
    raw === "dateRange"
  ) {
    return raw === "daily" ? "today" : raw;
  }
  return "all";
}

/** `Date.getTimezoneOffset()` — minutos entre UTC e hora local. */
export function parseTzOffsetMinutes(raw: string | null | undefined): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function localYmd(nowMs: number, tzOffsetMinutes: number) {
  const d = new Date(nowMs - tzOffsetMinutes * 60_000);
  return {
    y: d.getUTCFullYear(),
    m: d.getUTCMonth(),
    day: d.getUTCDate(),
    utcDow: d.getUTCDay(),
  };
}

function localMidnightUtcMs(
  y: number,
  m: number,
  day: number,
  tzOffsetMinutes: number
): number {
  return Date.UTC(y, m, day, 0, 0, 0, 0) + tzOffsetMinutes * 60_000;
}

function parseYmd(raw: string | null): { y: number; m: number; d: number } | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [yRaw, mRaw, dRaw] = raw.split("-");
  const y = Number(yRaw);
  const m = Number(mRaw);
  const d = Number(dRaw);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  return { y, m: m - 1, d };
}

/** Um dia civil local → [início, fim) em ISO UTC. */
export function dayRangeUtcFromYmd(
  ymd: string | null,
  tzOffsetMinutes: number
): { startIso: string; endIso: string } | null {
  const p = parseYmd(ymd);
  if (!p) return null;
  const startUtcMs = localMidnightUtcMs(p.y, p.m, p.d, tzOffsetMinutes);
  return {
    startIso: new Date(startUtcMs).toISOString(),
    endIso: new Date(startUtcMs + MS_DAY).toISOString(),
  };
}

/** Intervalo inclusivo (dateFrom … dateTo) em dias locais. */
export function dateRangeUtcFromYmd(
  dateFrom: string | null,
  dateTo: string | null,
  tzOffsetMinutes: number
): { startIso: string; endIso: string } | null {
  const start = dayRangeUtcFromYmd(dateFrom, tzOffsetMinutes);
  const endDay = dayRangeUtcFromYmd(dateTo, tzOffsetMinutes);
  if (!start || !endDay) return null;
  if (new Date(start.startIso).getTime() > new Date(endDay.startIso).getTime()) {
    return null;
  }
  return { startIso: start.startIso, endIso: endDay.endIso };
}

/** Legado: um único dia. */
export function parseSelectedDateUtcRange(
  raw: string | null,
  tzOffsetMinutes: number
): { startIso: string; endIso: string } | null {
  return dayRangeUtcFromYmd(raw, tzOffsetMinutes);
}

export type ConfirmedAtFilter =
  | { kind: "all" }
  | { kind: "range"; startIso: string; endIso?: string };

export function confirmedAtFilterForPeriod(
  period: AdminPeriodKey,
  opts: {
    /** Legado — um dia */
    selectedDate?: string | null;
    dateFrom?: string | null;
    dateTo?: string | null;
    tzOffsetMinutes?: number;
    nowMs?: number;
  }
): ConfirmedAtFilter {
  const tz = opts.tzOffsetMinutes ?? 0;
  const now = opts.nowMs ?? Date.now();

  if (period === "all") return { kind: "all" };

  if (period === "dateRange") {
    const range = dateRangeUtcFromYmd(
      opts.dateFrom ?? null,
      opts.dateTo ?? null,
      tz
    );
    if (!range) {
      return {
        kind: "range",
        startIso: new Date(0).toISOString(),
        endIso: new Date(0).toISOString(),
      };
    }
    return { kind: "range", startIso: range.startIso, endIso: range.endIso };
  }

  if (period === "selectedDate") {
    const range = dayRangeUtcFromYmd(opts.selectedDate ?? null, tz);
    if (!range) {
      return {
        kind: "range",
        startIso: new Date(0).toISOString(),
        endIso: new Date(0).toISOString(),
      };
    }
    return { kind: "range", startIso: range.startIso, endIso: range.endIso };
  }

  const { y, m, day, utcDow } = localYmd(now, tz);
  const todayStart = localMidnightUtcMs(y, m, day, tz);

  if (period === "today") {
    return {
      kind: "range",
      startIso: new Date(todayStart).toISOString(),
      endIso: new Date(todayStart + MS_DAY).toISOString(),
    };
  }

  if (period === "yesterday") {
    const start = todayStart - MS_DAY;
    return {
      kind: "range",
      startIso: new Date(start).toISOString(),
      endIso: new Date(start + MS_DAY).toISOString(),
    };
  }

  if (period === "weekly") {
    const diffToMonday = (utcDow + 6) % 7;
    const mondayStart = todayStart - diffToMonday * MS_DAY;
    return {
      kind: "range",
      startIso: new Date(mondayStart).toISOString(),
      endIso: new Date(todayStart + MS_DAY).toISOString(),
    };
  }

  if (period === "monthly") {
    return {
      kind: "range",
      startIso: new Date(localMidnightUtcMs(y, m, 1, tz)).toISOString(),
      endIso: new Date(todayStart + MS_DAY).toISOString(),
    };
  }

  if (period === "yearly") {
    return {
      kind: "range",
      startIso: new Date(localMidnightUtcMs(y, 0, 1, tz)).toISOString(),
      endIso: new Date(todayStart + MS_DAY).toISOString(),
    };
  }

  if (period === "last7") {
    return {
      kind: "range",
      startIso: new Date(todayStart - 6 * MS_DAY).toISOString(),
      endIso: new Date(todayStart + MS_DAY).toISOString(),
    };
  }

  // last30 — últimos 30 dias civis incluindo hoje
  return {
    kind: "range",
    startIso: new Date(todayStart - 29 * MS_DAY).toISOString(),
    endIso: new Date(todayStart + MS_DAY).toISOString(),
  };
}

/** Rótulo curto do intervalo (para UI). */
export function describeConfirmedAtFilter(
  period: AdminPeriodKey,
  filter: ConfirmedAtFilter,
  tzOffsetMinutes: number
): string {
  if (filter.kind === "all") {
    return "Todo o período — vendas confirmadas com valor registado (inclui hoje).";
  }
  const fmt = (iso: string) => {
    const ms = new Date(iso).getTime() - tzOffsetMinutes * 60_000;
    return new Date(ms).toLocaleString("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "UTC",
    });
  };
  const labels: Record<AdminPeriodKey, string> = {
    all: "Todo o período",
    today: "Hoje",
    yesterday: "Ontem",
    weekly: "Semana atual (segunda a hoje)",
    monthly: "Mês atual",
    yearly: "Ano atual",
    last7: "Últimos 7 dias",
    last30: "Últimos 30 dias",
    selectedDate: "Dia selecionado",
    dateRange: "Período personalizado",
  };
  const base = labels[period] ?? period;
  if (!filter.endIso) {
    return `${base} · desde ${fmt(filter.startIso)}`;
  }
  return `${base} · ${fmt(filter.startIso)} até ${fmt(filter.endIso)}`;
}

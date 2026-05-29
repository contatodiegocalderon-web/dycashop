/**
 * Importa planilha Dyca (nome, telefone_com_ddd, criado_em, valor_ultimo_pedido).
 * Uso: node scripts/import-clients-legacy.mjs "C:/Users/.../clientes.xlsx"
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

const PAGE = 1000;
const SITE_VAREJO = "SITE-VAREJO";
const CLT_PREFIX = /^CLT\s+/i;

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  const raw = readFileSync(path, "utf8");
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

function normalizeWa(raw) {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("55") && d.length >= 12) return d;
  if (d.length >= 10 && d.length <= 11) return `55${d}`;
  return d.length >= 12 ? (d.startsWith("55") ? d : `55${d}`) : d;
}

function waKeys(d) {
  const n = normalizeWa(d);
  const s = new Set([n]);
  if (n.startsWith("55") && n.length > 12) s.add(n.slice(2));
  if (!n.startsWith("55")) s.add(`55${n}`);
  return [...s];
}

function cleanName(raw) {
  return String(raw ?? "")
    .replace(CLT_PREFIX, "")
    .replace(/\bCLT\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDate(raw) {
  const t = String(raw ?? "").trim();
  const m = t.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (!m) return new Date(2019, 0, 1).toISOString();
  const d = new Date(
    Number(m[3]),
    Number(m[2]) - 1,
    Number(m[1]),
    Number(m[4] ?? 12),
    Number(m[5] ?? 0),
    Number(m[6] ?? 0)
  );
  return Number.isNaN(d.getTime()) ? new Date(2019, 0, 1).toISOString() : d.toISOString();
}

function parseMoney(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw > 0 ? Number(raw.toFixed(2)) : null;
  }
  const s = String(raw).trim();
  if (!s) return null;
  const n = Number(s.replace(/[^\d,.-]/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Number(n.toFixed(2)) : null;
}

function pick(row, ...keys) {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== "") return row[k];
  }
  return undefined;
}

async function fetchOrderState(admin) {
  const map = new Map();
  let offset = 0;
  for (;;) {
    const { data, error } = await admin
      .from("orders")
      .select("customer_whatsapp, status, legacy_import")
      .not("customer_whatsapp", "is", null)
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    for (const r of data ?? []) {
      const wa = normalizeWa(r.customer_whatsapp);
      if (wa.length < 12) continue;
      const cur = map.get(wa) ?? {
        paidCount: 0,
        legacyPaidCount: 0,
        realPaidCount: 0,
        pendingCount: 0,
      };
      if (r.status === "PAGO") {
        cur.paidCount += 1;
        if (r.legacy_import) cur.legacyPaidCount += 1;
        else cur.realPaidCount += 1;
      } else if (r.status === "PENDENTE_PAGAMENTO" || r.status === "CANCELADO") {
        cur.pendingCount += 1;
      }
      map.set(wa, cur);
    }
    if ((data ?? []).length < PAGE) break;
    offset += PAGE;
  }
  return map;
}

function stateForWa(wa, map) {
  for (const k of waKeys(wa)) {
    const s = map.get(k);
    if (s) return s;
  }
  return { paidCount: 0, legacyPaidCount: 0, realPaidCount: 0, pendingCount: 0 };
}

function bumpState(map, wa, patch) {
  const cur = stateForWa(wa, map);
  const next = { ...cur, ...patch };
  for (const k of waKeys(wa)) map.set(k, next);
}

async function deleteLegacyPaid(admin, wa) {
  const { data, error } = await admin
    .from("orders")
    .select("id")
    .eq("customer_whatsapp", wa)
    .eq("status", "PAGO")
    .eq("legacy_import", true);
  if (error) throw error;
  const ids = (data ?? []).map((r) => r.id);
  if (!ids.length) return 0;
  const { error: delErr } = await admin.from("orders").delete().in("id", ids);
  if (delErr) throw delErr;
  return ids.length;
}

const filePath = process.argv[2];
if (!filePath) {
  console.error('Uso: node scripts/import-clients-legacy.mjs "C:/caminho/clientes.xlsx"');
  process.exit(1);
}

loadEnvLocal();
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const wb = XLSX.read(readFileSync(filePath), { type: "buffer" });
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });

const state = await fetchOrderState(admin);
const seen = new Set();
const stats = {
  rowsRead: rows.length,
  valid: 0,
  registered: 0,
  abandoned: 0,
  skippedExisting: 0,
  skippedDuplicateInFile: 0,
  skippedInvalid: 0,
  ordersCreated: 0,
  reconciledToAbandoned: 0,
};

const parsed = [];
for (const row of rows) {
  const name = cleanName(pick(row, "nome", "Nome"));
  const wa = normalizeWa(pick(row, "telefone_com_ddd", "Celular"));
  const createdAtIso = parseDate(pick(row, "criado_em", "Criado_em"));
  const lastOrderValue = parseMoney(pick(row, "valor_ultimo_pedido"));
  if (!name || wa.length < 12) {
    stats.skippedInvalid += 1;
    continue;
  }
  parsed.push({ name, wa, createdAtIso, lastOrderValue });
}
stats.valid = parsed.length;

for (const row of parsed) {
  if (waKeys(row.wa).some((k) => seen.has(k))) {
    stats.skippedDuplicateInFile += 1;
    continue;
  }
  for (const k of waKeys(row.wa)) seen.add(k);

  const s = stateForWa(row.wa, state);
  const hasValor = row.lastOrderValue != null && row.lastOrderValue > 0;

  if (hasValor) {
    if (s.realPaidCount > 0 || (s.paidCount > 0 && s.legacyPaidCount < s.paidCount)) {
      stats.skippedExisting += 1;
      continue;
    }
    if (s.paidCount > 0 && s.legacyPaidCount === s.paidCount) {
      await deleteLegacyPaid(admin, row.wa);
      bumpState(state, row.wa, { paidCount: 0, legacyPaidCount: 0 });
    }
    if (s.pendingCount > 0) {
      await admin
        .from("orders")
        .delete()
        .eq("customer_whatsapp", row.wa)
        .in("status", ["PENDENTE_PAGAMENTO", "CANCELADO"]);
      bumpState(state, row.wa, { pendingCount: 0 });
    }

    const payload = {
      status: "PAGO",
      customer_name: row.name,
      customer_whatsapp: row.wa,
      customer_segment: "ANTIGO",
      sale_amount: row.lastOrderValue,
      confirmed_at: row.createdAtIso,
      created_at: row.createdAtIso,
      requested_seller_name: "?",
      legacy_import: true,
    };
    let ins = await admin.from("orders").insert(payload);
    if (ins.error && /legacy_import/i.test(ins.error.message)) {
      const { legacy_import: _l, created_at: _c, ...fb } = payload;
      ins = await admin.from("orders").insert(fb);
    }
    if (ins.error) throw ins.error;

    await admin.from("crm_client_profiles").upsert(
      {
        whatsapp_digits: row.wa,
        business_profile: "uso_proprio",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "whatsapp_digits" }
    );

    stats.registered += 1;
    stats.ordersCreated += 1;
    bumpState(state, row.wa, { paidCount: 1, legacyPaidCount: 1, realPaidCount: 0 });
    continue;
  }

  if (s.realPaidCount > 0) {
    stats.skippedExisting += 1;
    continue;
  }

  if (s.paidCount > 0 && s.legacyPaidCount === s.paidCount) {
    const n = await deleteLegacyPaid(admin, row.wa);
    if (n > 0) stats.reconciledToAbandoned += 1;
    bumpState(state, row.wa, { paidCount: 0, legacyPaidCount: 0 });
  }

  if (stateForWa(row.wa, state).pendingCount > 0) {
    stats.skippedExisting += 1;
    continue;
  }

  const payload = {
    status: "PENDENTE_PAGAMENTO",
    customer_name: row.name,
    customer_whatsapp: row.wa,
    requested_seller_name: SITE_VAREJO,
    created_at: row.createdAtIso,
    legacy_import: true,
  };
  let ins = await admin.from("orders").insert(payload);
  if (ins.error && /legacy_import/i.test(ins.error.message)) {
    const { legacy_import: _l, ...fb } = payload;
    ins = await admin.from("orders").insert(fb);
  }
  if (ins.error) throw ins.error;

  stats.abandoned += 1;
  stats.ordersCreated += 1;
  bumpState(state, row.wa, { pendingCount: 1 });
}

console.log(JSON.stringify(stats, null, 2));

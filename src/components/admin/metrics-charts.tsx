"use client";

import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

const PALETTE = [
  "#2563eb",
  "#dc2626",
  "#7c3aed",
  "#d97706",
  "#0891b2",
  "#f59e0b",
  "#16a34a",
  "#ea580c",
  "#64748b",
];

function distinctColors(n: number): string[] {
  if (n <= 0) return [];
  const out: string[] = [];
  for (let i = 0; i < n; i += 1) {
    if (i < PALETTE.length) {
      out.push(PALETTE[i]!);
    } else {
      const h = Math.round((360 * i) / n);
      out.push(`hsl(${h} 72% 46%)`);
    }
  }
  return out;
}

export type NamedValue = { name: string; value: number };

function formatInt(n: number) {
  return new Intl.NumberFormat("pt-BR").format(Math.round(n));
}

export function SegmentPieChart({ data }: { data: NamedValue[] }) {
  const filtered = data.filter((d) => d.value > 0);
  if (filtered.length === 0) return null;
  const segmentColor = (name: string) =>
    /novo/i.test(name) ? "#2563eb" : /antigo/i.test(name) ? "#dc2626" : "#64748b";
  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={filtered}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={52}
            outerRadius={88}
            paddingAngle={3}
            stroke="#fff"
            strokeWidth={2}
          >
            {filtered.map((d) => (
              <Cell key={d.name} fill={segmentColor(d.name)} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value) =>
              formatInt(typeof value === "number" ? value : Number(value))
            }
            contentStyle={{
              borderRadius: "12px",
              border: "1px solid #e7e5e4",
              boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.08)",
            }}
          />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Junta fatias pequenas em &quot;Outros&quot; para legibilidade. */
export function CategoryPieChart({
  title,
  entries,
  valuePrefix = "",
}: {
  title: string;
  entries: { name: string; value: number }[];
  /** ex.: R$ — Tooltip mostra valor formatado */
  valuePrefix?: string;
}) {
  const sorted = [...entries].sort((a, b) => b.value - a.value);
  const maxSlices = 8;
  let data: NamedValue[] = [];
  if (sorted.length <= maxSlices) {
    data = sorted.map((s) => ({ name: s.name, value: s.value }));
  } else {
    const head = sorted.slice(0, maxSlices - 1);
    const rest = sorted.slice(maxSlices - 1);
    const otherSum = rest.reduce((s, x) => s + x.value, 0);
    data = [
      ...head.map((s) => ({ name: s.name, value: s.value })),
      { name: "Outros", value: otherSum },
    ];
  }
  const filtered = data.filter((d) => d.value > 0);
  if (filtered.length === 0) return null;
  const colors = distinctColors(filtered.length);

  const money =
    valuePrefix === "R$"
      ? (n: number) =>
          n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
      : formatInt;

  return (
    <div>
      <p className="mb-2 text-center text-xs font-semibold uppercase tracking-wide text-stone-500">
        {title}
      </p>
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={filtered}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={56}
              outerRadius={96}
              paddingAngle={2}
              stroke="#fff"
              strokeWidth={2}
            >
              {filtered.map((d, i) => (
                <Cell key={d.name} fill={colors[i] ?? PALETTE[0]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value) =>
                money(
                  typeof value === "number" ? value : Number(value || 0)
                )
              }
              contentStyle={{
                borderRadius: "12px",
                border: "1px solid #e7e5e4",
                boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.08)",
              }}
            />
            <Legend
              layout="horizontal"
              verticalAlign="bottom"
              wrapperStyle={{ fontSize: "11px" }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

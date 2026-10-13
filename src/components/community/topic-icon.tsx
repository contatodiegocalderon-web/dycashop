import type { CommunityTopic } from "@/lib/drop-community";

const PATHS: Record<CommunityTopic["slug"], string[]> = {
  atacado: [
    "M4 15h16v6H4z",
    "M7 9h10v6H7z",
    "M10 3h4v6h-4z",
  ],
  varejo: [
    "M5 8h14l-1.2 12.2a1 1 0 0 1-1 .8H7.2a1 1 0 0 1-1-.8L5 8z",
    "M9 8V6a3 3 0 0 1 6 0v2",
  ],
  etiqueta: [
    "M3 12V4h8l10 10-8 8L3 12z",
    "M7.5 7.5h.01",
  ],
  catalogo: [
    "M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2h8.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5v-11z",
  ],
  pedido: [
    "M8 4h8v3H8z",
    "M6 5.5H5v15h14v-15h-1",
    "M8.5 13.5l2.5 2.5 4.5-5",
  ],
  aulas: ["M8 5.5v13l11-6.5z"],
  cronograma: [
    "M4 6h16v14H4z",
    "M4 10h16",
    "M8 3v5M16 3v5",
    "M9 15l2 2 4-4",
  ],
};

export function TopicIcon({
  slug,
  size = 28,
  className,
}: {
  slug: CommunityTopic["slug"];
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {PATHS[slug].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

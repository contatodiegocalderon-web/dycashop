"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import type { CategorySummary } from "@/lib/catalog-categories";
import {
  DROP_CATALOG_DRIVE_URL,
  DROP_CHECKOUT_URL,
  DROP_LOGIN_PATH,
  DROP_MEMBER_PRICE_ROWS,
  DROP_MONTHLY_PRICE_BRL,
  DROP_STOCK_TIERS,
  DROP_WHOLESALE_UNIT_BRL,
} from "@/lib/dropshipping";
import { WHATSAPP_SELLERS } from "@/lib/sellers";
import { CommunityShowcase, scrollToPlanOnMobile } from "@/components/drop-landing-showcase";
import { FREE_PIECE_EVERY, PIECE_MILESTONES } from "@/lib/drop-rewards";

const CNPJ = "65.888.954/0001-28";
const INSTAGRAM_URL = "https://www.instagram.com/dyfontecamisetas/";

const PROOF_STATS = [
  { value: "+10 mil", label: "pedidos enviados" },
  { value: "+500", label: "parceiros no time" },
  { value: "+3M", label: "faturados" },
  { value: "6 anos", label: "abastecendo o Brasil" },
];

const GUARANTEES = [
  {
    t: "Garantia de 7 dias",
    d: "Assinou e não fez sentido pra você? Pede o reembolso dentro de 7 dias.",
  },
  {
    t: "Cancele quando quiser",
    d: "Sem fidelidade e sem multa. Você fica enquanto estiver valendo a pena.",
  },
  {
    t: "Só paga a peça depois de vender",
    d: "Nenhum real parado em estoque. O dinheiro do cliente entra antes.",
  },
];

function money(n: number) {
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function sellerLink(phone: string) {
  const text = encodeURIComponent(
    "Oi! Vi a página de venda sem estoque e quero tirar uma dúvida sobre o plano."
  );
  return `https://wa.me/${phone}?text=${text}`;
}

function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll("[data-reveal]");
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-revealed");
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

const HERO_PILLARS: { title: string; desc: string; target: string; icon: ReactNode }[] = [
  {
    title: "Tudo pronto pra postar",
    target: "por-dentro",
    desc: "Fotos e vídeos prontos. É só seguir o cronograma.",
    icon: (
      <path d="M8 3v3M16 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm4 9 2 2 4-4" />
    ),
  },
  {
    title: "Preço exclusivo pra membros",
    target: "custo",
    desc: "Atacado a partir de 1 peça.",
    icon: <path d="M20 12 12 20l-8-8V4h8l8 8ZM8.5 8.5h.01" />,
  },
  {
    title: "Alta procura + preço de fábrica",
    target: "estoque",
    desc: "Os produtos que mais vendem, direto da fonte.",
    icon: <path d="M12 3c1 3 4 4.5 4 8.5a4 4 0 0 1-8 0c0-1.8.8-3 1.8-4 .2 1.6 1 2.5 2.2 2.5 0-2.5-1-4.5 0-7ZM6 17a7 7 0 0 0 12 0" />,
  },
  {
    title: "Enviamos pro seu cliente",
    target: "por-que",
    desc: "Nossa equipe embala e despacha seu pedido em até 24h.",
    icon: (
      <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7M7 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm10 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
    ),
  },
];

const PILLAR_MS = 2800;

function HeroPillars() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [motion, setMotion] = useState(false);
  const [shown, setShown] = useState(false);
  const [cycling, setCycling] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setMotion(!reduce);
    const raf = requestAnimationFrame(() => setShown(true));
    const t = window.setTimeout(() => setCycling(true), reduce ? 0 : 1100);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, []);

  useEffect(() => {
    if (!motion || paused || !cycling) return;
    const t = window.setTimeout(() => setActive((i) => (i + 1) % HERO_PILLARS.length), PILLAR_MS);
    return () => window.clearTimeout(t);
  }, [active, paused, motion, cycling]);

  return (
    <ul
      className="mt-6 grid max-w-xl grid-cols-2 gap-2.5 sm:gap-3"
      onMouseLeave={() => setPaused(false)}
    >
      {HERO_PILLARS.map((p, i) => {
        const on = (cycling || paused) && i === active;
        return (
          <li
            key={p.title}
            style={{ transitionDelay: shown && !cycling ? `${200 + i * 130}ms` : "0ms" }}
            onMouseEnter={() => {
              setActive(i);
              setPaused(true);
            }}
            className={`relative overflow-hidden rounded-2xl border transition-[opacity,transform,border-color,background-color,box-shadow] duration-700 ease-out ${
              shown ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
            } ${
              on
                ? "border-emerald-400/50 bg-emerald-400/[0.08] shadow-[0_0_32px_-8px_rgba(16,185,129,0.55)]"
                : "border-white/[0.07] bg-white/[0.02]"
            }`}
          >
            <a
              href={`#${p.target}`}
              onClick={(e) => {
                const el = document.getElementById(p.target);
                if (!el) return;
                e.preventDefault();
                setActive(i);
                setPaused(true);
                el.scrollIntoView({ behavior: motion ? "smooth" : "auto", block: "start" });
              }}
              className="block h-full rounded-[inherit] p-3 outline-none sm:p-4 focus-visible:ring-2 focus-visible:ring-emerald-400/60"
            >
            <span
              className={`flex h-9 w-9 items-center justify-center rounded-xl transition-all duration-500 ${
                on ? "scale-110 bg-emerald-400 text-zinc-950" : "bg-emerald-400/10 text-emerald-300"
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                width={18}
                height={18}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                {p.icon}
              </svg>
            </span>
            <p
              className={`mt-3 text-sm font-semibold leading-snug tracking-tight transition-colors duration-500 sm:text-[15px] ${
                on ? "text-stone-50" : "text-stone-300"
              }`}
            >
              {p.title}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-stone-500">{p.desc}</p>
            </a>
            {on && motion && !paused && cycling ? (
              <span
                key={`bar-${active}`}
                className="drop-pillar-bar absolute inset-x-0 bottom-0 h-0.5 origin-left bg-emerald-400"
                style={{ "--pillar-ms": `${PILLAR_MS}ms` } as CSSProperties}
                aria-hidden
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function useStageLight() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const root = document.querySelector(".drop-stage") as HTMLElement | null;
    if (!root) return;
    const onMove = (e: PointerEvent) => {
      root.style.setProperty("--drop-mx", `${e.clientX}px`);
      root.style.setProperty("--drop-my", `${e.clientY}px`);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);
}

function useShowStickyCta() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const hero = document.getElementById("topo");
    const offer = document.getElementById("assinar");
    if (!hero) return;
    let heroOut = false;
    let offerIn = false;
    const sync = () => setShow(heroOut && !offerIn);
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.target === hero) heroOut = !e.isIntersecting;
        if (e.target === offer) offerIn = e.isIntersecting;
      }
      sync();
    });
    io.observe(hero);
    if (offer) io.observe(offer);
    return () => io.disconnect();
  }, []);
  return show;
}

function Tilt({
  children,
  className = "",
  max = 8,
}: {
  children: ReactNode;
  className?: string;
  max?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (window.matchMedia("(pointer: coarse)").matches) return;

    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      el.style.setProperty("--rx", `${(-y * max).toFixed(2)}deg`);
      el.style.setProperty("--ry", `${(x * max).toFixed(2)}deg`);
    };
    const onLeave = () => {
      el.style.setProperty("--rx", "0deg");
      el.style.setProperty("--ry", "0deg");
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, [max]);

  return (
    <div ref={ref} className={`drop-tilt ${className}`}>
      {children}
    </div>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-400">
      {children}
    </p>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="mt-3 max-w-3xl text-3xl font-semibold tracking-[-0.04em] text-stone-50 sm:text-5xl">
      {children}
    </h2>
  );
}

function Check() {
  return (
    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
      <svg viewBox="0 0 16 16" width={11} height={11} fill="none" aria-hidden>
        <path
          d="M3 8.5l3 3 7-7"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function PrimaryCta({
  children,
  className = "",
  checkout = false,
}: {
  children: ReactNode;
  className?: string;
  checkout?: boolean;
}) {
  return (
    <a
      href={DROP_CHECKOUT_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={checkout ? undefined : scrollToPlanOnMobile}
      className={`drop-cta-glow inline-flex items-center justify-center whitespace-nowrap rounded-full bg-emerald-500 px-7 py-4 text-sm font-bold uppercase tracking-[0.12em] text-zinc-950 transition hover:bg-emerald-400 ${className}`}
    >
      {children}
    </a>
  );
}

const HERO_QUOTES = [
  "Eu comecei hoje no on-line e já consegui 400 reais",
  "Quando eu vendia eu já lucrei quase 600 reais no dia",
];

function HeroProof({ shots }: { shots: string[] }) {
  return (
    <div className="mx-auto w-full max-w-md">
      <Tilt max={6}>
        <a href="#feedbacks" className="drop-proof-scene block" aria-label="Ver feedbacks dos parceiros">
          <div className="drop-proof-glow" aria-hidden />
          {shots.map((src, i) => (
            <div key={src} className={`drop-phone drop-phone-${i}`}>
              <Image
                src={src}
                alt="Print de feedback de parceiro"
                fill
                unoptimized
                priority={i === 1}
                className="object-cover object-top"
              />
            </div>
          ))}
          <p className="drop-quote drop-quote-0">
            <span className="drop-quote-stars" aria-hidden>
              ★★★★★
            </span>
            “{HERO_QUOTES[0]}”
          </p>
          <p className="drop-quote drop-quote-1">
            <span className="drop-quote-stars" aria-hidden>
              ★★★★★
            </span>
            “{HERO_QUOTES[1]}”
          </p>
          <p className="drop-badge">
            <span className="drop-badge-dot" aria-hidden />
            +500 lojas vendendo agora
          </p>
        </a>
      </Tilt>
      <dl className="mt-6 grid grid-cols-3 divide-x divide-white/[0.08] rounded-2xl border border-white/[0.08] bg-white/[0.02] text-center">
        {PROOF_STATS.filter((s) => s.value !== "+500").map((s) => (
          <div key={s.label} className="flex flex-col-reverse px-2 py-3">
            <dt className="mt-0.5 text-[10px] leading-tight text-stone-500 sm:text-[11px]">
              {s.label}
            </dt>
            <dd className="font-mono text-lg font-semibold text-emerald-400 sm:text-xl">
              {s.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

const BLOCKERS = [
  {
    pain: "Precisa de dinheiro pra comprar estoque",
    fix: "Você só compra a peça depois que o seu cliente pagou.",
  },
  {
    pain: "Atacado exige comprar várias peças de uma vez",
    fix: `1 peça já sai no preço de atacado: ${money(DROP_WHOLESALE_UNIT_BRL)}.`,
  },
  {
    pain: "Sobra tamanho e modelo que não vende",
    fix: "Nada fica parado. Vendeu, pediu. Não vendeu, não gastou.",
  },
  {
    pain: "Não sabe o que postar nem tem foto boa",
    fix: "O cronograma diz o que postar todo dia, com foto e vídeo prontos.",
  },
  {
    pain: "Começa animado e desiste na segunda semana",
    fix: "A jornada mostra seu progresso e te dá 1 peça grátis a cada 10 vendidas.",
  },
  {
    pain: "Pouca variedade pra oferecer",
    fix: "+10 mil itens num link atualizado em tempo real.",
  },
  {
    pain: "Embalar e despachar dá trabalho",
    fix: "A gente separa, embala e despacha em até 24h direto pro seu cliente.",
  },
];

const STEPS = [
  {
    t: "Assina o plano",
    d: `${money(DROP_MONTHLY_PRICE_BRL)} por mês, com garantia de 7 dias.`,
  },
  {
    t: "Entra na hora",
    d: "Logo depois do pagamento você cria sua senha e já entra na comunidade.",
  },
  {
    t: "Segue o cronograma",
    d: "Abre as tarefas do dia, posta o que está na lista e dá o check.",
  },
  {
    t: "Vendeu, a gente envia",
    d: "Cliente pagou? Você gera a etiqueta no SuperFrete e manda com o pedido. Despachamos em até 24h.",
  },
];

const INCLUDED = [
  `Preço de atacado em 1 peça — camiseta e bermuda a ${money(DROP_WHOLESALE_UNIT_BRL)}`,
  "Cronograma diário pronto: o que postar no feed e nos stories",
  "Vídeos novos toda semana",
  "Catálogo com +10 mil itens, atualizado em tempo real",
  "Jornada de recompensas: 1 peça grátis a cada 10 vendidas",
  "Aulas passo a passo de pedido, etiqueta e frete",
  "Despacho em até 24h direto pro seu cliente",
  "Entrada no time com +500 parceiros",
  "Tabela exclusiva se quiser montar estoque próprio",
];

const SCHEDULE_POINTS = [
  {
    t: "Tudo já escolhido pra você",
    d: "2 posts no feed e até 3 stories por dia, na ordem certa pra vender.",
  },
  {
    t: "Material novo toda semana",
    d: "Vídeos girando camiseta, puxando bermuda, kits e qualidade, mais as fotos do catálogo.",
  },
  {
    t: "Sem tempo? Só o essencial",
    d: "O post principal e o story da noite. São 2 tarefas e já conta o dia.",
  },
  {
    t: "Constância que vira venda",
    d: "Cada check soma na sua sequência de dias seguidos.",
  },
];


const FAQ = [
  {
    q: "Preciso comprar estoque antes?",
    a: "Não. Você divulga, vende e só depois que o cliente paga você compra a peça com a gente.",
  },
  {
    q: "Tem pedido mínimo?",
    a: `Não. Uma peça já sai no preço de atacado — ${money(DROP_WHOLESALE_UNIT_BRL)} a camiseta ou bermuda.`,
  },
  {
    q: "Quem envia a peça pro meu cliente?",
    a: "A gente. Você gera a etiqueta de envio com o endereço do seu cliente (a gente ensina na comunidade) e manda junto do pedido. Nós separamos, embalamos e despachamos no mesmo dia, em menos de 24h.",
  },
  {
    q: "Quem paga o frete?",
    a: "O frete é calculado do nosso CEP até o CEP do seu cliente, pelo app SuperFrete, onde você gera a etiqueta. Você decide: cobrar do cliente (o mais comum) ou oferecer frete grátis como estratégia.",
  },
  {
    q: "Posso cancelar?",
    a: "Pode, a qualquer momento, sem multa. E você tem garantia de 7 dias: se não fizer sentido, pede o reembolso.",
  },
  {
    q: "Eu preciso criar as fotos e os vídeos?",
    a: "Não. Os vídeos novos chegam toda semana e as fotos estão no catálogo. O cronograma diz o que postar em cada dia e como fazer.",
  },
  {
    q: "Quanto tempo eu preciso por dia?",
    a: "Você decide. O essencial são 2 tarefas: o post principal e o story da noite. Com mais tempo, você faz o cronograma completo: 2 posts no feed e até 3 stories.",
  },
  {
    q: "Como funciona a jornada de recompensas?",
    a: "Todo pedido confirmado no WhatsApp da sua assinatura conta sozinho. A cada 10 peças você ganha 1 grátis e um vídeo exclusivo. Com 50 peças o preço cai pra R$ 23, depois R$ 22, R$ 21 e R$ 20. Com 100 peças você ganha suporte exclusivo. Em compras: R$ 5 mil dá a pulseira de membro, R$ 10 mil a placa e R$ 50 mil o preço de sócio.",
  },
  {
    q: "O cliente vai ver que é da DYCASHOP?",
    a: "O catálogo e o conteúdo vão sem a nossa marca. Você divulga como a sua loja.",
  },
  {
    q: "Quem define o preço de venda?",
    a: `Você. O seu custo é ${money(DROP_WHOLESALE_UNIT_BRL)} por peça; a diferença pro preço que você cobrar é o seu lucro.`,
  },
  {
    q: "Como recebo o acesso depois de pagar?",
    a: "Na hora. Logo depois do pagamento a Kiwify te leva pra página de criar sua senha, e você já entra na comunidade.",
  },
  {
    q: "E se eu quiser ter estoque próprio?",
    a: "Parceiro tem tabela exclusiva no atacado: 10 peças a R$ 23, 30 peças a R$ 21, 50 peças a R$ 20, 100 peças a R$ 19 e 200 peças a R$ 18 cada.",
  },
];

export function DropLanding({
  categories,
  heroShots,
  railShots,
}: {
  categories: CategorySummary[];
  heroShots: string[];
  railShots: string[];
}) {
  useReveal();
  useStageLight();
  const showSticky = useShowStickyCta();

  const showcase = categories
    .filter((c) => c.count > 0 && (c.coverImageUrl || c.previewImageUrls[0]))
    .slice(0, 8);

  return (
    <div className="drop-stage min-h-[100dvh] bg-[#09090b] text-stone-100">
      <div className="drop-spot" aria-hidden />
      <div className="drop-grain" aria-hidden />

      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#09090b]/92 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <Image
              src="/brand-logo.png"
              alt=""
              width={36}
              height={36}
              className="h-8 w-8 object-contain"
              unoptimized
            />
            <span className="text-[11px] font-semibold uppercase tracking-[0.28em] text-stone-200">
              DYCASHOP
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href={DROP_LOGIN_PATH}
              className="rounded-full border border-white/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-300 hover:text-white"
            >
              Já sou parceiro
            </Link>
            <a
              href="#assinar"
              className="rounded-full bg-stone-100 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-950"
            >
              Assinar
            </a>
          </div>
        </div>
      </header>

      <main className="relative z-10">
        {/* 1. Promessa */}
        <section
          id="topo"
          className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-12 sm:px-6 sm:pt-20 lg:grid-cols-[1.1fr_0.9fr]"
        >
          <div>
            <Eyebrow>Pra quem quer vender roupa sem ter que investir em estoque</Eyebrow>
            <h1 className="mt-4 text-[2.6rem] font-semibold leading-[1.02] tracking-[-0.05em] text-stone-50 sm:text-6xl">
              Monte sua loja de roupas{" "}
              <span className="text-emerald-400">sem comprar uma peça antes.</span>
            </h1>
            <HeroPillars />
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <PrimaryCta>Quero ser parceiro</PrimaryCta>
            </div>
          </div>

          {heroShots.length > 0 ? (
            <HeroProof shots={heroShots} />
          ) : (
          <Tilt max={7} className="mx-auto w-full max-w-sm">
            <div className="drop-card drop-receipt p-6 sm:p-7">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-stone-500">
                Quem está por trás de você
              </p>
              <p className="mt-2 text-lg font-semibold leading-snug tracking-tight text-stone-50">
                A estrutura de uma loja grande, trabalhando pra sua.
              </p>
              <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.08]">
                {PROOF_STATS.map((s) => (
                  <div key={s.label} className="bg-[#111113] px-4 py-4">
                    <dt className="sr-only">{s.label}</dt>
                    <dd className="font-mono text-2xl font-semibold tracking-tight text-emerald-400">
                      {s.value}
                    </dd>
                    <dd className="mt-1 text-[11px] leading-tight text-stone-400">
                      {s.label}
                    </dd>
                  </div>
                ))}
              </dl>
              {railShots.length > 0 ? (
                <a href="#feedbacks" className="mt-5 flex items-center gap-3">
                  <span className="flex -space-x-3">
                    {railShots.slice(0, 3).map((src) => (
                      <span
                        key={src}
                        className="relative h-10 w-10 overflow-hidden rounded-full border-2 border-[#121214]"
                      >
                        <Image src={src} alt="" fill unoptimized className="object-cover" />
                      </span>
                    ))}
                  </span>
                  <span className="text-xs text-stone-300">
                    Veja o que os parceiros dizem →
                  </span>
                </a>
              ) : (
                <a
                  href={INSTAGRAM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-5 block text-xs text-stone-400 hover:text-stone-200"
                >
                  Veja os feedbacks nos destaques do @dyfontecamisetas →
                </a>
              )}
              <p className="mt-5 border-t border-white/10 pt-4 text-[11px] text-stone-500">
                CNPJ {CNPJ}
              </p>
            </div>
          </Tilt>
          )}
        </section>

        {/* 2. O que trava × como fica */}
        <section id="por-que" className="scroll-mt-16 border-y border-white/[0.06] bg-white/[0.015] py-20 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div data-reveal>
              <Eyebrow>Por que a maioria nunca começa</Eyebrow>
              <SectionTitle>
                Tudo que te impede de vender roupa, a gente já resolveu.
              </SectionTitle>
            </div>
            <div className="mt-10 overflow-hidden rounded-2xl border border-white/[0.08]" data-reveal>
              <div className="hidden grid-cols-2 border-b border-white/[0.08] bg-white/[0.03] text-[11px] font-semibold uppercase tracking-[0.2em] sm:grid">
                <p className="px-5 py-3 text-stone-500">Sozinho</p>
                <p className="px-5 py-3 text-emerald-400">Com a DYCASHOP</p>
              </div>
              {BLOCKERS.map((b) => (
                <div
                  key={b.pain}
                  className="grid border-b border-white/[0.06] last:border-0 sm:grid-cols-2"
                >
                  <p className="px-5 pt-4 text-sm text-stone-500 line-through decoration-stone-600 sm:py-4">
                    {b.pain}
                  </p>
                  <p className="flex gap-3 px-5 pb-4 pt-2 text-sm font-medium text-stone-100 sm:py-4">
                    <Check />
                    {b.fix}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 3. Prova social */}
        <section id="feedbacks" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-20 sm:px-6 sm:py-24">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between" data-reveal>
            <div>
              <Eyebrow>Quem já está no time</Eyebrow>
              <SectionTitle>+500 parceiros já vendem com a nossa estrutura.</SectionTitle>
              <p className="mt-4 max-w-xl text-base text-stone-400">
                São +10 mil pedidos enviados pra todo o Brasil{railShots.length > 0
                  ? ". Os prints abaixo são de clientes e parceiros reais."
                  : " e centenas de feedbacks nos destaques do nosso Instagram."}
              </p>
            </div>
            <a
              href={INSTAGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-sm font-semibold text-emerald-400 hover:text-emerald-300"
            >
              Mais feedbacks no Instagram →
            </a>
          </div>

          {railShots.length > 0 ? (
            <ul className="drop-feedback-rail -mx-4 mt-10 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6">
              {railShots.map((src, i) => (
                <li
                  key={src}
                  className="w-[68vw] max-w-[250px] shrink-0 snap-start"
                  data-reveal
                  style={{ "--reveal-delay": `${Math.min(i, 4) * 70}ms` } as CSSProperties}
                >
                  <Tilt max={6}>
                    <div className="drop-card overflow-hidden p-1.5">
                      <Image
                        src={src}
                        alt="Feedback de parceiro DYCASHOP"
                        width={600}
                        height={1000}
                        unoptimized
                        className="h-auto w-full rounded-[0.8rem]"
                      />
                    </div>
                  </Tilt>
                </li>
              ))}
            </ul>
          ) : null}
          {railShots.length > 0 ? (
            <p className="mt-2 text-xs text-stone-500">
              Arraste pro lado pra ver mais →
            </p>
          ) : null}

          <div className="mt-12 grid gap-3 md:grid-cols-3">
            {GUARANTEES.map((g, i) => (
              <div
                key={g.t}
                className="drop-card p-6"
                data-reveal
                style={{ "--reveal-delay": `${i * 80}ms` } as CSSProperties}
              >
                <Check />
                <p className="mt-4 text-lg font-semibold tracking-tight text-stone-50">
                  {g.t}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-stone-400">{g.d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 4. Por dentro: cronograma */}
        <section id="por-dentro" className="relative scroll-mt-24 overflow-hidden border-y border-white/[0.06] py-20 sm:py-28">
          <div className="drop-showcase-glow" aria-hidden />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr]">
            <div data-reveal>
              <Eyebrow>Por dentro da comunidade</Eyebrow>
              <SectionTitle>Você abre, faz o que está na lista e dá o check.</SectionTitle>
              <p className="mt-5 max-w-lg text-base leading-relaxed text-stone-400">
                Nada de pensar em estratégia. Todo dia o cronograma já monta o que postar no feed e nos
                stories, com o material pronto e o passo a passo de cada tarefa.
              </p>
              <ul className="mt-8 space-y-4 text-sm text-stone-200">
                {SCHEDULE_POINTS.map((p) => (
                  <li key={p.t} className="flex gap-3">
                    <Check />
                    <span>
                      <strong className="text-stone-50">{p.t}</strong>
                      <span className="block text-stone-400">{p.d}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="min-w-0" data-reveal>
              <CommunityShowcase />
            </div>
          </div>
        </section>

        {/* 5. Prova: o catálogo real */}
        <section id="estoque" className="scroll-mt-16 border-y border-white/[0.06] py-20 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between" data-reveal>
              <div>
                <Eyebrow>O estoque que vira sua loja</Eyebrow>
                <SectionTitle>+10 mil itens prontos pra você vender.</SectionTitle>
                <p className="mt-4 max-w-xl text-base text-stone-400">
                  É o estoque de uma loja grande e consolidada. Sem a nossa marca:
                  você divulga como a sua loja.
                </p>
              </div>
              <a
                href={DROP_CATALOG_DRIVE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-sm font-semibold text-emerald-400 hover:text-emerald-300"
              >
                Ver o catálogo completo →
              </a>
            </div>
            {showcase.length > 0 ? (
              <ul className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {showcase.map((c, i) => (
                  <li
                    key={c.slug}
                    data-reveal
                    style={{ "--reveal-delay": `${i * 50}ms` } as CSSProperties}
                  >
                    <Tilt max={10}>
                      <div className="drop-card overflow-hidden">
                        <div className="relative aspect-square">
                          <Image
                            src={c.coverImageUrl?.trim() || c.previewImageUrls[0]!}
                            alt={c.label}
                            fill
                            unoptimized
                            className="object-cover"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
                          <div className="absolute inset-x-0 bottom-0 p-3">
                            <p className="truncate text-xs font-semibold uppercase tracking-wide text-white">
                              {c.label}
                            </p>
                            <p className="text-[11px] text-stone-300">
                              +{c.count.toLocaleString("pt-BR")} modelos
                            </p>
                          </div>
                        </div>
                      </div>
                    </Tilt>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </section>

        {/* 6. Como funciona */}
        <section id="como" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-20 sm:px-6 sm:py-24">
          <div data-reveal>
            <Eyebrow>Como funciona</Eyebrow>
            <SectionTitle>Do pagamento à primeira venda em 4 passos.</SectionTitle>
          </div>
          <ol className="drop-steps mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
            {STEPS.map((s, i) => (
              <li
                key={s.t}
                className="drop-step relative"
                data-reveal
                style={{ "--reveal-delay": `${i * 90}ms` } as CSSProperties}
              >
                <span className="drop-orb">{i + 1}</span>
                <p className="mt-5 text-xl font-semibold tracking-tight text-stone-50">
                  {s.t}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-stone-400">{s.d}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* 7. Preços */}
        <section id="custo" className="scroll-mt-16 border-y border-white/[0.06] bg-white/[0.015] py-20 sm:py-24">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-2">
            <div className="min-w-0" data-reveal>
              <Eyebrow>Seu custo por peça</Eyebrow>
              <SectionTitle>Preço de atacado, a partir de 1 peça.</SectionTitle>
              <Tilt max={4} className="mt-8">
                <div className="drop-card overflow-hidden">
                  <table className="w-full text-left text-sm">
                    <tbody>
                      {DROP_MEMBER_PRICE_ROWS.map((row) => (
                        <tr
                          key={row.label}
                          className="border-b border-white/[0.06] last:border-0"
                        >
                          <td className="px-5 py-3 text-stone-300">{row.label}</td>
                          <td className="px-5 py-3 text-right font-mono tabular-nums text-stone-50">
                            {money(row.price)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Tilt>
            </div>

            <div className="min-w-0" data-reveal>
              <Eyebrow>Estoque próprio</Eyebrow>
              <SectionTitle>PREÇO EXCLUSIVO NO ATACADO👕</SectionTitle>
              <p className="mt-4 max-w-md text-sm leading-relaxed text-stone-400">
                Membros da comunidade têm preço exclusivo no atacado para conseguir lucrar mais.
              </p>
              <div className="drop-stairs mt-8 flex items-end gap-1.5 sm:gap-3">
                {[
                  { label: "1 peça", sub: "dropshipping", unit: DROP_WHOLESALE_UNIT_BRL },
                  ...DROP_STOCK_TIERS.map((t) => ({
                    label: `${t.qty} peças`,
                    sub: "atacado",
                    unit: t.unit,
                  })),
                ].map((s, i) => (
                  <div
                    key={s.label}
                    className="drop-stair min-w-0 flex-1"
                    style={{ "--i": i } as CSSProperties}
                  >
                    <p className="text-center font-mono text-xs font-semibold tabular-nums text-stone-50 sm:text-xl">
                      R${s.unit}
                    </p>
                    <div className="drop-stair-bar mt-2" />
                    <p className="mt-2 text-center text-[11px] font-semibold text-stone-300">
                      {s.label}
                    </p>
                    <p className="text-center text-[10px] text-stone-600">{s.sub}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 8. Pra quem é */}
        <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
          <div data-reveal>
            <Eyebrow>Pra quem é</Eyebrow>
            <SectionTitle>Uma parceria pra quem vai levar a sério.</SectionTitle>
            <p className="mt-4 max-w-2xl text-base text-stone-400">
              Você usa a estrutura de uma loja grande e consolidada pra vender com
              condições especiais — e cresce junto com a gente.
            </p>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            <div className="drop-card p-6" data-reveal>
              <p className="text-sm font-semibold text-emerald-400">É pra você se…</p>
              <ul className="mt-4 space-y-3 text-sm text-stone-200">
                {[
                  "quer começar a vender roupa com pouco dinheiro",
                  "já vende e quer mais variedade sem segurar estoque",
                  "topa postar todo dia e seguir o cronograma",
                ].map((t) => (
                  <li key={t} className="flex gap-3">
                    <Check />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-[1.15rem] border border-white/[0.06] p-6" data-reveal>
              <p className="text-sm font-semibold text-stone-500">Não é pra você se…</p>
              <ul className="mt-4 space-y-3 text-sm text-stone-500">
                {[
                  "espera vender sem divulgar",
                  "quer testar só um fim de semana",
                ].map((t) => (
                  <li key={t} className="flex gap-3">
                    <span className="mt-2 h-px w-3 shrink-0 bg-stone-600" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* 9. Jornada de recompensas */}
        <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6 sm:pb-24">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between" data-reveal>
            <div>
              <Eyebrow>Jornada de recompensas</Eyebrow>
              <SectionTitle>Quanto mais você vende, mais você ganha.</SectionTitle>
              <p className="mt-4 max-w-xl text-base text-stone-400">
                Todo pedido confirmado conta sozinho na sua jornada. Esse é o caminho:
              </p>
            </div>
            <p className="inline-flex shrink-0 items-center gap-2 self-start rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-200 lg:self-auto">
              🎁 A cada {FREE_PIECE_EVERY} peças vendidas: você ganha 1 grátis
            </p>
          </div>

          <ol className="relative mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <span
              className="absolute left-[8%] right-[8%] top-[22px] hidden h-px bg-gradient-to-r from-emerald-400/60 via-emerald-400/25 to-amber-300/50 lg:block"
              aria-hidden
            />
            {PIECE_MILESTONES.map((m, i) => (
              <li
                key={m.at}
                className="relative"
                data-reveal
                style={{ "--reveal-delay": `${i * 70}ms` } as CSSProperties}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-full font-mono text-sm font-bold ${
                      i === 0
                        ? "bg-emerald-400 text-zinc-950 shadow-[0_0_24px_rgba(16,185,129,0.55)]"
                        : "border border-emerald-400/40 bg-[#0c0f0e] text-emerald-300"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="bg-gradient-to-r from-violet-300 via-fuchsia-200 to-violet-400 bg-clip-text text-sm font-bold uppercase tracking-[0.16em] text-transparent drop-shadow-[0_0_14px_rgba(168,85,247,0.85)]">
                    {m.rank}
                  </span>
                </div>
                <p className="mt-3 font-mono text-xs font-semibold uppercase tracking-wider text-emerald-400">
                  {m.at === 0 ? "Início" : `${m.at} peças vendidas`}
                </p>
                <p className="mt-1 text-base font-semibold tracking-tight text-stone-50">
                  {m.at === 0 ? `R$ ${m.price} por peça` : m.title}
                </p>
                {m.price != null ? (
                  <p className="mt-0.5 text-xs font-semibold text-emerald-300/90">mesmo levando só 1</p>
                ) : null}
                <p className="mt-1 text-xs leading-relaxed text-stone-500">
                  {m.at === 0 ? "Sua primeira venda já começa a contar." : m.desc}
                </p>
              </li>
            ))}
          </ol>
        </section>

        {/* 10. Oferta */}
        <section
          id="assinar"
          className="scroll-mt-24 border-y border-white/[0.06] py-20 sm:py-24"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <Tilt max={4} className="mx-auto max-w-3xl">
              <div id="plano" className="drop-card drop-plan grid scroll-mt-20 gap-8 p-7 sm:p-10 md:grid-cols-[1.2fr_0.8fr]">
                <div>
                  <Eyebrow>Plano mensal</Eyebrow>
                  <p className="mt-3 text-2xl font-semibold tracking-tight text-stone-50">
                    Tudo que você recebe
                  </p>
                  <ul className="mt-6 space-y-3 text-sm text-stone-200">
                    {INCLUDED.map((t) => (
                      <li key={t} className="flex gap-3">
                        <Check />
                        {t}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex flex-col justify-center border-t border-white/10 pt-8 md:border-l md:border-t-0 md:pl-8 md:pt-0">
                  <p className="font-mono text-5xl font-semibold tracking-tight text-stone-50">
                    R${DROP_MONTHLY_PRICE_BRL}
                  </p>
                  <p className="mt-1 text-sm text-stone-400">por mês</p>
                  <p className="mt-4 text-sm font-medium text-emerald-300">
                    Garantia de 7 dias · cancele quando quiser
                  </p>
                  <PrimaryCta checkout className="mt-6 w-full !px-4">Quero ser parceiro</PrimaryCta>
                  <p className="mt-3 text-center text-xs text-stone-500">
                    Depois de pagar você cria sua senha e entra na hora. Já assinou?{" "}
                    <Link href={DROP_LOGIN_PATH} className="text-stone-300 underline">
                      Entrar
                    </Link>
                  </p>
                </div>
              </div>
            </Tilt>

            <div className="mx-auto mt-8 flex max-w-3xl flex-col items-center gap-3 text-center sm:flex-row sm:justify-center">
              <p className="text-sm text-stone-400">Ficou com dúvida antes de assinar?</p>
              <div className="flex gap-2">
                {WHATSAPP_SELLERS.map((s) => (
                  <a
                    key={s.phone}
                    href={sellerLink(s.phone)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full border border-emerald-500/30 px-4 py-2 text-xs font-semibold text-emerald-300 hover:border-emerald-400"
                  >
                    Falar com {s.name}
                  </a>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 11. Dúvidas */}
        <section className="mx-auto max-w-3xl px-4 py-20 sm:px-6 sm:py-24">
          <div className="text-center" data-reveal>
            <Eyebrow>Dúvidas</Eyebrow>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-stone-50 sm:text-4xl">
              Perguntas frequentes
            </h2>
          </div>
          <div className="mt-10 divide-y divide-white/[0.07] border-y border-white/[0.07]">
            {FAQ.map((f) => (
              <details key={f.q} className="drop-faq group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-medium text-stone-100">
                  {f.q}
                  <span className="text-xl leading-none text-stone-500 transition group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-stone-400">{f.a}</p>
              </details>
            ))}
          </div>
          <div className="mt-12 text-center">
            <PrimaryCta>Quero ser parceiro · R${DROP_MONTHLY_PRICE_BRL}/mês</PrimaryCta>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-white/[0.06] py-8 pb-28 text-center text-[11px] uppercase tracking-[0.2em] text-stone-600 sm:pb-8">
        <p>DYCASHOP · CNPJ {CNPJ}</p>
        <Link href="/" className="mt-2 inline-block hover:text-stone-400">
          Voltar ao catálogo
        </Link>
      </footer>

      <div
        className={`fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#09090b]/95 px-4 py-3 backdrop-blur-xl transition-transform duration-300 sm:hidden ${
          showSticky ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-stone-50">
              R${DROP_MONTHLY_PRICE_BRL}/mês
            </p>
            <p className="truncate text-[11px] text-stone-500">
              Atacado em 1 peça · sem estoque
            </p>
          </div>
          <PrimaryCta className="px-5 py-3 text-xs">Quero ser parceiro</PrimaryCta>
        </div>
      </div>
    </div>
  );
}

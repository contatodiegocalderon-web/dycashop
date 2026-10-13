"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAdminAuth } from "@/contexts/admin-auth";
import {
  COMMUNITY_TOPICS,
  WEEKDAY_LABELS,
  addDays,
  youtubeId,
  type LessonModule,
} from "@/lib/drop-community";
import { DROP_CLAIM_PATH } from "@/lib/dropshipping";
import { CONTENT_FORMATS, EFFORT_LABELS, FORMAT_KEYS, type FormatKey } from "@/lib/drop-content-plan";

type FormatLink = { format_key: string; material_url: string | null; lesson_id: string | null };

type Tab = "aulas" | "formatos" | "cronograma";

const TAB_LABELS: Record<Tab, string> = {
  aulas: "Aulas",
  formatos: "Material do cronograma",
  cronograma: "Extras da semana",
};

type Lesson = {
  id: string;
  module: LessonModule;
  title: string;
  description: string | null;
  youtube_url: string | null;
  position: number;
  published: boolean;
};

type Item = {
  id: string;
  weekday: number;
  title: string;
  description: string | null;
  link_url: string | null;
  position: number;
};

const LESSON_TOPICS = COMMUNITY_TOPICS.filter((t) => t.kind === "lessons");

const field =
  "w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-violet-200/30";

function fmt(iso: string) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

export default function AdminComunidadePage() {
  const router = useRouter();
  const { adminFetch, isOwner } = useAdminAuth();
  const [tab, setTab] = useState<Tab>("aulas");
  const [formats, setFormats] = useState<FormatLink[]>([]);
  const [savedFormat, setSavedFormat] = useState<string | null>(null);
  const [mod, setMod] = useState<LessonModule>("atacado");
  const [week, setWeek] = useState<string | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  const load = useCallback(
    async (w?: string | null) => {
      setError(null);
      const res = await adminFetch(`/api/admin/drop-content${w ? `?week=${w}` : ""}`);
      const data = (await res.json()) as {
        error?: string;
        week?: string;
        lessons?: Lesson[];
        items?: Item[];
        formats?: FormatLink[];
      };
      if (!res.ok) {
        setError(data.error ?? "Falha ao carregar");
        return;
      }
      setWeek(data.week ?? null);
      setLessons(data.lessons ?? []);
      setItems(data.items ?? []);
      setFormats(data.formats ?? []);
    },
    [adminFetch]
  );

  useEffect(() => {
    if (!isOwner) {
      router.replace("/admin/pedidos");
      return;
    }
    setOrigin(window.location.origin);
    void load();
  }, [isOwner, load, router]);

  async function send(method: string, body?: Record<string, unknown>, query?: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await adminFetch(`/api/admin/drop-content${query ?? ""}`, {
        method,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Falha");
      await load(week);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function addLesson(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const ok = await send("POST", {
      type: "lesson",
      module: mod,
      title: f.get("title"),
      description: f.get("description"),
      youtube_url: f.get("youtube_url"),
    });
    if (ok) form.reset();
  }

  async function saveLesson(e: FormEvent<HTMLFormElement>, id: string) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const ok = await send("PATCH", {
      type: "lesson",
      id,
      title: f.get("title"),
      description: f.get("description"),
      youtube_url: f.get("youtube_url"),
    });
    if (ok) setEditing(null);
  }

  async function move(list: Lesson[], index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= list.length) return;
    const order = [...list];
    [order[index], order[target]] = [order[target]!, order[index]!];
    setBusy(true);
    try {
      await Promise.all(
        order.map((l, pos) =>
          l.position === pos
            ? null
            : adminFetch("/api/admin/drop-content", {
                method: "PATCH",
                body: JSON.stringify({ type: "lesson", id: l.id, position: pos }),
              })
        )
      );
    } finally {
      setBusy(false);
    }
    await load(week);
  }

  async function addItem(e: FormEvent<HTMLFormElement>, weekday: number) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const ok = await send("POST", {
      type: "schedule",
      week_start: week,
      weekday,
      title: f.get("title"),
      description: f.get("description"),
      link_url: f.get("link_url"),
    });
    if (ok) form.reset();
  }

  async function saveItem(e: FormEvent<HTMLFormElement>, id: string) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const ok = await send("PATCH", {
      type: "schedule",
      id,
      title: f.get("title"),
      description: f.get("description"),
      link_url: f.get("link_url"),
    });
    if (ok) setEditing(null);
  }

  async function saveFormat(e: FormEvent<HTMLFormElement>, key: FormatKey) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const ok = await send("POST", {
      type: "format",
      format_key: key,
      material_url: f.get("material_url"),
      lesson_id: f.get("lesson_id"),
    });
    if (ok) setSavedFormat(key);
  }

  if (!isOwner) return null;

  const modLessons = lessons.filter((l) => l.module === mod);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <a href="/admin" className="text-xs font-medium text-violet-300/70 hover:text-violet-200">
        ← Painel
      </a>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-white">Comunidade · conteúdo</h1>
        <a
          href="/comunidade"
          target="_blank"
          rel="noreferrer"
          className="rounded-lg border border-violet-400/30 px-3 py-1.5 text-xs font-semibold text-violet-100 hover:bg-violet-500/10"
        >
          Abrir comunidade ↗
        </a>
      </div>
      <p className="mt-2 text-sm text-violet-200/70">
        Aulas (vídeos do YouTube) e cronograma semanal que os parceiros veem em /comunidade.
      </p>

      <details className="mt-4 rounded-xl border border-violet-400/20 bg-violet-950/30 px-4 py-3 text-sm text-violet-100">
        <summary className="cursor-pointer font-semibold">Configuração da Kiwify (acesso automático)</summary>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-violet-200/80">
          <li>
            Kiwify → Apps → Webhooks → criar webhook para o produto do plano, com os eventos
            Compra aprovada, Reembolso, Chargeback e Assinatura cancelada. URL:
            <code className="ml-1 break-all rounded bg-black/40 px-1.5 py-0.5 text-emerald-200">
              {origin}/api/webhooks/kiwify
            </code>
          </li>
          <li>
            Copie o token do webhook e coloque na variável de ambiente <code>KIWIFY_WEBHOOK_TOKEN</code>.
          </li>
          <li>
            Na página de obrigado / email do produto na Kiwify, coloque o link:
            <code className="ml-1 break-all rounded bg-black/40 px-1.5 py-0.5 text-emerald-200">
              {origin}
              {DROP_CLAIM_PATH}
            </code>
          </li>
        </ol>
      </details>

      <div className="mt-6 flex gap-2">
        {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setTab(t);
              setEditing(null);
            }}
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${
              tab === t ? "bg-violet-600 text-white" : "border border-white/15 text-violet-200"
            }`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}

      {tab === "aulas" ? (
        <section className="mt-6">
          <div className="flex flex-wrap gap-2">
            {LESSON_TOPICS.map((t) => (
              <button
                key={t.slug}
                type="button"
                onClick={() => {
                  setMod(t.slug as LessonModule);
                  setEditing(null);
                }}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                  mod === t.slug ? "bg-white text-zinc-900" : "border border-white/15 text-violet-200"
                }`}
              >
                {t.title} ({lessons.filter((l) => l.module === t.slug).length})
              </button>
            ))}
          </div>

          <ul className="mt-5 space-y-2">
            {modLessons.map((l, i) =>
              editing === l.id ? (
                <li key={l.id} className="rounded-xl border border-violet-400/30 p-4">
                  <form onSubmit={(e) => void saveLesson(e, l.id)} className="space-y-2">
                    <input name="title" defaultValue={l.title} required className={field} />
                    <input
                      name="youtube_url"
                      defaultValue={l.youtube_url ?? ""}
                      placeholder="Link do YouTube"
                      className={field}
                    />
                    <textarea
                      name="description"
                      defaultValue={l.description ?? ""}
                      placeholder="Descrição (opcional)"
                      rows={3}
                      className={field}
                    />
                    <div className="flex gap-2">
                      <button disabled={busy} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white">
                        Salvar
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditing(null)}
                        className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-violet-200"
                      >
                        Cancelar
                      </button>
                    </div>
                  </form>
                </li>
              ) : (
                <li
                  key={l.id}
                  className="flex flex-col gap-3 rounded-xl border border-white/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-white">
                      <span className="mr-2 text-xs text-violet-300/60">Aula {i + 1}</span>
                      {l.title}
                      {!l.published ? <span className="ml-2 text-xs text-amber-300">oculta</span> : null}
                    </p>
                    <p className="truncate text-xs text-violet-200/60">
                      {l.youtube_url ? (
                        youtubeId(l.youtube_url) ? (
                          l.youtube_url
                        ) : (
                          <span className="text-red-300">Link do YouTube inválido</span>
                        )
                      ) : (
                        "Sem vídeo"
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1.5">
                    <button type="button" disabled={busy || i === 0} onClick={() => void move(modLessons, i, -1)} className="rounded-lg border border-white/15 px-2 py-1 text-xs text-violet-100 disabled:opacity-30">
                      ↑
                    </button>
                    <button type="button" disabled={busy || i === modLessons.length - 1} onClick={() => void move(modLessons, i, 1)} className="rounded-lg border border-white/15 px-2 py-1 text-xs text-violet-100 disabled:opacity-30">
                      ↓
                    </button>
                    <button type="button" onClick={() => setEditing(l.id)} className="rounded-lg border border-white/15 px-3 py-1 text-xs text-violet-100">
                      Editar
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void send("PATCH", { type: "lesson", id: l.id, published: !l.published })}
                      className="rounded-lg border border-white/15 px-3 py-1 text-xs text-violet-100"
                    >
                      {l.published ? "Ocultar" : "Publicar"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        if (confirm(`Apagar a aula "${l.title}"?`)) {
                          void send("DELETE", undefined, `?type=lesson&id=${l.id}`);
                        }
                      }}
                      className="rounded-lg border border-red-400/30 px-3 py-1 text-xs text-red-300"
                    >
                      Apagar
                    </button>
                  </div>
                </li>
              )
            )}
          </ul>

          <form onSubmit={(e) => void addLesson(e)} className="mt-6 space-y-2 rounded-2xl border border-violet-400/20 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-violet-200">
              Nova aula em {LESSON_TOPICS.find((t) => t.slug === mod)?.title}
            </h2>
            <input name="title" required placeholder="Título da aula" className={field} />
            <input name="youtube_url" placeholder="Link do YouTube (pode ser não listado)" className={field} />
            <textarea name="description" placeholder="Descrição (opcional)" rows={3} className={field} />
            <button disabled={busy} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              Adicionar aula
            </button>
          </form>
        </section>
      ) : tab === "formatos" ? (
        <section className="mt-6">
          <p className="text-sm text-violet-200/70">
            O cronograma de cada dia é montado sozinho a partir destes 10 formatos. Cole o link da pasta do
            Drive com o material de cada um e escolha a aula que ensina. O parceiro vê os botões
            &quot;Pegar material&quot; e &quot;Ver aula&quot; no post do dia.
          </p>
          <ul className="mt-5 grid gap-3 md:grid-cols-2">
            {FORMAT_KEYS.map((key) => {
              const f = CONTENT_FORMATS[key];
              const cur = formats.find((x) => x.format_key === key);
              return (
                <li key={key} className="rounded-2xl border border-white/10 p-4">
                  <form onSubmit={(e) => void saveFormat(e, key)} className="space-y-2">
                    <p className="text-sm font-bold text-white">{f.label}</p>
                    <p className="text-xs text-violet-200/60">{EFFORT_LABELS[f.effort]} · {f.how}</p>
                    <input
                      name="material_url"
                      defaultValue={cur?.material_url ?? ""}
                      placeholder="Link da pasta do material (Drive)"
                      className={field}
                    />
                    <select name="lesson_id" defaultValue={cur?.lesson_id ?? ""} className={field}>
                      <option value="">Sem aula vinculada</option>
                      {LESSON_TOPICS.map((t) => (
                        <optgroup key={t.slug} label={t.title}>
                          {lessons
                            .filter((l) => l.module === t.slug)
                            .map((l) => (
                              <option key={l.id} value={l.id}>
                                {l.title}
                              </option>
                            ))}
                        </optgroup>
                      ))}
                    </select>
                    <button disabled={busy} className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                      {savedFormat === key ? "✓ Salvo" : "Salvar"}
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        </section>
      ) : week ? (
        <section className="mt-6">
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => void load(addDays(week, -7))} className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-violet-100">
              ← Semana anterior
            </button>
            <p className="text-sm font-semibold text-white">
              Semana de {fmt(week)} a {fmt(addDays(week, 6))}
            </p>
            <button type="button" onClick={() => void load(addDays(week, 7))} className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-violet-100">
              Próxima semana →
            </button>
            {!items.length ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void send("POST", { type: "copy-week", from: addDays(week, -7), to: week })}
                className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white"
              >
                Copiar da semana anterior
              </button>
            ) : null}
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {WEEKDAY_LABELS.map((label, i) => {
              const wd = i + 1;
              const dayItems = items.filter((it) => it.weekday === wd);
              return (
                <div key={label} className="rounded-2xl border border-white/10 p-4">
                  <p className="text-sm font-bold text-white">
                    {label} <span className="font-normal text-violet-300/60">{fmt(addDays(week, i))}</span>
                  </p>
                  <ul className="mt-3 space-y-2">
                    {dayItems.map((it) =>
                      editing === it.id ? (
                        <li key={it.id}>
                          <form onSubmit={(e) => void saveItem(e, it.id)} className="space-y-2">
                            <input name="title" defaultValue={it.title} required className={field} />
                            <textarea name="description" defaultValue={it.description ?? ""} rows={2} className={field} />
                            <input name="link_url" defaultValue={it.link_url ?? ""} placeholder="Link do conteúdo" className={field} />
                            <div className="flex gap-2">
                              <button disabled={busy} className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white">
                                Salvar
                              </button>
                              <button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-white/15 px-3 py-1 text-xs text-violet-200">
                                Cancelar
                              </button>
                            </div>
                          </form>
                        </li>
                      ) : (
                        <li key={it.id} className="rounded-lg bg-white/[0.04] px-3 py-2">
                          <p className="text-sm font-medium text-white">{it.title}</p>
                          {it.description ? <p className="mt-0.5 text-xs text-violet-200/60">{it.description}</p> : null}
                          {it.link_url ? <p className="mt-0.5 truncate text-xs text-emerald-300/80">{it.link_url}</p> : null}
                          <div className="mt-2 flex gap-2">
                            <button type="button" onClick={() => setEditing(it.id)} className="text-xs text-violet-200 hover:text-white">
                              Editar
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void send("DELETE", undefined, `?type=schedule&id=${it.id}`)}
                              className="text-xs text-red-300 hover:text-red-200"
                            >
                              Apagar
                            </button>
                          </div>
                        </li>
                      )
                    )}
                  </ul>
                  <form onSubmit={(e) => void addItem(e, wd)} className="mt-3 space-y-2">
                    <input name="title" required placeholder="O que fazer (ex.: Postar reels da camiseta X)" className={field} />
                    <textarea name="description" placeholder="Detalhes / legenda sugerida (opcional)" rows={2} className={field} />
                    <input name="link_url" placeholder="Link do conteúdo no Drive (opcional)" className={field} />
                    <button disabled={busy} className="rounded-lg border border-violet-400/40 px-3 py-1.5 text-xs font-semibold text-violet-100">
                      + Adicionar em {label.toLowerCase()}
                    </button>
                  </form>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}

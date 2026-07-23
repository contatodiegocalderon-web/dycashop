"use client";

const PAULO_DIGITS = "5511916485901";

const MESSAGE =
  "Opa gostaria de saber como funciona a separação por video chamada";

export function VideoCallCta() {
  function handleClick() {
    const enc = encodeURIComponent(MESSAGE);
    window.location.href = `https://wa.me/${PAULO_DIGITS}?text=${enc}`;
  }

  return (
    <section className="mt-12 rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-950/40 via-zinc-900/50 to-zinc-900/40 p-6 shadow-[inset_0_1px_0_rgba(52,211,153,0.12)] ring-1 ring-emerald-400/15">
      <p className="text-center text-[11px] font-medium uppercase tracking-[0.2em] text-emerald-400/90">
        agende um horário
      </p>
      <button
        type="button"
        onClick={handleClick}
        className="mt-4 w-full rounded-xl border border-emerald-400/35 bg-zinc-800/90 px-4 py-4 text-center text-sm font-bold uppercase tracking-wide text-emerald-50 shadow-inner shadow-black/25 transition hover:border-emerald-300/55 hover:bg-emerald-950/50 hover:text-white active:scale-[0.99]"
      >
        <span className="inline-flex items-center justify-center gap-2">
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]"
            aria-hidden
          />
          Separação por video chamada
        </span>
      </button>
    </section>
  );
}

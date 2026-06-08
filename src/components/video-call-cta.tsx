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
    <section className="mt-12 rounded-2xl border border-white/[0.08] bg-zinc-900/50 p-6 ring-1 ring-white/[0.04]">
      <p className="text-center text-[11px] font-medium uppercase tracking-[0.2em] text-stone-500">
        agende um horário
      </p>
      <button
        type="button"
        onClick={handleClick}
        className="mt-4 w-full rounded-xl border border-white/[0.1] bg-zinc-800/90 px-4 py-4 text-center text-sm font-bold uppercase tracking-wide text-stone-100 shadow-inner shadow-black/25 transition hover:border-white/[0.16] hover:bg-zinc-700 active:scale-[0.99]"
      >
        SEPARAÇÃO POR VIDEO CHAMADA
      </button>
    </section>
  );
}

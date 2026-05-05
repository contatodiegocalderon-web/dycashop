"use client";

const PAUL_DIGITS = "5511916485901";
const RAFAEL_DIGITS = "5511990041490";
const STORAGE_KEY = "dy_video_call_wa_round";

const MESSAGE =
  "Opa gostaria de saber como funciona a separação por video chamada";

export function VideoCallCta() {
  function handleClick() {
    let n = 0;
    try {
      n = Number.parseInt(localStorage.getItem(STORAGE_KEY) || "0", 10) || 0;
    } catch {
      n = 0;
    }
    const phone = n % 2 === 0 ? PAUL_DIGITS : RAFAEL_DIGITS;
    try {
      localStorage.setItem(STORAGE_KEY, String(n + 1));
    } catch {
      /* ignore */
    }
    const enc = encodeURIComponent(MESSAGE);
    window.location.href = `https://wa.me/${phone}?text=${enc}`;
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

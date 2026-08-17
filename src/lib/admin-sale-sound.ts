/** Som de venda / dinheiro no admin. */

const SALE_SOUND_SRC = "/sounds/sale-cash.wav?v=2";

let sharedAudio: HTMLAudioElement | null = null;

function getAudio(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (!sharedAudio) {
    sharedAudio = new Audio(SALE_SOUND_SRC);
    sharedAudio.preload = "auto";
    sharedAudio.volume = 0.85;
  }
  return sharedAudio;
}

/** Toca o som de caixa/dinheiro (falha silenciosa se o browser bloquear autoplay). */
export function playAdminSaleSound(): void {
  if (typeof window === "undefined") return;
  try {
    const audio = getAudio();
    if (!audio) return;
    audio.currentTime = 0;
    void audio.play().catch(() => {
      /* autoplay bloqueado até haver gesto do utilizador */
    });
  } catch {
    /* ignore */
  }
}

/** Pré-carrega o áudio (chamar após login / gesto). */
export function warmAdminSaleSound(): void {
  if (typeof window === "undefined") return;
  try {
    getAudio()?.load();
  } catch {
    /* ignore */
  }
}

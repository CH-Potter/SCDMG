// The compact audio button (🔊 / 🔇) and its popover: mute plus master, music and SFX sliders.

import "./audio.css";
import type { SfxName } from "./mapping";
import type { AudioSettings } from "./settings";

export interface AudioControls {
  settings: AudioSettings;
  readonly available: boolean;
  update(patch: Partial<AudioSettings>): void;
  onChange(fn: () => void): () => void;
  play(name: SfxName): void;
}

let openPop: { el: HTMLElement; close: () => void } | null = null;

const icon = (s: AudioSettings) => (s.muted || s.master === 0 ? "🔇" : s.master < 0.4 ? "🔉" : "🔊");

/** Add the audio button to `host`. The button keeps its icon in sync with the settings. */
export function mountAudioButton(host: Element, a: AudioControls): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "secondary audio-btn";
  btn.setAttribute("aria-haspopup", "dialog");
  btn.setAttribute("aria-expanded", "false");
  const sync = () => {
    btn.textContent = icon(a.settings);
    btn.title = a.available ? `Sound: ${a.settings.muted ? "muted" : "on"} (click for volume)` : "Sound isn't available in this browser";
    btn.setAttribute("aria-label", btn.title);
  };
  sync();
  const off = a.onChange(sync);
  // Stop listening once the button leaves the page (top bars re-render).
  const watch = new MutationObserver(() => {
    if (!btn.isConnected) {
      off();
      watch.disconnect();
    }
  });
  btn.dataset.owner = String(Math.random()).slice(2);
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (openPop && openPop.el.dataset.owner === btn.dataset.owner) openPop.close();
    else openPopover(btn, a);
  });
  host.appendChild(btn);
  watch.observe(document.body, { childList: true, subtree: true });
  return btn;
}

function openPopover(btn: HTMLButtonElement, a: AudioControls): void {
  openPop?.close();
  const pop = document.createElement("div");
  pop.className = "audio-pop";
  pop.dataset.owner = btn.dataset.owner;
  pop.setAttribute("role", "dialog");
  pop.setAttribute("aria-label", "Sound settings");
  const s = a.settings;
  const slider = (key: "master" | "music" | "sfx", label: string) =>
    `<label class="audio-row"><span>${label}</span><input type="range" min="0" max="100" step="1" data-k="${key}" value="${Math.round(s[key] * 100)}" aria-label="${label} volume" /><output>${Math.round(s[key] * 100)}</output></label>`;
  pop.innerHTML = `
    <div class="audio-head"><b>Sound</b>
      <label class="audio-mute"><input type="checkbox" data-k="muted" aria-label="Mute all sound" ${s.muted ? "checked" : ""} /> Mute</label>
    </div>
    ${a.available ? "" : `<p class="audio-note">Web Audio isn't available here, so the game stays silent.</p>`}
    ${slider("master", "Master")}
    ${slider("music", "Music")}
    ${slider("sfx", "Effects")}`;
  document.body.appendChild(pop);

  const place = () => {
    const r = btn.getBoundingClientRect();
    const w = pop.offsetWidth;
    pop.style.top = `${Math.round(r.bottom + 6)}px`;
    pop.style.left = `${Math.round(Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)))}px`;
  };
  place();

  let lastPreview = 0;
  pop.querySelectorAll<HTMLInputElement>("input[type=range]").forEach((inp) => {
    inp.addEventListener("input", () => {
      const k = inp.dataset.k as "master" | "music" | "sfx";
      const v = Number(inp.value) / 100;
      (inp.nextElementSibling as HTMLOutputElement).textContent = inp.value;
      a.update({ [k]: v, ...(k === "master" && v > 0 && a.settings.muted ? { muted: false } : {}) });
      const now = performance.now();
      if (k !== "music" && now - lastPreview > 140) {
        lastPreview = now;
        a.play("click");
      }
    });
  });
  const mute = pop.querySelector<HTMLInputElement>("input[data-k=muted]")!;
  mute.addEventListener("change", () => a.update({ muted: mute.checked }));
  const offChange = a.onChange(() => {
    mute.checked = a.settings.muted;
  });

  const onDoc = (e: Event) => {
    if (!pop.contains(e.target as Node) && e.target !== btn) close();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      close();
      btn.focus();
    }
  };
  const close = () => {
    pop.remove();
    offChange();
    document.removeEventListener("pointerdown", onDoc, true);
    document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("resize", place);
    btn.setAttribute("aria-expanded", "false");
    if (openPop?.el === pop) openPop = null;
  };
  document.addEventListener("pointerdown", onDoc, true);
  document.addEventListener("keydown", onKey, true);
  window.addEventListener("resize", place);
  btn.setAttribute("aria-expanded", "true");
  openPop = { el: pop, close };
  pop.querySelector<HTMLInputElement>("input")?.focus();
}

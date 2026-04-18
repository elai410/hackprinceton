/**
 * PlanForm — NL input, mic toggle, clarification reply UI.
 */

import { injectEvent } from "../api";
import type { AppState } from "../state";

export function setFormDisabled(disabled: boolean): void {
  const btn = document.getElementById("plan-btn") as HTMLButtonElement;
  const textarea = document.getElementById("nl-input") as HTMLTextAreaElement;
  btn.disabled = disabled;
  btn.textContent = disabled ? "Planning…" : "Plan";
  textarea.disabled = disabled;
}

export function showError(msg: string): void {
  const el = document.getElementById("error-msg") as HTMLElement;
  el.textContent = msg;
  el.style.display = msg ? "block" : "none";
}

export function renderClarification(questions: string[]): void {
  const box = document.getElementById("clarification-box") as HTMLElement;
  const qContainer = document.getElementById("clarification-questions") as HTMLElement;
  qContainer.innerHTML = "";

  questions.forEach((q, i) => {
    const p = document.createElement("p");
    p.textContent = q;
    const input = document.createElement("input");
    input.type = "text";
    input.id = `clarify-reply-${i}`;
    input.placeholder = "Your answer…";
    input.style.marginBottom = "10px";
    qContainer.appendChild(p);
    qContainer.appendChild(input);
  });

  box.style.display = "block";
}

export function getClarificationReplies(count: number): string[] {
  return Array.from({ length: count }, (_, i) => {
    const el = document.getElementById(`clarify-reply-${i}`) as HTMLInputElement;
    return el?.value.trim() ?? "";
  });
}

export function hideClarification(): void {
  const box = document.getElementById("clarification-box") as HTMLElement;
  box.style.display = "none";
}

// ---------------------------------------------------------------------------
// Browser mic (Web Speech API)
// ---------------------------------------------------------------------------

let recognition: SpeechRecognition | null = null;
let micActive = false;

export function setupMic(onTranscript: (text: string) => void): void {
  const btn = document.getElementById("mic-btn") as HTMLButtonElement;
  const SpeechRecognitionCtor =
    (window as Window & { SpeechRecognition?: typeof SpeechRecognition; webkitSpeechRecognition?: typeof SpeechRecognition })
      .SpeechRecognition ??
    (window as Window & { webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition;

  if (!SpeechRecognitionCtor) {
    btn.title = "Speech not supported in this browser";
    btn.disabled = true;
    return;
  }

  btn.addEventListener("click", () => {
    if (micActive) {
      recognition?.stop();
      micActive = false;
      btn.style.color = "";
      return;
    }

    recognition = new SpeechRecognitionCtor();
    recognition.continuous = false;
    recognition.lang = "en-US";
    recognition.onresult = (e: SpeechRecognitionEvent) => {
      const text = e.results[0][0].transcript;
      const textarea = document.getElementById("nl-input") as HTMLTextAreaElement;
      textarea.value = text;
      onTranscript(text);
    };
    recognition.onend = () => {
      micActive = false;
      btn.style.color = "";
    };
    recognition.start();
    micActive = true;
    btn.style.color = "#ef4444";
  });
}

// ---------------------------------------------------------------------------
// Browser keyboard → POST /events
// ---------------------------------------------------------------------------

export function setupBrowserKeyEvents(state: AppState): void {
  document.addEventListener("keydown", (e: KeyboardEvent) => {
    // Don't capture keys while typing in inputs
    const tag = (e.target as HTMLElement).tagName.toLowerCase();
    if (tag === "input" || tag === "textarea") return;

    const key = mapBrowserKey(e.key);
    const now = new Date().toISOString();
    void injectEvent({ type: "key", payload: { key, action: "press" }, timestamp: now });
  });
}

function mapBrowserKey(key: string): string {
  const map: Record<string, string> = {
    " ": "space",
    "Enter": "enter",
    "Escape": "escape",
    "Backspace": "backspace",
    "Tab": "tab",
    "ArrowUp": "up",
    "ArrowDown": "down",
    "ArrowLeft": "left",
    "ArrowRight": "right",
  };
  if (map[key]) return map[key];
  if (key.match(/^F\d{1,2}$/)) return key.toLowerCase();
  return key.toLowerCase();
}

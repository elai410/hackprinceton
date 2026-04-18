/**
 * BindingPanel — displays active bindings, configure input, and live event feed.
 */

import { deleteBinding } from "../api";
import { state } from "../state";
import type { Binding } from "../types";

export function renderBindings(bindings: Binding[]): void {
  const container = document.getElementById("binding-list") as HTMLElement;
  container.innerHTML = "";

  if (bindings.length === 0) {
    container.innerHTML = '<p style="color:#52525b;font-size:0.82rem">No active bindings. Configure some below.</p>';
    return;
  }

  bindings.forEach((b) => {
    const row = document.createElement("div");
    row.className = "binding-row";

    const triggerLabel = formatTrigger(b.trigger);
    const stepCount = b.plan.steps.length;
    row.innerHTML = `
      <span class="binding-trigger">${triggerLabel}</span>
      <span class="binding-name">${b.display_name}</span>
      <span style="color:#52525b;font-size:0.75rem">${stepCount} step${stepCount !== 1 ? "s" : ""}</span>
      <button class="binding-delete" data-id="${b.binding_id}" title="Remove binding">✕</button>
    `;

    const delBtn = row.querySelector(".binding-delete") as HTMLButtonElement;
    delBtn.addEventListener("click", () => {
      void handleDelete(b.binding_id);
    });

    container.appendChild(row);
  });
}

function formatTrigger(trigger: { type: string; payload_match: Record<string, unknown> }): string {
  const parts = Object.entries(trigger.payload_match)
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(" ");
  return parts ? `${trigger.type}[${parts}]` : trigger.type;
}

async function handleDelete(bindingId: string): Promise<void> {
  try {
    await deleteBinding(bindingId);
    state.bindings = state.bindings.filter((b) => b.binding_id !== bindingId);
    renderBindings(state.bindings);
  } catch (err) {
    showBindingError(String(err));
  }
}

export function showBindingError(msg: string): void {
  const el = document.getElementById("binding-error") as HTMLElement;
  el.textContent = msg;
  el.style.display = msg ? "block" : "none";
}

export function setBindingBtnDisabled(disabled: boolean): void {
  const btn = document.getElementById("binding-configure-btn") as HTMLButtonElement;
  btn.disabled = disabled;
  btn.textContent = disabled ? "Configuring…" : "Configure via K2";
}

export function appendEventFeed(label: string): void {
  const feed = document.getElementById("event-feed") as HTMLElement;
  const line = document.createElement("div");
  line.textContent = label;
  feed.prepend(line);
  // Keep at most 30 entries
  while (feed.children.length > 30) {
    feed.removeChild(feed.lastChild!);
  }
}

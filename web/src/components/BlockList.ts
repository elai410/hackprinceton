/**
 * BlockList — read-only list of SkillCall cards.
 * Shows plan preview before execution and live trace status during/after.
 */

import type { Plan, StepResult, StepStatus } from "../types";

function statusBadge(status: StepStatus): string {
  return `<span class="status-badge status-${status}">${status}</span>`;
}

function argsLabel(args: Record<string, unknown>): string {
  const entries = Object.entries(args);
  if (entries.length === 0) return "";
  return entries.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(", ");
}

export function renderPlanPreview(plan: Plan): void {
  const container = document.getElementById("block-list") as HTMLElement;
  container.innerHTML = "";

  plan.steps.forEach((step, i) => {
    const card = document.createElement("div");
    card.className = "block-card";
    card.id = `block-${i}`;
    const label = step.skill_id.replace(/_/g, " ");
    const args = argsLabel(step.arguments);
    card.innerHTML = `
      <span class="step-num">${i + 1}</span>
      <span class="skill-name">${label}</span>
      ${args ? `<span class="skill-args">${args}</span>` : ""}
      ${statusBadge("pending")}
    `;
    container.appendChild(card);
  });

  const section = document.getElementById("plan-preview-section") as HTMLElement;
  section.style.display = "block";
}

export function updateStepStatus(result: StepResult): void {
  const card = document.getElementById(`block-${result.index}`);
  if (!card) return;
  const badge = card.querySelector(".status-badge");
  if (badge) {
    badge.className = `status-badge status-${result.status}`;
    badge.textContent = result.status;
  }
  if (result.detail) {
    let detailEl = card.querySelector(".step-detail") as HTMLElement | null;
    if (!detailEl) {
      detailEl = document.createElement("span");
      detailEl.className = "step-detail";
      detailEl.style.cssText = "font-size:0.72rem;color:#52525b;margin-left:4px";
      card.appendChild(detailEl);
    }
    detailEl.textContent = result.detail;
  }
}

export function clearBlockList(): void {
  const container = document.getElementById("block-list") as HTMLElement;
  container.innerHTML = "";
  const section = document.getElementById("plan-preview-section") as HTMLElement;
  section.style.display = "none";
}

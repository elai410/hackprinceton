/**
 * ReasoningStream — shows the planner's reasoning text.
 * No markup logic: the box is in index.html; this module just controls it.
 */

export function showReasoning(text: string): void {
  const box = document.getElementById("reasoning-box") as HTMLElement;
  box.textContent = text;
  box.style.display = text ? "block" : "none";
}

export function clearReasoning(): void {
  showReasoning("");
}

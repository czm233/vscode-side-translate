import { escapeHtml } from "../utils/html";

export function renderText(text: string): string {
  return `<pre>${escapeHtml(text)}</pre>`;
}

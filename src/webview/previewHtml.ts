import type * as vscode from "vscode";
import type { SupportedDocumentType } from "../services/detectDocumentType";
import type { TranslationSegment } from "../services/segments";
import { escapeHtml } from "../utils/html";

interface PreviewHtmlInput {
  webview: vscode.Webview;
  sourceName: string;
  providerName: string;
  directionLabel: string;
  documentType: SupportedDocumentType;
  segments: TranslationSegment[];
}

export function getPreviewHtml(input: PreviewHtmlInput): string {
  const nonce = getNonce();
  const body = input.segments.map(renderSegment).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${
    input.webview.cspSource
  } 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>${escapeHtml(input.sourceName)} Translation</title>
  <style>
    :root {
      color-scheme: light dark;
    }

    body {
      box-sizing: border-box;
      min-height: 100vh;
      margin: 0;
      padding: 24px;
      color: var(--vscode-editor-foreground);
      background: var(--vscode-editor-background);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      line-height: 1.68;
    }

    header {
      position: sticky;
      top: 0;
      z-index: 10;
      margin: -24px -24px 22px;
      padding: 18px 24px 14px;
      background: var(--vscode-editor-background);
      border-bottom: 1px solid var(--vscode-panel-border);
    }

    h1 {
      margin: 0 0 8px;
      font-size: 18px;
      font-weight: 600;
    }

    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 16px;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
    }

    .hint {
      margin-top: 10px;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
    }

    main {
      max-width: 820px;
      padding-bottom: 40px;
    }

    .segment {
      position: relative;
      margin: 0 0 13px;
      padding: 1px 46px 1px 0;
      border-radius: 5px;
    }

    .segment.is-done {
      background: color-mix(in srgb, var(--vscode-testing-iconPassed) 10%, transparent);
    }

    .segment.is-error {
      background: color-mix(in srgb, var(--vscode-testing-iconFailed) 10%, transparent);
    }

    .segment[data-kind="heading"] {
      margin-top: 22px;
      margin-bottom: 12px;
    }

    textarea {
      box-sizing: border-box;
      display: block;
      width: 100%;
      min-height: 44px;
      resize: none;
      padding: 0;
      border: 0;
      border-radius: 0;
      outline: none;
      color: var(--vscode-editor-foreground);
      background: transparent;
      font: inherit;
      line-height: inherit;
      overflow: hidden;
    }

    textarea:focus {
      box-shadow: inset 3px 0 0 var(--vscode-focusBorder);
      padding-left: 10px;
      background: color-mix(in srgb, var(--vscode-list-hoverBackground) 45%, transparent);
    }

    .segment[data-kind="heading"] textarea {
      font-size: 1.28em;
      font-weight: 650;
      line-height: 1.35;
    }

    .segment[data-kind="list"],
    .segment[data-kind="quote"] {
      padding-left: 18px;
    }

    .segment[data-kind="list"]::before {
      content: "•";
      position: absolute;
      left: 2px;
      top: 1px;
      color: var(--vscode-descriptionForeground);
    }

    .segment[data-kind="quote"] {
      border-left: 3px solid var(--vscode-textBlockQuote-border);
      padding-left: 12px;
      color: var(--vscode-textBlockQuote-foreground);
    }

    pre {
      overflow: auto;
      margin: 14px 0 16px;
      padding: 12px;
      border-radius: 6px;
      background: var(--vscode-textCodeBlock-background);
      white-space: pre-wrap;
      word-break: break-word;
      font-family: var(--vscode-editor-font-family);
      font-size: var(--vscode-editor-font-size);
    }

    .actions {
      position: absolute;
      top: 0;
      right: 0;
      display: flex;
      align-items: center;
      gap: 6px;
      opacity: 0;
      transform: translateX(4px);
      transition: opacity 120ms ease, transform 120ms ease;
      pointer-events: none;
    }

    .segment:hover .actions,
    .segment:focus-within .actions,
    .segment.is-done .actions,
    .segment.is-error .actions,
    .segment.is-busy .actions {
      opacity: 1;
      transform: translateX(0);
      pointer-events: auto;
    }

    button {
      min-width: 34px;
      min-height: 24px;
      padding: 2px 8px;
      border: 1px solid var(--vscode-button-border, transparent);
      border-radius: 4px;
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      cursor: pointer;
      font: inherit;
      font-size: 11px;
      line-height: 1.3;
    }

    button:hover {
      background: var(--vscode-button-hoverBackground);
    }

    button:disabled {
      cursor: wait;
      opacity: 0.65;
    }

    .status {
      position: absolute;
      top: 28px;
      right: 0;
      max-width: 140px;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
      text-align: right;
      white-space: normal;
    }

    .readonly {
      opacity: 0.88;
    }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(input.sourceName)}</h1>
    <div class="meta">
      <span>${escapeHtml(input.directionLabel)}</span>
      <span>${escapeHtml(input.providerName)}</span>
      <span>${escapeHtml(input.documentType)}</span>
    </div>
    <div class="hint">直接修改右侧中文块，点击“回译并替换原文”，左侧英文原文会自动定位并替换。代码块不可编辑。</div>
  </header>
  <main>${body}</main>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const clearTimers = new Map();

    function resizeTextarea(textarea) {
      textarea.style.height = "auto";
      textarea.style.height = Math.max(44, textarea.scrollHeight) + "px";
    }

    document.querySelectorAll("textarea").forEach((textarea) => {
      resizeTextarea(textarea);
      textarea.addEventListener("input", () => resizeTextarea(textarea));
    });

    document.querySelectorAll("[data-action='replace']").forEach((button) => {
      button.addEventListener("click", () => {
        const segment = button.closest("[data-segment-id]");
        const textarea = segment.querySelector("textarea");
        const status = segment.querySelector("[data-status]");
        button.disabled = true;
        segment.classList.add("is-busy");
        status.textContent = "处理中";
        segment.classList.remove("is-done", "is-error");
        vscode.postMessage({
          type: "replaceSegment",
          segmentId: segment.dataset.segmentId,
          text: textarea.value
        });
      });
    });

    window.addEventListener("message", (event) => {
      const message = event.data;
      const segment = document.querySelector("[data-segment-id='" + message.segmentId + "']");
      if (!segment) return;

      const button = segment.querySelector("[data-action='replace']");
      const status = segment.querySelector("[data-status]");
      if (button) button.disabled = false;
      segment.classList.remove("is-busy");
      if (clearTimers.has(message.segmentId)) {
        clearTimeout(clearTimers.get(message.segmentId));
        clearTimers.delete(message.segmentId);
      }

      if (message.type === "replaceSucceeded") {
        segment.classList.add("is-done");
        status.textContent = "已替换";
        const source = segment.querySelector("[data-source]");
        if (source) source.textContent = message.sourceText;
        clearTimers.set(message.segmentId, setTimeout(() => {
          segment.classList.remove("is-done");
          status.textContent = "";
          clearTimers.delete(message.segmentId);
        }, 1800));
      }

      if (message.type === "replaceFailed") {
        segment.classList.add("is-error");
        status.textContent = "失败";
        if (button) button.title = message.error;
      }
    });
  </script>
</body>
</html>`;
}

function renderSegment(segment: TranslationSegment): string {
  if (!segment.editable) {
    return `<section class="segment readonly" data-kind="${escapeHtml(segment.kind)}" data-segment-id="${escapeHtml(segment.id)}">
      <pre>${escapeHtml(segment.originalText)}</pre>
    </section>`;
  }

  return `<section class="segment" data-kind="${escapeHtml(segment.kind)}" data-segment-id="${escapeHtml(segment.id)}">
    <textarea spellcheck="false">${escapeHtml(segment.translatedText)}</textarea>
    <div class="actions">
      <button type="button" data-action="replace" title="回译成英文并替换左侧原文">回译</button>
      <span class="status" data-status></span>
    </div>
    <span hidden data-source>${escapeHtml(segment.sourceText)}</span>
  </section>`;
}

function getNonce(): string {
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";

  for (let index = 0; index < 32; index += 1) {
    nonce += possible.charAt(Math.floor(Math.random() * possible.length));
  }

  return nonce;
}

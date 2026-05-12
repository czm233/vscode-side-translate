import * as path from "path";
import * as vscode from "vscode";
import { detectDocumentType } from "../services/detectDocumentType";
import { detectLanguageDirection } from "../services/detectLanguageDirection";
import { buildTranslationSegments, type TranslationSegment } from "../services/segments";
import { createTranslatorProvider } from "../services/translation/createTranslatorProvider";
import { getPreviewHtml } from "../webview/previewHtml";

const previewPanels = new Map<string, vscode.WebviewPanel>();
const previewStates = new Map<string, PreviewState>();

interface PreviewState {
  documentUri: vscode.Uri;
  direction: ReturnType<typeof detectLanguageDirection>;
  segments: TranslationSegment[];
}

interface ReplaceSegmentMessage {
  type: "replaceSegment";
  segmentId: string;
  text: string;
}

export async function openTranslatePreview(
  context: vscode.ExtensionContext,
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showInformationMessage("Open a Markdown or text document before translating.");
    return;
  }

  const { document, selection } = editor;
  const documentType = detectDocumentType(document);
  if (!documentType) {
    vscode.window.showWarningMessage("Side Translate currently supports Markdown and plain text only.");
    return;
  }

  const sourceText = selection.isEmpty ? document.getText() : document.getText(selection);
  if (!sourceText.trim()) {
    vscode.window.showInformationMessage("There is no text to translate.");
    return;
  }

  const config = vscode.workspace.getConfiguration("vscode-side-translate");
  const maxCharacters = config.get<number>("maxCharacters", 8000);
  if (sourceText.length > maxCharacters) {
    vscode.window.showWarningMessage(
      `The selected content has ${sourceText.length} characters. The current limit is ${maxCharacters}.`,
    );
    return;
  }

  const direction = detectLanguageDirection(sourceText);
  const provider = createTranslatorProvider(config);
  let segments: TranslationSegment[];

  try {
    segments = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Translating ${direction.source.toUpperCase()} to ${direction.target.toUpperCase()}`,
        cancellable: false,
      },
      (progress) =>
        buildTranslationSegments({
          document,
          selection,
          documentType,
          direction,
          provider,
          progress,
        }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Translation failed: ${message}`);
    return;
  }

  const sourceName = document.isUntitled ? "Untitled" : path.basename(document.fileName);
  const panelKey = getPanelKey(document, selection);
  let panel = previewPanels.get(panelKey);
  if (!panel) {
    panel = vscode.window.createWebviewPanel(
      "sideTranslatePreview",
      `Translate: ${sourceName}`,
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );
    previewPanels.set(panelKey, panel);
    panel.onDidDispose(() => {
      previewPanels.delete(panelKey);
      previewStates.delete(panelKey);
    }, undefined, context.subscriptions);
    const createdPanel = panel;
    panel.webview.onDidReceiveMessage(
      (message: ReplaceSegmentMessage) => handleWebviewMessage(panelKey, createdPanel, message),
      undefined,
      context.subscriptions,
    );
  }

  previewStates.set(panelKey, {
    documentUri: document.uri,
    direction,
    segments,
  });
  panel.title = `Translate: ${sourceName}`;
  panel.webview.html = getPreviewHtml({
    webview: panel.webview,
    sourceName,
    providerName: provider.name,
    directionLabel: `${direction.source.toUpperCase()} -> ${direction.target.toUpperCase()}`,
    documentType,
    segments,
  });
  panel.reveal(vscode.ViewColumn.Beside, false);
}

async function handleWebviewMessage(
  panelKey: string,
  panel: vscode.WebviewPanel,
  message: ReplaceSegmentMessage,
): Promise<void> {
  if (message.type !== "replaceSegment") {
    return;
  }

  const state = previewStates.get(panelKey);
  const segment = state?.segments.find((item) => item.id === message.segmentId);
  if (!state || !segment || !segment.editable) {
    panel.webview.postMessage({
      type: "replaceFailed",
      segmentId: message.segmentId,
      error: "Segment is no longer available. Please translate the document again.",
    });
    return;
  }

  try {
    const document = await getDocument(state.documentUri);
    const range = resolveSegmentRange(document, segment);
    if (!range) {
      throw new Error("Original text changed. Please run full translation again before replacing.");
    }

    const config = vscode.workspace.getConfiguration("vscode-side-translate");
    const provider = createTranslatorProvider(config);
    const translatedBack = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Back translating and replacing source",
        cancellable: false,
      },
      () =>
        provider.translate({
          text: message.text,
          source: state.direction.target,
          target: state.direction.source,
          format: "text",
        }),
    );
    const replacementText = `${segment.prefix}${translatedBack}${segment.suffix}`;
    const oldStartOffset = document.offsetAt(range.start);
    const oldEndOffset = document.offsetAt(range.end);
    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, range, replacementText);
    const applied = await vscode.workspace.applyEdit(edit);
    if (!applied) {
      throw new Error("VS Code rejected the source replacement.");
    }

    await revealReplacement(document, oldStartOffset, replacementText);
    updateSegmentOffsets(state.segments, segment.id, oldStartOffset, oldEndOffset, replacementText);
    panel.webview.postMessage({
      type: "replaceSucceeded",
      segmentId: segment.id,
      sourceText: translatedBack,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Replace failed: ${errorMessage}`);
    panel.webview.postMessage({
      type: "replaceFailed",
      segmentId: message.segmentId,
      error: errorMessage,
    });
  }
}

async function getDocument(uri: vscode.Uri): Promise<vscode.TextDocument> {
  const existingDocument = vscode.workspace.textDocuments.find(
    (document) => document.uri.toString() === uri.toString(),
  );

  return existingDocument ?? vscode.workspace.openTextDocument(uri);
}

function resolveSegmentRange(
  document: vscode.TextDocument,
  segment: TranslationSegment,
): vscode.Range | undefined {
  const documentText = document.getText();
  const directStart = Math.min(segment.startOffset, documentText.length);
  const directEnd = Math.min(segment.endOffset, documentText.length);
  const directRange = new vscode.Range(
    document.positionAt(directStart),
    document.positionAt(directEnd),
  );
  if (document.getText(directRange) === segment.originalText) {
    return directRange;
  }

  const localStart = Math.max(0, segment.startOffset - 1000);
  const localEnd = Math.min(documentText.length, segment.endOffset + 1000);
  const localIndex = documentText.slice(localStart, localEnd).indexOf(segment.originalText);
  const foundIndex = localIndex >= 0
    ? localStart + localIndex
    : documentText.indexOf(segment.originalText);

  if (foundIndex < 0) {
    return undefined;
  }

  return new vscode.Range(
    document.positionAt(foundIndex),
    document.positionAt(foundIndex + segment.originalText.length),
  );
}

async function revealReplacement(
  document: vscode.TextDocument,
  startOffset: number,
  replacementText: string,
): Promise<void> {
  const editor = await vscode.window.showTextDocument(document, vscode.ViewColumn.One);
  const range = new vscode.Range(
    document.positionAt(startOffset),
    document.positionAt(startOffset + replacementText.length),
  );
  editor.selection = new vscode.Selection(range.start, range.end);
  editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
}

function updateSegmentOffsets(
  segments: TranslationSegment[],
  replacedSegmentId: string,
  oldStartOffset: number,
  oldEndOffset: number,
  replacementText: string,
): void {
  const delta = replacementText.length - (oldEndOffset - oldStartOffset);

  for (const segment of segments) {
    if (segment.id === replacedSegmentId) {
      segment.startOffset = oldStartOffset;
      segment.endOffset = oldStartOffset + replacementText.length;
      segment.originalText = replacementText;
      segment.sourceText = segment.prefix
        ? replacementText.slice(segment.prefix.length)
        : replacementText;
      continue;
    }

    if (segment.startOffset >= oldEndOffset) {
      segment.startOffset += delta;
      segment.endOffset += delta;
    }
  }
}

function getPanelKey(document: vscode.TextDocument, selection: vscode.Selection): string {
  if (selection.isEmpty) {
    return `${document.uri.toString()}#full`;
  }

  return [
    document.uri.toString(),
    selection.start.line,
    selection.start.character,
    selection.end.line,
    selection.end.character,
  ].join("#");
}

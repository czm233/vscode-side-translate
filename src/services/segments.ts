import type * as vscode from "vscode";
import { hasTranslatableText, type LanguageDirection } from "./detectLanguageDirection";
import type { SupportedDocumentType } from "./detectDocumentType";
import type { TranslatorProvider } from "./translation/TranslatorProvider";

export interface TranslationSegment {
  id: string;
  kind: "heading" | "paragraph" | "list" | "quote" | "code" | "text";
  editable: boolean;
  startOffset: number;
  endOffset: number;
  originalText: string;
  sourceText: string;
  translatedText: string;
  prefix: string;
  suffix: string;
}

interface BuildTranslationSegmentsInput {
  document: vscode.TextDocument;
  selection: vscode.Selection;
  documentType: SupportedDocumentType;
  direction: LanguageDirection;
  provider: TranslatorProvider;
  progress?: vscode.Progress<{
    message?: string;
    increment?: number;
  }>;
}

interface SourceSegment {
  id: string;
  kind: TranslationSegment["kind"];
  editable: boolean;
  startOffset: number;
  endOffset: number;
  originalText: string;
  sourceText: string;
  prefix: string;
  suffix: string;
}

interface LineInfo {
  text: string;
  start: number;
  end: number;
  next: number;
}

export async function buildTranslationSegments(
  input: BuildTranslationSegmentsInput,
): Promise<TranslationSegment[]> {
  const baseOffset = input.selection.isEmpty ? 0 : input.document.offsetAt(input.selection.start);
  const sourceText = input.selection.isEmpty
    ? input.document.getText()
    : input.document.getText(input.selection);
  const sourceSegments =
    input.documentType === "markdown"
      ? segmentMarkdown(sourceText, baseOffset)
      : segmentPlainText(sourceText, baseOffset);
  const editableSegments = sourceSegments.filter(
    (segment) => segment.editable && hasTranslatableText(segment.sourceText),
  );
  let completed = 0;

  input.progress?.report({ message: `Translating ${editableSegments.length} editable blocks` });

  const translatedById = new Map<string, string>();
  const format = input.documentType === "markdown" ? "markdown" : "text";

  if (input.provider.translateBatch) {
    const chunks = chunkSegments(editableSegments, 40, 6000);
    await mapLimit(chunks, 2, async (chunk) => {
      const translated = await input.provider.translateBatch!(
        chunk.map((segment) => ({
          text: segment.sourceText,
          source: input.direction.source,
          target: input.direction.target,
          format,
        })),
      );
      translated.forEach((value, index) => translatedById.set(chunk[index].id, value));
      completed += chunk.length;
      input.progress?.report({ message: `Translated ${completed}/${editableSegments.length}` });
    });
  } else {
    await mapLimit(editableSegments, 4, async (segment) => {
      const translated = await input.provider.translate({
        text: segment.sourceText,
        source: input.direction.source,
        target: input.direction.target,
        format,
      });
      translatedById.set(segment.id, translated);
      completed += 1;
      input.progress?.report({ message: `Translated ${completed}/${editableSegments.length}` });
    });
  }

  return sourceSegments.map((segment) => ({
    ...segment,
    translatedText: translatedById.get(segment.id) ?? segment.sourceText,
  }));
}

function chunkSegments(
  segments: SourceSegment[],
  maxItems: number,
  maxCharacters: number,
): SourceSegment[][] {
  const chunks: SourceSegment[][] = [];
  let currentChunk: SourceSegment[] = [];
  let currentCharacters = 0;

  for (const segment of segments) {
    const segmentCharacters = segment.sourceText.length;
    if (
      currentChunk.length > 0 &&
      (currentChunk.length >= maxItems || currentCharacters + segmentCharacters > maxCharacters)
    ) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentCharacters = 0;
    }

    currentChunk.push(segment);
    currentCharacters += segmentCharacters;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

function segmentPlainText(text: string, baseOffset: number): SourceSegment[] {
  const lines = getLines(text);
  const segments: SourceSegment[] = [];
  let index = 0;
  let id = 0;

  while (index < lines.length) {
    while (index < lines.length && !lines[index].text.trim()) {
      index += 1;
    }
    if (index >= lines.length) {
      break;
    }

    const startLine = lines[index];
    let endLine = startLine;
    index += 1;
    while (index < lines.length && lines[index].text.trim()) {
      endLine = lines[index];
      index += 1;
    }

    const originalText = text.slice(startLine.start, endLine.end);
    segments.push({
      id: `seg-${id++}`,
      kind: "text",
      editable: true,
      startOffset: baseOffset + startLine.start,
      endOffset: baseOffset + endLine.end,
      originalText,
      sourceText: originalText,
      prefix: "",
      suffix: "",
    });
  }

  return segments;
}

function segmentMarkdown(text: string, baseOffset: number): SourceSegment[] {
  const lines = getLines(text);
  const segments: SourceSegment[] = [];
  let index = 0;
  let id = 0;

  const nextId = () => `seg-${id++}`;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.text.trim()) {
      index += 1;
      continue;
    }

    const fenceMatch = line.text.match(/^\s*(```+|~~~+)/);
    if (fenceMatch) {
      const marker = fenceMatch[1].startsWith("`") ? "`" : "~";
      const startLine = line;
      let endLine = line;
      index += 1;
      while (index < lines.length) {
        endLine = lines[index];
        const closeMatch = endLine.text.match(/^\s*(```+|~~~+)/);
        index += 1;
        if (closeMatch && closeMatch[1].startsWith(marker)) {
          break;
        }
      }
      const originalText = text.slice(startLine.start, endLine.end);
      segments.push({
        id: nextId(),
        kind: "code",
        editable: false,
        startOffset: baseOffset + startLine.start,
        endOffset: baseOffset + endLine.end,
        originalText,
        sourceText: originalText,
        prefix: "",
        suffix: "",
      });
      continue;
    }

    const structural = getStructuralLine(line.text);
    if (structural) {
      segments.push({
        id: nextId(),
        kind: structural.kind,
        editable: Boolean(structural.content.trim()),
        startOffset: baseOffset + line.start,
        endOffset: baseOffset + line.end,
        originalText: line.text,
        sourceText: structural.content,
        prefix: structural.prefix,
        suffix: "",
      });
      index += 1;
      continue;
    }

    const startLine = line;
    let endLine = line;
    index += 1;
    while (index < lines.length) {
      const nextLine = lines[index];
      if (!nextLine.text.trim() || nextLine.text.match(/^\s*(```+|~~~+)/) || getStructuralLine(nextLine.text)) {
        break;
      }
      endLine = nextLine;
      index += 1;
    }

    const originalText = text.slice(startLine.start, endLine.end);
    segments.push({
      id: nextId(),
      kind: "paragraph",
      editable: true,
      startOffset: baseOffset + startLine.start,
      endOffset: baseOffset + endLine.end,
      originalText,
      sourceText: originalText,
      prefix: "",
      suffix: "",
    });
  }

  return segments;
}

function getStructuralLine(
  line: string,
): { kind: TranslationSegment["kind"]; prefix: string; content: string } | undefined {
  const heading = line.match(/^(\s{0,3}#{1,6}\s+)(.+)$/);
  if (heading) {
    return { kind: "heading", prefix: heading[1], content: heading[2] };
  }

  const taskList = line.match(/^(\s*[-+*]\s+\[[ xX]\]\s+)(.+)$/);
  if (taskList) {
    return { kind: "list", prefix: taskList[1], content: taskList[2] };
  }

  const list = line.match(/^(\s*(?:[-+*]|\d+[.)])\s+)(.+)$/);
  if (list) {
    return { kind: "list", prefix: list[1], content: list[2] };
  }

  const quote = line.match(/^(\s*(?:>\s*)+)(.+)$/);
  if (quote) {
    return { kind: "quote", prefix: quote[1], content: quote[2] };
  }

  return undefined;
}

function getLines(text: string): LineInfo[] {
  const lines: LineInfo[] = [];
  let start = 0;

  while (start < text.length) {
    const newlineIndex = text.indexOf("\n", start);
    const next = newlineIndex === -1 ? text.length : newlineIndex + 1;
    const end = newlineIndex === -1
      ? text.length
      : newlineIndex > start && text[newlineIndex - 1] === "\r"
        ? newlineIndex - 1
        : newlineIndex;
    lines.push({
      text: text.slice(start, end),
      start,
      end,
      next,
    });
    start = next;
  }

  return lines;
}

async function mapLimit<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      await worker(item);
    }
  });

  await Promise.all(workers);
}

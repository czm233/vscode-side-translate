import type * as vscode from "vscode";
import {
  type LanguageDirection,
  hasTranslatableText,
} from "./detectLanguageDirection";
import type { SupportedDocumentType } from "./detectDocumentType";
import type { TranslatorProvider } from "./translation/TranslatorProvider";

interface TranslateDocumentContentInput {
  text: string;
  documentType: SupportedDocumentType;
  direction: LanguageDirection;
  provider: TranslatorProvider;
  progress?: vscode.Progress<{
    message?: string;
    increment?: number;
  }>;
}

export async function translateDocumentContent(
  input: TranslateDocumentContentInput,
): Promise<string> {
  if (!hasTranslatableText(input.text)) {
    return input.text;
  }

  input.progress?.report({ message: "Preparing content" });

  if (input.documentType === "markdown") {
    return translateMarkdown(input);
  }

  return translateWholeText(input);
}

async function translateWholeText(input: TranslateDocumentContentInput): Promise<string> {
  input.progress?.report({ message: "Translating in one request" });
  return input.provider.translate({
    text: input.text,
    source: input.direction.source,
    target: input.direction.target,
    format: "text",
  });
}

async function translateMarkdown(
  input: TranslateDocumentContentInput,
): Promise<string> {
  const protectedMarkdown = protectMarkdown(input.text);
  input.progress?.report({ message: "Translating in one request" });
  const translated = await input.provider.translate({
    text: protectedMarkdown.text,
    source: input.direction.source,
    target: input.direction.target,
    format: "markdown",
  });

  return restoreProtectedMarkdown(translated, protectedMarkdown.replacements);
}

interface ProtectedMarkdown {
  text: string;
  replacements: Map<string, string>;
}

function protectMarkdown(markdown: string): ProtectedMarkdown {
  const replacements = new Map<string, string>();
  let replacementIndex = 0;

  const createToken = (value: string): string => {
    const token = `STTOKEN${replacementIndex}TOKENST`;
    replacementIndex += 1;
    replacements.set(token, value);
    return token;
  };

  const newline = markdown.includes("\r\n") ? "\r\n" : "\n";
  const lines = markdown.split(/\r?\n/);
  const protectedLines: string[] = [];
  let inFence = false;
  let fenceMarker: "`" | "~" | undefined;
  let fenceLines: string[] = [];

  for (const line of lines) {
    const fenceMatch = line.match(/^\s*(```+|~~~+)/);
    if (fenceMatch) {
      const marker = fenceMatch[1].startsWith("`") ? "`" : "~";
      if (!inFence) {
        inFence = true;
        fenceMarker = marker;
        fenceLines = [line];
        continue;
      } else if (fenceMarker === marker) {
        inFence = false;
        fenceMarker = undefined;
        fenceLines.push(line);
        protectedLines.push(createToken(fenceLines.join(newline)));
        fenceLines = [];
        continue;
      }
    }

    if (inFence) {
      fenceLines.push(line);
      continue;
    }

    protectedLines.push(protectMarkdownLine(line, createToken));
  }

  if (fenceLines.length > 0) {
    protectedLines.push(createToken(fenceLines.join(newline)));
  }

  return {
    text: protectedLines.join(newline),
    replacements,
  };
}

function protectMarkdownLine(
  line: string,
  createToken: (value: string) => string,
): string {
  return line
    .replace(/`[^`\n]+`/g, (value) => createToken(value))
    .replace(/https?:\/\/[^\s)\]>]+/g, (value) => createToken(value));
}

function restoreProtectedMarkdown(
  translatedMarkdown: string,
  replacements: Map<string, string>,
): string {
  let restored = translatedMarkdown;

  for (const [token, value] of replacements) {
    restored = restored.split(token).join(value);
  }

  return restored;
}

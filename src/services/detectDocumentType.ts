import * as path from "path";
import * as vscode from "vscode";

export type SupportedDocumentType = "markdown" | "text";

export function detectDocumentType(
  document: vscode.TextDocument,
): SupportedDocumentType | undefined {
  if (document.languageId === "markdown") {
    return "markdown";
  }

  if (document.languageId === "plaintext") {
    return "text";
  }

  const ext = path.extname(document.fileName).toLowerCase();
  if (ext === ".md") {
    return "markdown";
  }

  if (ext === ".txt") {
    return "text";
  }

  return undefined;
}

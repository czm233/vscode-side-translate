import * as vscode from "vscode";
import { openTranslatePreview } from "./commands/openTranslatePreview";

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "vscode-side-translate.openTranslatePreview",
      () => openTranslatePreview(context),
    ),
  );
}

export function deactivate(): void {}

import * as assert from "assert";
import * as vscode from "vscode";

export async function run(): Promise<void> {
  console.log("Running Side Translate VS Code smoke test.");

  const document = await vscode.workspace.openTextDocument({
    content: "# Hello\n\nThis is a VS Code extension smoke test.",
    language: "markdown",
  });
  await vscode.window.showTextDocument(document, vscode.ViewColumn.One);

  await vscode.commands.executeCommand("vscode-side-translate.openTranslatePreview");

  const previewTab = await waitFor(() =>
    vscode.window.tabGroups.all
      .flatMap((group) => group.tabs)
      .find(
        (tab) =>
          tab.label === "Translate: Untitled" &&
          tab.input instanceof vscode.TabInputWebview,
      ),
  );

  assert.ok(previewTab, "Expected a Side Translate webview preview tab to open.");
  console.log("Side Translate VS Code smoke test passed.");
}

async function waitFor<T>(
  getValue: () => T | undefined,
  timeoutMs = 10000,
  intervalMs = 100,
): Promise<T | undefined> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const value = getValue();
    if (value) {
      return value;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return undefined;
}

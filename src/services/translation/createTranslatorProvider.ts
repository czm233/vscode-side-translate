import type * as vscode from "vscode";
import { BingTranslateProvider } from "./BingTranslateProvider";
import { DeepLFreeProvider } from "./DeepLFreeProvider";
import { FastestProvider } from "./FastestProvider";
import { GoogleTranslateProvider } from "./GoogleTranslateProvider";
import type { TranslatorProvider } from "./TranslatorProvider";

export function createTranslatorProvider(
  config: vscode.WorkspaceConfiguration,
): TranslatorProvider {
  const timeoutMs = config.get<number>("timeoutMs", 15000);
  const providerName = config.get<string>("provider", "fastest");

  if (providerName === "bing") {
    return new BingTranslateProvider({ timeoutMs });
  }

  if (providerName === "google") {
    return new GoogleTranslateProvider({ timeoutMs });
  }

  if (providerName === "deepl") {
    return new DeepLFreeProvider({ timeoutMs });
  }

  return new FastestProvider({
    providers: [
      new BingTranslateProvider({ timeoutMs }),
      new DeepLFreeProvider({ timeoutMs }),
    ],
  });
}
